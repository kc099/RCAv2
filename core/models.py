from django.db import models
from django.conf import settings
from django.contrib.auth.models import (
    AbstractBaseUser,
    BaseUserManager,
    PermissionsMixin,
)
import time
import json
from .encryption import encrypt_dict, decrypt_dict
import uuid


class UserManager(BaseUserManager):
    """Manager for users"""

    def create_user(self, email, name, password=None, **extra_fields):
        """Create, save and return a new user"""
        if not email:
            raise ValueError('User must have an email address')
        if not name:
            raise ValueError('User must have a name')
            
        # Generate username from email if not provided
        if 'username' not in extra_fields or not extra_fields['username']:
            username = email.split('@')[0]  # Use the part before @ as username
            # Make sure username is unique
            base_username = username
            counter = 1
            while self.model.objects.filter(username=username).exists():
                username = f"{base_username}{counter}"
                counter += 1
            extra_fields['username'] = username
            
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
    username = models.CharField(max_length=255, unique=True, null=True)
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


# Database Connection Model
class DatabaseConnection(models.Model):
    """Stores database connection information with encrypted credentials"""
    CONNECTION_TYPES = [
        ('mysql', 'MySQL'),
        ('postgresql', 'PostgreSQL'),
        ('redshift', 'Amazon Redshift'),
        ('snowflake', 'Snowflake'),
        ('bigquery', 'Google BigQuery'),
        ('sqlite', 'SQLite'),
    ]
    
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    connection_type = models.CharField(max_length=50, choices=CONNECTION_TYPES)
    host = models.CharField(max_length=255, blank=True)
    port = models.IntegerField(null=True, blank=True)
    database = models.CharField(max_length=255)
    username = models.CharField(max_length=255, blank=True)
    password = models.TextField(blank=True, help_text="This will be stored encrypted")
    ssl_enabled = models.BooleanField(default=False)
    ssl_ca = models.TextField(blank=True)
    ssl_cert = models.TextField(blank=True)
    ssl_key = models.TextField(blank=True)
    additional_params = models.JSONField(null=True, blank=True)
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='connections'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    def __str__(self):
        return f"{self.name} ({self.connection_type})" 
    
    def save(self, *args, **kwargs):
        # Encrypt sensitive fields before saving
        self.password = encrypt_dict({"password": self.password}).get("password", "")
        if self.additional_params:
            # Encrypt any sensitive fields in additional_params
            if isinstance(self.additional_params, str):
                try:
                    params_dict = json.loads(self.additional_params)
                    self.additional_params = encrypt_dict(params_dict)
                except json.JSONDecodeError:
                    pass
            elif isinstance(self.additional_params, dict):
                self.additional_params = encrypt_dict(self.additional_params)
        
        super().save(*args, **kwargs)
    
    def get_connection_config(self):
        """Return a decrypted connection configuration dict"""
        config = {
            'type': self.connection_type,
            'host': self.host,
            'port': self.port,
            'database': self.database,
            'username': self.username,
        }
        
        # Decrypt password
        if self.password:
            config['password'] = decrypt_dict({"password": self.password, "password_encrypted": True}).get("password", "")
        
        # Add SSL if enabled
        if self.ssl_enabled:
            config['ssl_ca'] = self.ssl_ca
            config['ssl_cert'] = self.ssl_cert
            config['ssl_key'] = self.ssl_key
        
        # Add additional params if any
        if self.additional_params:
            if isinstance(self.additional_params, dict):
                decrypted_params = decrypt_dict(self.additional_params)
                config.update(decrypted_params)
        
        return config


class SQLNotebook(models.Model):
    """Notebook model for SQL queries"""
    uuid = models.UUIDField(default=uuid.uuid4, editable=False, unique=True)
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE, 
        related_name='notebooks'
    )
    # We'll keep connection_info for backward compatibility
    connection_info = models.JSONField(null=True, blank=True)
    # New reference to DatabaseConnection model
    database_connection = models.ForeignKey(
        DatabaseConnection,
        on_delete=models.SET_NULL, 
        related_name='notebooks',
        null=True,
        blank=True
    )
    last_modified = models.FloatField(default=time.time)
    created_at = models.DateTimeField(auto_now_add=True)
    
    def save(self, *args, **kwargs):
        # Update last_modified timestamp on save
        self.last_modified = time.time()
        super().save(*args, **kwargs)
    
    def get_connection_info(self):
        """Get connection info, prioritizing the database_connection if available"""
        if self.database_connection:
            # Get configuration from the database connection
            config = self.database_connection.get_connection_config()
            # print(f"Using database connection from {self.database_connection.name} with host: {config.get('host')}")
            return config
        elif self.connection_info:
            # Verify the connection_info has all necessary fields and normalize field names
            if isinstance(self.connection_info, dict):
                # Handle the case where 'server' is used instead of 'host'
                if 'server' in self.connection_info and not 'host' in self.connection_info:
                    # Create a copy of the connection info with 'host' instead of 'server'
                    normalized_connection = self.connection_info.copy()
                    normalized_connection['host'] = normalized_connection.pop('server')
                    print(f"Normalized connection info, changing 'server' to 'host': {normalized_connection['host']}")
                    
                    # Update the connection info for future use
                    self.connection_info = normalized_connection
                    self.save(update_fields=['connection_info'])
                    return normalized_connection
                elif 'host' in self.connection_info and self.connection_info['host']:
                    print(f"Using connection_info with host: {self.connection_info.get('host')}")
                    return self.connection_info
            
            print(f"Warning: connection_info is invalid or missing host: {self.connection_info}")
        
        print("No valid connection info found for notebook")
        return None
        
    def __str__(self):
        return self.title


class SQLCell(models.Model):
    """Individual cell within a SQL notebook"""
    notebook = models.ForeignKey(
        SQLNotebook,
        on_delete=models.CASCADE,
        related_name='cells'
    )
    order = models.IntegerField()  # For ordering cells in the notebook
    name = models.CharField(max_length=255, default="Untitled Cell")
    query = models.TextField(blank=True)
    result = models.JSONField(null=True, blank=True)  # Store execution results
    is_executed = models.BooleanField(default=False)
    execution_time = models.FloatField(null=True, blank=True)  # Time taken to execute
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['order']
        
    def __str__(self):
        return f"{self.name} ({self.order})"