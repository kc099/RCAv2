import json
import logging
from django.shortcuts import render, get_object_or_404
from django.http import JsonResponse
from django.contrib.auth.decorators import login_required
from django.views.decorators.http import require_http_methods
from django.views.decorators.csrf import csrf_exempt
from django.utils.decorators import method_decorator
from django.core.exceptions import ValidationError
from core.models import DatabaseConnection, SQLNotebook, SQLCell
from core.db_handlers import get_schema_for_connection, execute_query, get_mysql_schema_info, format_schema_for_llm
from .models import AgentConversation, ChatMessage
from .agent_logic import get_or_create_agent_for_user, AgentState
from core.views import get_database_schema

logger = logging.getLogger(__name__)


@login_required
@require_http_methods(["POST"])
@csrf_exempt  # We'll handle CSRF manually in the frontend
def text_to_sql_agent_view(request):
    """
    API endpoint for text-to-SQL agent interaction
    
    Expects JSON input:
    {
        "query": "natural language query",
        "connection_id": int,
        "notebook_id": int,
        "conversation_id": int (optional)
    }
    
    Returns JSON:
    {
        "success": bool,
        "conversation_id": int,
        "messages": [list of message dicts],
        "final_sql": str (optional),
        "error": str (optional)
    }
    """
    try:
        # Parse JSON input
        try:
            data = json.loads(request.body)
        except json.JSONDecodeError:
            return JsonResponse({
                "success": False,
                "error": "Invalid JSON input"
            }, status=400)
        
        # Extract required fields
        user_nl_query = data.get('query', '').strip()
        connection_id = data.get('connection_id')
        notebook_id = data.get('notebook_id')
        conversation_id = data.get('conversation_id')
        selected_schemas = data.get('selected_schemas', [])
        
        # Validate required fields
        if not user_nl_query:
            return JsonResponse({
                "success": False,
                "error": "Query field is required"
            }, status=400)
            
        if not notebook_id:
            return JsonResponse({
                "success": False,
                "error": "notebook_id is required"
            }, status=400)
        
        # Get notebook first - support both UUID and ID
        try:
            # First try to find by UUID (new approach)
            try:
                notebook = SQLNotebook.objects.get(
                    uuid=notebook_id,
                    user=request.user
                )
            except (SQLNotebook.DoesNotExist, ValueError):
                # Fallback to ID lookup (for backwards compatibility)
                notebook = SQLNotebook.objects.get(
                    id=notebook_id,
                    user=request.user
                )
        except SQLNotebook.DoesNotExist:
            return JsonResponse({
                "success": False,
                "error": "Notebook not found or access denied"
            }, status=404)
        except Exception as e:
            return JsonResponse({
                "success": False,
                "error": f"Error finding notebook: {str(e)}"
            }, status=400)
        
        # Handle connection_id - use notebook's actual connection instead of session/frontend connection
        # This ensures consistency between schema retrieval and SQL execution
        if notebook.database_connection:
            # Use the notebook's assigned database connection
            db_connection = notebook.database_connection
            connection_id = db_connection.id
            logger.info(f"Agent using notebook's assigned connection: {db_connection.name} (ID: {connection_id}, type: {db_connection.connection_type})")
        else:
            # Get connection info from notebook's connection_info field
            connection_info = notebook.get_connection_info()
            if not connection_info:
                return JsonResponse({
                    "success": False,
                    "error": "No database connection found for this notebook"
                }, status=400)
            
            # Try to find a matching DatabaseConnection object based on connection info
            connection_type = connection_info.get('type', 'mysql').lower()
            host = connection_info.get('host')
            database = connection_info.get('database')
            
            # Look for existing connection that matches the notebook's connection info
            matching_connections = DatabaseConnection.objects.filter(
                user=request.user,
                connection_type=connection_type,
                host=host,
                database=database
            )
            
            if matching_connections.exists():
                db_connection = matching_connections.first()
                connection_id = db_connection.id
                logger.info(f"Agent found matching connection: {db_connection.name} (ID: {connection_id}, type: {db_connection.connection_type})")
            else:
                # Create a temporary connection object for consistent interface
                class TempConnection:
                    def __init__(self, connection_info):
                        self.connection_type = connection_info.get('type', 'mysql').lower()
                        self.name = f"Temp {self.connection_type} connection"
                        self.id = f"temp_{self.connection_type}"
                
                db_connection = TempConnection(connection_info)
                connection_id = db_connection.id
                logger.info(f"Agent using temporary connection: {db_connection.name} (type: {db_connection.connection_type})")
        
        # Get or create conversation
        if conversation_id:
            try:
                conversation = AgentConversation.objects.get(
                    id=conversation_id,
                    user=request.user
                )
            except AgentConversation.DoesNotExist:
                return JsonResponse({
                    "success": False,
                    "error": "Conversation not found or access denied"
                }, status=404)
        else:
            # Create new conversation
            conversation = AgentConversation.objects.create(
                user=request.user,
                notebook=notebook,
                title=f"Query: {user_nl_query[:50]}..."
            )
        
        # Get database schema using the notebook's connection info (ensures consistency)
        try:
            connection_info = notebook.get_connection_info()
            if not connection_info:
                return JsonResponse({
                    "success": False,
                    "error": "No connection information available for this notebook"
                }, status=400)
                
            # Log the connection info being used for schema retrieval
            logger.info(f"Agent retrieving schema using connection: host={connection_info.get('host')}, type={connection_info.get('type')}")
                
            schemas = get_database_schema(connection_info)
            
            # Filter schemas based on user selection to reduce token cost
            if selected_schemas and len(selected_schemas) > 0:
                selected_schema_names = [s.get('name') for s in selected_schemas if s.get('name')]
                filtered_schemas = []
                
                for schema in schemas:
                    schema_name = schema.get('schema_name') or schema.get('database_name') or 'default'
                    if schema_name in selected_schema_names:
                        filtered_schemas.append(schema)
                        logger.info(f"Agent including schema: {schema_name} with {len(schema.get('tables', {}))} tables")
                
                if filtered_schemas:
                    schemas = filtered_schemas
                    logger.info(f"Agent filtered to {len(schemas)} selected schema(s) to reduce token cost")
                else:
                    logger.warning("No schemas matched user selection, using all available schemas")
            
            # Format the schema for the LLM (convert from list of dicts to string)
            database_schema = format_schema_for_llm(schemas)
            
            if not database_schema:
                return JsonResponse({
                    "success": False,
                    "error": "Could not retrieve database schema"
                }, status=500)
                
            logger.info(f"Agent using schema context ({len(database_schema)} chars) for {len(schemas)} schema(s)")
            
        except Exception as e:
            logger.error(f"Error getting schema for notebook connection: {str(e)}")
            return JsonResponse({
                "success": False,
                "error": f"Error retrieving database schema: {str(e)}"
            }, status=500)
        
        # Load conversation history
        chat_messages = conversation.get_messages()
        message_history = [
            {
                "role": msg.role.lower(),
                "content": msg.content,
                "timestamp": msg.timestamp.isoformat() if msg.timestamp else None
            }
            for msg in chat_messages
        ]
        
        # Add user's new query to conversation
        user_message = ChatMessage.objects.create(
            conversation=conversation,
            role=ChatMessage.MessageRole.USER,
            content=user_nl_query
        )
        
        message_history.append({
            "role": "user", 
            "content": user_nl_query,
            "timestamp": user_message.timestamp.isoformat()
        })
        
        # Initialize agent state
        agent_state = AgentState(
            messages=message_history,
            current_sql_query=None,
            database_schema=database_schema,
            user_nl_query=user_nl_query,
            max_iterations=5,  # Configurable limit
            current_iteration=0,
            active_connection_id=connection_id,
            current_notebook_id=notebook_id,
            user_object=request.user,
            final_sql=None,
            should_continue=True,
            error_message=None,
            selected_schemas=selected_schemas
        )
        
        # Get agent and invoke
        agent = get_or_create_agent_for_user(request.user.id)
        
        try:
            # Run the agent
            final_state = agent.invoke(agent_state)
            
            # Save new messages to database
            new_messages = []
            for msg in final_state["messages"][len(message_history):]:
                if msg.get("timestamp") is None:  # Only save new messages
                    role_mapping = {
                        "assistant": ChatMessage.MessageRole.ASSISTANT,
                        "tool_result": ChatMessage.MessageRole.TOOL_RESULT,
                        "system": ChatMessage.MessageRole.SYSTEM,
                        "user": ChatMessage.MessageRole.USER
                    }
                    
                    chat_msg = ChatMessage.objects.create(
                        conversation=conversation,
                        role=role_mapping.get(msg["role"], ChatMessage.MessageRole.ASSISTANT),
                        content=msg["content"],
                        metadata=msg.get("metadata")
                    )
                    
                    new_messages.append(chat_msg.to_dict())
            
            # Update conversation timestamp
            conversation.save()  # This will update the updated_at field
            
            # Prepare response
            response_data = {
                "success": True,
                "conversation_id": conversation.id,
                "messages": [msg.to_dict() for msg in conversation.get_messages()],
                "final_sql": final_state.get("final_sql"),
                "iterations": final_state.get("current_iteration", 0)
            }
            
            if final_state.get("error_message"):
                response_data["warning"] = final_state["error_message"]
            
            return JsonResponse(response_data)
            
        except Exception as e:
            logger.error(f"Error invoking agent for user {request.user.id}: {str(e)}")
            return JsonResponse({
                "success": False,
                "error": f"Agent execution failed: {str(e)}"
            }, status=500)
    
    except Exception as e:
        logger.error(f"Unexpected error in text_to_sql_agent_view: {str(e)}")
        return JsonResponse({
            "success": False,
            "error": "Internal server error"
        }, status=500)


@login_required
def get_conversation_history(request, conversation_id):
    """Get conversation history for a specific conversation"""
    try:
        conversation = AgentConversation.objects.get(
            id=conversation_id,
            user=request.user
        )
        
        messages = [msg.to_dict() for msg in conversation.get_messages()]
        
        return JsonResponse({
            "success": True,
            "conversation_id": conversation.id,
            "messages": messages,
            "title": conversation.title
        })
        
    except AgentConversation.DoesNotExist:
        return JsonResponse({
            "success": False,
            "error": "Conversation not found"
        }, status=404)
    except Exception as e:
        logger.error(f"Error getting conversation history: {str(e)}")
        return JsonResponse({
            "success": False,
            "error": "Error retrieving conversation"
        }, status=500)


@login_required
def list_conversations(request):
    """List all conversations for the current user"""
    try:
        conversations = AgentConversation.objects.filter(
            user=request.user,
            is_active=True
        ).order_by('-updated_at')
        
        conversation_list = []
        for conv in conversations:
            last_message = conv.messages.last()
            conversation_list.append({
                "id": conv.id,
                "title": conv.title,
                "created_at": conv.created_at.isoformat(),
                "updated_at": conv.updated_at.isoformat(),
                "notebook_id": conv.notebook.id if conv.notebook else None,
                "notebook_title": conv.notebook.title if conv.notebook else None,
                "last_message": last_message.content[:100] + "..." if last_message and len(last_message.content) > 100 else last_message.content if last_message else "",
                "message_count": conv.messages.count()
            })
        
        return JsonResponse({
            "success": True,
            "conversations": conversation_list
        })
        
    except Exception as e:
        logger.error(f"Error listing conversations: {str(e)}")
        return JsonResponse({
            "success": False,
            "error": "Error retrieving conversations"
        }, status=500)



