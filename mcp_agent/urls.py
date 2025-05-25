from django.urls import path
from . import views

app_name = 'mcp_agent'

urlpatterns = [
    # Main text-to-SQL agent endpoint
    path('text-to-sql/', views.text_to_sql_agent_view, name='text_to_sql_agent'),
    
    # Conversation management endpoints
    path('conversations/', views.list_conversations, name='list_conversations'),
    path('conversations/<int:conversation_id>/', views.get_conversation_history, name='conversation_history'),
] 