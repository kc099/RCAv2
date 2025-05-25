from django.db import models
from django.conf import settings
from core.models import SQLNotebook


class AgentConversation(models.Model):
    """Stores conversation history per user and optionally per SQLNotebook"""
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='agent_conversations'
    )
    notebook = models.ForeignKey(
        SQLNotebook,
        on_delete=models.CASCADE,
        related_name='agent_conversations',
        null=True,
        blank=True,
        help_text="Optional: Link conversation to specific notebook"
    )
    title = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    is_active = models.BooleanField(default=True)
    
    class Meta:
        ordering = ['-updated_at']
        verbose_name = "Agent Conversation"
        verbose_name_plural = "Agent Conversations"
    
    def __str__(self):
        title = self.title or f"Conversation {self.id}"
        return f"{self.user.name} - {title}"
    
    def get_messages(self):
        """Return all messages in this conversation ordered by timestamp"""
        return self.messages.all().order_by('timestamp')


class ChatMessage(models.Model):
    """Represents individual messages within a conversation"""
    
    class MessageRole(models.TextChoices):
        SYSTEM = 'SYSTEM', 'System'
        USER = 'USER', 'User'
        ASSISTANT = 'ASSISTANT', 'Assistant'
        TOOL_RESULT = 'TOOL_RESULT', 'Tool Result'
    
    conversation = models.ForeignKey(
        AgentConversation,
        on_delete=models.CASCADE,
        related_name='messages'
    )
    role = models.CharField(
        max_length=20,
        choices=MessageRole.choices,
        default=MessageRole.USER
    )
    content = models.TextField()
    timestamp = models.DateTimeField(auto_now_add=True)
    
    # Optional metadata for tracking agent state
    metadata = models.JSONField(null=True, blank=True, help_text="Additional metadata like SQL queries, execution results, etc.")
    
    class Meta:
        ordering = ['timestamp']
        verbose_name = "Chat Message"
        verbose_name_plural = "Chat Messages"
    
    def __str__(self):
        content_preview = self.content[:50] + "..." if len(self.content) > 50 else self.content
        return f"{self.role}: {content_preview}"
    
    def to_dict(self):
        """Convert message to dictionary format for API responses"""
        return {
            'id': self.id,
            'role': self.role,
            'content': self.content,
            'timestamp': self.timestamp.isoformat(),
            'metadata': self.metadata
        }
