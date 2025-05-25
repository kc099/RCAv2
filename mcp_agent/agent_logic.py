"""
LangGraph Agent Logic for Text-to-SQL Generation

This module implements a reactive text-to-SQL agent that iteratively generates 
and refines SQL queries based on user's natural language input and database schema.
"""

import os
import re
import json
import logging
from typing import TypedDict, List, Dict, Any, Optional
from langgraph.graph import StateGraph, END
from anthropic import Anthropic
from django.conf import settings
from core.models import SQLNotebook, DatabaseConnection, SQLCell
from core.db_handlers import execute_query, get_schema_for_connection
from .models import AgentConversation, ChatMessage

logger = logging.getLogger(__name__)

# Agent state management
user_agents = {}  # In-memory storage for user agents


class AgentState(TypedDict):
    """State structure for the LangGraph agent"""
    messages: List[Dict[str, Any]]  # Chat message history
    current_sql_query: Optional[str]  # Currently generated SQL
    database_schema: str  # DB schema for context
    user_nl_query: str  # Original natural language query
    max_iterations: int  # Maximum iterations allowed
    current_iteration: int  # Current iteration count
    active_connection_id: int  # Database connection ID
    current_notebook_id: int  # Notebook ID for SQL cell creation
    user_object: Any  # User object
    final_sql: Optional[str]  # Final SQL when task is complete
    should_continue: bool  # Whether to continue iterating
    error_message: Optional[str]  # Last error message if any


def get_system_prompt(database_schema: str, user_nl_query: str, iteration: int = 0) -> str:
    """Generate the system prompt for the Anthropic API"""
    
    base_prompt = f"""You are an expert SQL generation assistant. Your role is to help users generate accurate SQL queries based on their natural language requests and the provided database schema.

**Database Schema:**
{database_schema}

**User's Request:**
{user_nl_query}

**Current Iteration:** {iteration}

**Your Workflow:**
1. Analyze the user's request and the database schema carefully
2. Generate SQL queries that accurately fulfill the request  
3. When you have a SQL query ready for execution, respond with the SQL enclosed in ```sql ... ``` blocks
4. If SQL execution fails, analyze the error and provide corrected SQL
5. If results look correct, say "This is the final query" to complete the task
6. If results are unexpected, refine the query based on feedback

**Important Guidelines:**
- Use the exact table and column names from the schema
- Consider relationships between tables when writing JOINs
- Be careful with data types and NULL handling
- Start simple and iterate if needed
- Always validate your SQL syntax
- Provide clear, readable SQL with proper formatting

**Termination:**
- When you're confident the SQL correctly answers the user's question, say "This is the final query" 
- If you've provided the same SQL twice, the task is complete

**Output Format:**
- Always include: ```sql\nYOUR_SQL_HERE\n```
- Add explanation before or after the SQL block
- For final answers: Include "This is the final query" in your response

Begin by analyzing the schema and user request to generate an appropriate SQL query."""

    if iteration > 0:
        base_prompt += f"\n\n**Note:** This is iteration {iteration}. Review the previous execution results and refine your approach if needed."
        
    return base_prompt


def sql_generation_node(state: AgentState) -> AgentState:
    """LLM node that generates SQL using Anthropic API"""
    try:
        # Initialize Anthropic client
        anthropic_client = Anthropic(
            api_key=settings.ANTHROPIC_API_KEY
        )
        
        # Prepare messages for Anthropic API
        messages = []
        
        # Add system message
        system_prompt = get_system_prompt(state["database_schema"], state["user_nl_query"], state["current_iteration"])
        
        logger.debug(f"System prompt length: {len(system_prompt)} characters")
        logger.debug(f"Database schema length: {len(state['database_schema'])} characters")
        
        # Add conversation history
        for msg in state["messages"]:
            if msg["role"] in ["user", "assistant"]:
                messages.append({
                    "role": msg["role"],
                    "content": msg["content"]
                })
        
        # If this is the first iteration, add the user's original query
        if state["current_iteration"] == 0:
            messages.append({
                "role": "user",
                "content": f"Please generate a SQL query for: {state['user_nl_query']}"
            })
        
        # Call Anthropic API
        response = anthropic_client.messages.create(
            model="claude-3-5-sonnet-20241022",  # Using Claude 3.5 Sonnet
            max_tokens=4000,
            system=system_prompt,
            messages=messages
        )
        
        response_content = response.content[0].text
        
        # Extract SQL from response
        sql_pattern = r'```sql\s*(.*?)\s*```'
        sql_matches = re.findall(sql_pattern, response_content, re.DOTALL | re.IGNORECASE)
        
        # Update state
        state["messages"].append({
            "role": "assistant",
            "content": response_content,
            "timestamp": None  # Will be set when saved to DB
        })
        
        if sql_matches:
            # Extract the SQL query
            state["current_sql_query"] = sql_matches[-1].strip()  # Use the last SQL block
            
            # Only set final_sql if explicitly stated as final or after successful execution
            if any(phrase in response_content.lower() for phrase in 
                   ["this is the final", "final query", "final sql", "query is complete", "this completes"]):
                state["final_sql"] = state["current_sql_query"]
                logger.info(f"Agent marked SQL as final: {state['final_sql'][:50]}...")
            
            # Check for duplicate responses
            if len(state["messages"]) >= 3:
                prev_assistant_msgs = [msg for msg in state["messages"][-3:] if msg["role"] == "assistant"]
                if len(prev_assistant_msgs) >= 2:
                    if prev_assistant_msgs[-1]["content"] == prev_assistant_msgs[-2]["content"]:
                        logger.info("Detected duplicate response, marking as final")
                        state["final_sql"] = state["current_sql_query"]
        else:
            state["current_sql_query"] = None
            
        logger.info(f"LLM generated response for iteration {state['current_iteration']}")
        logger.debug(f"Generated SQL: {state.get('current_sql_query', 'None')}")
        logger.debug(f"Final SQL set: {bool(state.get('final_sql'))}")
        
    except Exception as e:
        logger.error(f"Error in SQL generation node: {str(e)}")
        state["error_message"] = f"Error generating SQL: {str(e)}"
        state["should_continue"] = False
        
    return state


def execute_sql_tool(state: AgentState) -> AgentState:
    """Tool node that executes SQL and creates a new SQL cell"""
    try:
        if not state.get("current_sql_query"):
            state["error_message"] = "No SQL query to execute"
            return state
            
        # Get database connection and notebook
        try:
            db_connection = DatabaseConnection.objects.get(
                id=state["active_connection_id"],
                user=state["user_object"]
            )
            notebook = SQLNotebook.objects.get(
                id=state["current_notebook_id"],
                user=state["user_object"]
            )
        except (DatabaseConnection.DoesNotExist, SQLNotebook.DoesNotExist) as e:
            state["error_message"] = f"Database connection or notebook not found: {str(e)}"
            state["should_continue"] = False
            return state
            
        # Execute SQL query 
        connection_config = db_connection.get_connection_config()
        success, result = execute_query(connection_config, state["current_sql_query"])
        
        logger.debug(f"SQL execution result - Success: {success}, Type: {type(result)}")
        
        if success:
            # Prepare detailed result summary for LLM
            if isinstance(result, dict):
                # Handle 'rows' format
                if 'rows' in result and isinstance(result['rows'], list):
                    row_count = len(result['rows'])
                    col_count = len(result.get('columns', []))
                    
                    result_summary = f"Query executed successfully. Returned {row_count} rows with {col_count} columns."
                    
                    if row_count > 0:
                        # Add column information
                        if 'columns' in result:
                            result_summary += f"\n\nColumns: {', '.join(result['columns'])}"
                        
                        # Add sample data for LLM context
                        sample_size = min(3, row_count)
                        result_summary += f"\n\nSample results (first {sample_size} rows):"
                        for i, row in enumerate(result['rows'][:sample_size]):
                            result_summary += f"\nRow {i+1}: {json.dumps(row, default=str)}"
                            
                        # Add summary statistics
                        if row_count > 5:
                            result_summary += f"\n... and {row_count - sample_size} more rows."
                    
                # Handle 'data' format  
                elif 'data' in result and isinstance(result['data'], list):
                    col_count = len(result.get('columns', []))
                    row_count = len(result['data'][0]) if result['data'] and len(result['data']) > 0 else 0
                    
                    result_summary = f"Query executed successfully. Returned {row_count} rows with {col_count} columns."
                    
                    if row_count > 0 and 'columns' in result:
                        result_summary += f"\n\nColumns: {', '.join(result['columns'])}"
                        
                        # Convert to row format for sample
                        sample_size = min(3, row_count)
                        result_summary += f"\n\nSample results (first {sample_size} rows):"
                        for i in range(sample_size):
                            row_data = {}
                            for j, col in enumerate(result['columns']):
                                if j < len(result['data']) and i < len(result['data'][j]):
                                    row_data[col] = result['data'][j][i]
                            result_summary += f"\nRow {i+1}: {json.dumps(row_data, default=str)}"
                else:
                    result_summary = "Query executed successfully but returned unexpected data format."
                    logger.warning(f"Unexpected result format: {result}")
            else:
                result_summary = f"Query executed successfully. Result: {str(result)}"
                
            state["messages"].append({
                "role": "tool_result",
                "content": result_summary,
                "timestamp": None
            })
            
            logger.info(f"SQL execution successful - {result_summary.split('.')[0]}")
        else:
            # Execution failed
            error_msg = f"SQL execution failed: {result}"
            state["error_message"] = error_msg
            state["messages"].append({
                "role": "tool_result",
                "content": error_msg,
                "timestamp": None
            })
            
            logger.warning(f"SQL execution failed: {result}")
            
        logger.info(f"SQL execution completed for iteration {state['current_iteration']}")
        
    except Exception as e:
        logger.error(f"Error in SQL execution tool: {str(e)}")
        error_msg = f"Error executing SQL: {str(e)}"
        state["error_message"] = error_msg
        state["messages"].append({
            "role": "tool_result",
            "content": error_msg,
            "timestamp": None
        })
        
    return state


def decide_next_step(state: AgentState) -> str:
    """Router node that decides the next step in the workflow"""
    
    logger.debug(f"Deciding next step for iteration {state['current_iteration']}")
    logger.debug(f"Messages count: {len(state['messages'])}")
    
    # Check iteration limits
    if state["current_iteration"] >= state["max_iterations"]:
        logger.info(f"Max iterations ({state['max_iterations']}) reached")
        return END
        
    # Check if there's an error that should stop execution
    if state.get("error_message") and not state.get("should_continue", True):
        logger.info(f"Stopping due to error: {state['error_message']}")
        return END
    
    # Determine next step based on current state
    last_message = state["messages"][-1] if state["messages"] else {}
    last_role = last_message.get("role", "")
    
    logger.debug(f"Last message role: {last_role}")
    
    if last_role == "assistant" and state.get("current_sql_query"):
        # LLM provided SQL, execute it
        logger.info(f"Executing SQL from iteration {state['current_iteration']}")
        return "execute_sql"
    elif last_role == "tool_result":
        # Tool executed, check if we should continue
        tool_content = last_message.get("content", "").lower()
        
        # If we have final SQL and successful execution, we're done
        if state.get("final_sql") and "successfully" in tool_content:
            logger.info("Final SQL executed successfully, ending workflow")
            return END
        
        # If query failed badly, ask LLM to fix it
        if "error" in tool_content or "failed" in tool_content:
            logger.info(f"SQL failed, continuing to iteration {state['current_iteration'] + 1}")
            state["current_iteration"] += 1
            return "generate_sql"
        
        # If query succeeded but we don't have final SQL, ask LLM if this is what user wanted
        if "successfully" in tool_content and not state.get("final_sql"):
            logger.info(f"SQL succeeded but not marked final, continuing to iteration {state['current_iteration'] + 1}")
            state["current_iteration"] += 1
            return "generate_sql"
        
        # Default continue
        state["current_iteration"] += 1
        return "generate_sql"
    else:
        # Default to SQL generation
        logger.debug("Defaulting to SQL generation")
        return "generate_sql"


def create_agent_graph() -> StateGraph:
    """Create and configure the LangGraph agent"""
    
    # Create the graph
    workflow = StateGraph(AgentState)
    
    # Add nodes
    workflow.add_node("generate_sql", sql_generation_node)
    workflow.add_node("execute_sql", execute_sql_tool)
    
    # Set entry point
    workflow.set_entry_point("generate_sql")
    
    # Add conditional edges
    workflow.add_conditional_edges(
        "generate_sql",
        decide_next_step,
        {
            "execute_sql": "execute_sql",
            "generate_sql": "generate_sql",
            END: END
        }
    )
    
    workflow.add_conditional_edges(
        "execute_sql", 
        decide_next_step,
        {
            "generate_sql": "generate_sql",
            "execute_sql": "execute_sql", 
            END: END
        }
    )
    
    # Compile the graph
    agent = workflow.compile()
    return agent


def get_or_create_agent_for_user(user_id: int):
    """Get or create agent instance for a user"""
    if user_id not in user_agents:
        user_agents[user_id] = create_agent_graph()
    return user_agents[user_id]


def create_and_execute_sql_cell(notebook: SQLNotebook, sql_query: str, 
                               db_connection: DatabaseConnection, user) -> tuple[bool, Any]:
    """
    Helper function to create and execute a SQL cell in a notebook
    Returns (success: bool, result: Any)
    """
    try:
        # Get the next order number for the cell
        last_cell = notebook.cells.order_by('-order').first()
        next_order = (last_cell.order + 1) if last_cell else 1
        
        # Create the SQL cell
        cell = SQLCell.objects.create(
            notebook=notebook,
            order=next_order,
            name=f"Agent Query {next_order}",
            query=sql_query,
            is_executed=False
        )
        
        # Execute the query
        connection_config = db_connection.get_connection_config()
        success, result = execute_query(connection_config, sql_query)
        
        if success:
            # Store the results in the cell
            cell.result = result
            cell.is_executed = True
            cell.save()
            
            logger.info(f"SQL cell {cell.id} created and executed successfully")
            return True, result
        else:
            # Store the error in the cell
            cell.result = {"error": result}
            cell.is_executed = False
            cell.save()
            
            logger.warning(f"SQL cell {cell.id} created but execution failed: {result}")
            return False, result
            
    except Exception as e:
        logger.error(f"Error creating/executing SQL cell: {str(e)}")
        return False, str(e) 