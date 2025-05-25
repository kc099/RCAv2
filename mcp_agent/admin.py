from django.contrib import admin
from .models import AgentConversation, ChatMessage


@admin.register(AgentConversation)
class AgentConversationAdmin(admin.ModelAdmin):
    list_display = ['id', 'user', 'title', 'notebook', 'created_at', 'updated_at', 'is_active']
    list_filter = ['is_active', 'created_at', 'updated_at']
    search_fields = ['user__email', 'user__name', 'title', 'notebook__title']
    readonly_fields = ['created_at', 'updated_at']
    list_per_page = 50
    
    def get_queryset(self, request):
        return super().get_queryset(request).select_related('user', 'notebook')


@admin.register(ChatMessage)
class ChatMessageAdmin(admin.ModelAdmin):
    list_display = ['id', 'conversation', 'role', 'content_preview', 'timestamp']
    list_filter = ['role', 'timestamp']
    search_fields = ['conversation__user__email', 'conversation__title', 'content']
    readonly_fields = ['timestamp']
    list_per_page = 100
    
    def content_preview(self, obj):
        """Show a preview of the message content"""
        return obj.content[:100] + "..." if len(obj.content) > 100 else obj.content
    content_preview.short_description = "Content Preview"
    
    def get_queryset(self, request):
        return super().get_queryset(request).select_related('conversation', 'conversation__user')
