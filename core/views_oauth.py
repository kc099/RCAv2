"""
OAuth related handlers for the application
"""
from django.contrib import messages
from django.dispatch import receiver
from allauth.account.signals import user_logged_in
from allauth.socialaccount.signals import social_account_added

@receiver(user_logged_in)
def after_user_logged_in(request, user, **kwargs):
    """
    Handle successful login redirect and messaging
    """
    # Add a welcome message
    user_display = user.name if hasattr(user, 'name') and user.name else user.email
    messages.success(
        request, 
        f"Welcome back, {user_display}!"
    )

@receiver(social_account_added)
def social_account_added_handler(request, sociallogin, **kwargs):
    """
    Handle when a social account is successfully connected to an existing account
    """
    messages.success(
        request,
        f"Your {sociallogin.account.provider.capitalize()} account has been successfully connected."
    )
