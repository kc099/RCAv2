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


def get_database_specific_instructions(connection_type: str) -> str:
    """Get database-specific SQL syntax instructions"""
    connection_type = connection_type.lower()
    
    instructions = {
        'mysql': """
**MySQL-Specific Guidelines:**
- Use backticks (`) for table/column names with spaces or reserved words
- Use LIMIT for pagination (e.g., LIMIT 10, LIMIT 10 OFFSET 20)
- Date functions: NOW(), CURDATE(), DATE_ADD(), DATE_SUB(), STR_TO_DATE()
- String functions: CONCAT(), SUBSTRING(), LENGTH(), UPPER(), LOWER()
- Use IFNULL() for NULL handling
- Auto-increment columns typically use AUTO_INCREMENT
- Boolean values: TRUE/FALSE or 1/0
- Comments use -- or /* */
- GROUP BY requires all non-aggregate columns to be listed
""",
        'redshift': """
**Amazon Redshift-Specific Guidelines:**
- Use double quotes (") for case-sensitive identifiers
- Use LIMIT for pagination (PostgreSQL syntax)
- Date functions: GETDATE(), DATEADD(), DATEDIFF(), TO_DATE()
- String functions: CONCAT(), SUBSTRING(), LEN(), UPPER(), LOWER()
- Use NVL() or COALESCE() for NULL handling
- No AUTO_INCREMENT - use IDENTITY columns instead
- Boolean values: TRUE/FALSE
- Supports window functions and analytical queries
- DISTKEY and SORTKEY for performance optimization
- Use UNLOAD to export data
""",
        'postgresql': """
**PostgreSQL-Specific Guidelines:**
- CRITICAL: Use double quotes (") for case-sensitive identifiers and column names with special characters
- ALWAYS quote column names that contain spaces, underscores, or mixed case (e.g., "Order_id", "Customer ID")
- Schema.table syntax: datasage.customer_info or "datasage"."customer_info"
- Use LIMIT and OFFSET for pagination
- Date functions: NOW(), CURRENT_DATE, DATE_TRUNC(), EXTRACT()
- String functions: CONCAT(), SUBSTRING(), LENGTH(), UPPER(), LOWER()
- Use COALESCE() for NULL handling
- Use SERIAL or IDENTITY for auto-increment
- Boolean values: TRUE/FALSE
- Rich data types: JSON, JSONB, arrays, custom types
- Window functions and CTEs (Common Table Expressions)
- PostgreSQL is case-sensitive for quoted identifiers
""",
        'snowflake': """
**Snowflake-Specific Guidelines:**
- Identifiers are case-insensitive unless quoted
- Use LIMIT for pagination
- Date functions: CURRENT_TIMESTAMP(), DATEADD(), DATEDIFF(), TO_DATE()
- String functions: CONCAT(), SUBSTRING(), LENGTH(), UPPER(), LOWER()
- Use NVL() or COALESCE() for NULL handling
- Use AUTOINCREMENT for auto-increment columns
- Rich data types: VARIANT for JSON, ARRAY, OBJECT
- Window functions and analytical queries
- Time travel capabilities with AT clause
"""
    }
    
    return instructions.get(connection_type, """
**Standard SQL Guidelines:**
- Use standard SQL-92/99 syntax when possible
- Use LIMIT for row limitation (may vary by database)
- Standard functions: CONCAT(), SUBSTRING(), UPPER(), LOWER()
- Use COALESCE() for NULL handling
- Follow ANSI SQL standards for maximum compatibility
""")


def get_system_prompt(database_schema: str, user_nl_query: str, connection_type: str, iteration: int = 0) -> str:
    """Generate the system prompt for the Anthropic API"""
    
    # Get database-specific instructions
    db_specific_instructions = get_database_specific_instructions(connection_type)
    
    base_prompt = f"""You are an expert SQL generation assistant. Your role is to help users generate accurate SQL queries based on their natural language requests and the provided database schema.

**Database Type:** {connection_type.upper()}

**Database Schema:**
{database_schema}

**User's Request:**
{user_nl_query}

**Current Iteration:** {iteration}

{db_specific_instructions}

**Your Workflow:**
1. Analyze the user's request and the database schema carefully
2. Generate SQL queries that accurately fulfill the request using {connection_type.upper()}-specific syntax
3. When you have a SQL query ready for execution, respond with the SQL enclosed in ```sql ... ``` blocks
4. If SQL execution fails, analyze the error and provide corrected SQL using proper {connection_type.upper()} syntax
5. If results look correct, say "This is the final query" to complete the task
6. If results are unexpected, refine the query based on feedback

**Important Guidelines:**
- Use the exact table and column names from the schema
- Follow {connection_type.upper()}-specific syntax and functions
- Consider relationships between tables when writing JOINs
- Be careful with data types and NULL handling specific to {connection_type.upper()}
- Start simple and iterate if needed
- Always validate your SQL syntax for {connection_type.upper()}
- Provide clear, readable SQL with proper formatting

**Termination:**
- When you're confident the SQL correctly answers the user's question, say "This is the final query" 
- If you've provided the same SQL twice, the task is complete

**Output Format:**
- Always include: ```sql\nYOUR_SQL_HERE\n```
- Add explanation before or after the SQL block
- For final answers: Include "This is the final query" in your response

Begin by analyzing the schema and user request to generate an appropriate {connection_type.upper()} SQL query."""

    if iteration > 0:
        base_prompt += f"\n\n**Note:** This is iteration {iteration}. Review the previous execution results and refine your approach if needed. Ensure you're using correct {connection_type.upper()} syntax."
        
    return base_prompt


def sql_generation_node(state: AgentState) -> AgentState:
    """LLM node that generates SQL using Anthropic API"""
    try:
        # Initialize Anthropic client
        anthropic_client = Anthropic(
            api_key=settings.ANTHROPIC_API_KEY
        )
        
        # Get connection type dynamically from the database connection
        try:
            db_connection = DatabaseConnection.objects.get(
                id=state["active_connection_id"],
                user=state["user_object"]
            )
            connection_type = db_connection.connection_type
        except DatabaseConnection.DoesNotExist:
            logger.warning(f"Database connection {state['active_connection_id']} not found, using 'mysql' as default")
            connection_type = 'mysql'  # Default fallback
        
        # Prepare messages for Anthropic API
        messages = []
        
        # Add system message with dynamic connection type
        system_prompt = get_system_prompt(state["database_schema"], state["user_nl_query"], connection_type, state["current_iteration"])
        
        # Log basic schema info for debugging
        if state["current_iteration"] == 0:  # Only log on first iteration to avoid spam
            logger.info(f"Agent using {connection_type} connection with schema ({len(state['database_schema'])} chars)")
        
        # Add conversation history
        for msg in state["messages"]:
            if msg["role"] in ["user", "assistant", "tool_result"]:
                # Map 'tool_result' to 'user' for Anthropic, so the LLM sees the result as user feedback
                role = msg["role"]
                if role == "tool_result":
                    role = "user"
                messages.append({
                    "role": role,
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
        
        # Check for duplicate SQL queries before adding the new message
        current_sql = sql_matches[-1].strip() if sql_matches else None
        
        # Get previous assistant messages to check for duplicates
        assistant_messages = [msg for msg in state["messages"] if msg["role"] == "assistant"]
        
        # Check if we've seen this exact SQL before
        duplicate_detected = False
        if current_sql and len(assistant_messages) > 0:
            for prev_msg in assistant_messages[-2:]:  # Check last 2 assistant messages
                prev_sql_matches = re.findall(sql_pattern, prev_msg["content"], re.DOTALL | re.IGNORECASE)
                if prev_sql_matches:
                    prev_sql = prev_sql_matches[-1].strip()
                    if current_sql == prev_sql:
                        duplicate_detected = True
                        logger.info("Detected duplicate SQL query, marking as final to terminate")
                        break
        
        # Update state with the new message
        state["messages"].append({
            "role": "assistant",
            "content": response_content,
            "timestamp": None  # Will be set when saved to DB
        })
        
        if sql_matches:
            # Extract the SQL query
            state["current_sql_query"] = current_sql
            
            # Only mark as final if:
            # 1. Agent explicitly says it's final AND we're not on first iteration
            # 2. We detect duplicate SQL (agent repeating same query)
            # 3. We've hit max iterations
            explicitly_final = any(phrase in response_content.lower() for phrase in 
                                 ["this is the final", "final query", "final sql", "query is complete", "this completes"])
            
            if ((explicitly_final and state["current_iteration"] > 0) or
                duplicate_detected or
                state["current_iteration"] >= state["max_iterations"] - 1):
                state["final_sql"] = state["current_sql_query"]
                logger.info(f"Agent marked SQL as final: {state['final_sql'][:50]}... (explicit: {explicitly_final}, duplicate: {duplicate_detected}, iteration: {state['current_iteration']})")
        else:
            state["current_sql_query"] = None
            # If no SQL found and we're not on the first iteration, this might be a termination message
            if state["current_iteration"] > 0:
                logger.warning(f"No SQL found in assistant response for iteration {state['current_iteration']}")
            
        logger.info(f"LLM generated response for iteration {state['current_iteration']} using {connection_type} syntax")
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
            
            # Handle both UUID and integer ID for notebook lookup
            notebook_id = state["current_notebook_id"]
            try:
                # First try to find by UUID (new approach)
                try:
                    notebook = SQLNotebook.objects.get(
                        uuid=notebook_id,
                        user=state["user_object"]
                    )
                except (SQLNotebook.DoesNotExist, ValueError):
                    # Fallback to ID lookup (for backwards compatibility)
                    notebook = SQLNotebook.objects.get(
                        id=notebook_id,
                        user=state["user_object"]
                    )
            except SQLNotebook.DoesNotExist:
                state["error_message"] = f"Notebook not found or access denied: {notebook_id}"
                state["should_continue"] = False
                return state
                
        except (DatabaseConnection.DoesNotExist, ValueError) as e:
            state["error_message"] = f"Database connection not found: {str(e)}"
            state["should_continue"] = False
            return state
            
        # Execute SQL query 
        # Use the same working connection approach as the main agent view
        connection_info = notebook.get_connection_info()
        if not connection_info:
            state["error_message"] = "No connection information available for this notebook"
            state["should_continue"] = False
            return state
            
        success, result = execute_query(connection_info, state["current_sql_query"])
        
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
    
    # If we have final SQL, we should stop after this execution attempt
    if state.get("final_sql"):
        last_message = state["messages"][-1] if state["messages"] else {}
        last_role = last_message.get("role", "")
        
        if last_role == "tool_result":
            # Final SQL was executed, end regardless of success/failure
            logger.info("Final SQL execution completed, ending workflow")
            return END
        elif last_role == "assistant":
            # Final SQL needs to be executed
            logger.info("Executing final SQL")
            return "execute_sql"
    
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
        
        # Count consecutive failures to prevent infinite retry loops
        consecutive_failures = 0
        for msg in reversed(state["messages"]):
            if msg["role"] == "tool_result":
                if "failed" in msg["content"].lower() or "error" in msg["content"].lower():
                    consecutive_failures += 1
                else:
                    break
            elif msg["role"] == "assistant":
                break
        
        # If we've had too many consecutive failures, stop
        if consecutive_failures >= 3:
            logger.info(f"Too many consecutive failures ({consecutive_failures}), ending workflow")
            return END
        
        # If query failed, ask LLM to fix it (but increment iteration)
        if "error" in tool_content or "failed" in tool_content:
            # Check for database connection errors that can't be fixed by SQL changes
            if any(db_error in tool_content for db_error in [
                "unread result found", "connection", "timeout", "access denied", 
                "database not found", "table doesn't exist", "notebook not found"
            ]):
                logger.info(f"Database connection or configuration error detected, ending workflow: {tool_content}")
                return END
            
            # Increment iteration before continuing
            state["current_iteration"] += 1
            logger.info(f"SQL failed, continuing to iteration {state['current_iteration']}")
            return "generate_sql"
        
        # If query succeeded, continue for potential refinement (unless marked as final)
        if "successfully" in tool_content:
            # Only end if explicitly marked as final, otherwise continue iterating
            if state.get("final_sql"):
                logger.info("SQL executed successfully and marked as final, ending workflow")
                return END
            else:
                # Continue to allow for refinement and improvement
                state["current_iteration"] += 1
                logger.info(f"SQL executed successfully, continuing to iteration {state['current_iteration']} for potential refinement")
                return "generate_sql"
        
        # Default continue with incremented iteration
        state["current_iteration"] += 1
        logger.info(f"Continuing to iteration {state['current_iteration']}")
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