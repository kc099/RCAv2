from django.db import models
from django.conf import settings
from django.contrib.auth.models import (
    AbstractBaseUser,
    BaseUserManager,
    PermissionsMixin,
)
import time


class UserManager(BaseUserManager):
    """Manager for users"""

    def create_user(self, email, name, password=None, **extra_fields):
        """Create, save and return a new user"""
        if not email:
            raise ValueError('User must have an email address')
        if not name:
            raise ValueError('User must have a name')
        user = self.model(email=self.normalize_email(email), name=name, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)

        return user

    def create_superuser(self, email, name, password):
        """Create and return superuser"""
        user = self.create_user(email, name, password)
        user.is_staff = True
        user.is_superuser = True
        user.save(using=self._db)

        return user


class User(AbstractBaseUser, PermissionsMixin):
    """User in system"""
    email = models.EmailField(max_length=255, unique=True)
    # Keep name for backward compatibility
    name = models.CharField(max_length=255)
    # Add new fields based on sample data
    first_name = models.CharField(max_length=100, blank=True)
    last_name = models.CharField(max_length=100, blank=True)
    photo_url = models.URLField(max_length=500, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    modified_at = models.DateTimeField(auto_now=True)
    # Payment status fields
    PAYMENT_STATUS_CHOICES = [
        ('PAID', 'Paid'),
        ('UNPAID', 'Unpaid'),
        ('TRIAL', 'Trial'),
        ('EXPIRED', 'Expired'),
    ]
    payment_status = models.CharField(
        max_length=10, 
        choices=PAYMENT_STATUS_CHOICES,
        default='UNPAID'
    )
    has_completed_onboarding = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    is_superuser = models.BooleanField(default=False)

    objects = UserManager()

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['name']
    
    def save(self, *args, **kwargs):
        # If first_name and last_name are not set but name is, split name
        if not self.first_name and not self.last_name and self.name:
            name_parts = self.name.split(' ', 1)
            self.first_name = name_parts[0]
            self.last_name = name_parts[1] if len(name_parts) > 1 else ''
        # If name is not set but first_name and last_name are, combine them
        elif not self.name and (self.first_name or self.last_name):
            self.name = f"{self.first_name} {self.last_name}".strip()
        super().save(*args, **kwargs)


class Thread(models.Model):
    """Thread model for user conversations/analysis"""
    title = models.CharField(max_length=255)
    # Store as float timestamp for easier comparison with the sample data
    last_modified = models.FloatField(default=time.time)
    created_at = models.DateTimeField(auto_now_add=True)
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='threads'
    )
    
    def __str__(self):
        return self.title
    
    def save(self, *args, **kwargs):
        # Update last_modified timestamp on save
        self.last_modified = time.time()
        super().save(*args, **kwargs)


class AdminUser(models.Model):
    """Admin user profile model"""
    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name='admin_profile'
    )
    department = models.CharField(max_length=100)
    is_global_admin = models.BooleanField(default=False)
    access_level = models.IntegerField(default=1)  # 1-5 scale, 5 being highest

    def __str__(self):
        return f"{self.user.name} - Admin"


class NormalUser(models.Model):
    """Normal user profile model"""
    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name='user_profile'
    )
    phone_number = models.CharField(max_length=15, blank=True)
    address = models.TextField(blank=True)
    role = models.CharField(max_length=100, blank=True)
    
    def __str__(self):
        return f"{self.user.name} - User"
