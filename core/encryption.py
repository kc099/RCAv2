from django.conf import settings
import base64
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
import os

def get_encryption_key():
    """
    Get the encryption key from the environment variable or generate a new one
    The key should be stored in the .env file as ENCRYPTION_KEY
    """
    key = os.environ.get('ENCRYPTION_KEY')
    if not key:
        # Fallback to settings
        key = getattr(settings, 'ENCRYPTION_KEY', None)
    
    if not key:
        # Generate a warning - this should not happen in production
        import warnings
        warnings.warn("ENCRYPTION_KEY not found in environment or settings. Using a temporary key.")
        # Generate a temporary key for development
        # WARNING: This means data will be lost on server restart!
        key = base64.urlsafe_b64encode(os.urandom(32)).decode('utf-8')
    
    return key
    
def get_fernet():
    """Get a Fernet instance for encryption/decryption"""
    key = get_encryption_key()
    
    # If key is not a proper Fernet key (32 url-safe base64-encoded bytes),
    # derive a proper key using PBKDF2
    if len(base64.urlsafe_b64decode(key + '=' * (-len(key) % 4))) != 32:
        salt = b'RCASQLEncryptionSalt'  # A fixed salt, could be stored in settings
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=salt,
            iterations=100000,
        )
        derived_key = base64.urlsafe_b64encode(kdf.derive(key.encode()))
        return Fernet(derived_key)
    
    return Fernet(key.encode())

def encrypt_data(data):
    """Encrypt string data"""
    if not data:
        return None
        
    fernet = get_fernet()
    encrypted = fernet.encrypt(data.encode('utf-8'))
    return base64.urlsafe_b64encode(encrypted).decode('utf-8')

def decrypt_data(encrypted_data):
    """Decrypt string data"""
    if not encrypted_data:
        return None
        
    fernet = get_fernet()
    decrypted = fernet.decrypt(base64.urlsafe_b64decode(encrypted_data))
    return decrypted.decode('utf-8')

def encrypt_dict(data_dict):
    """Encrypt sensitive fields in a dictionary"""
    if not data_dict:
        return {}
        
    sensitive_fields = ['password', 'api_key', 'secret', 'token', 'private_key']
    encrypted_dict = data_dict.copy()
    
    for key, value in data_dict.items():
        # Encrypt any field that contains sensitive information
        if any(sensitive in key.lower() for sensitive in sensitive_fields) and value:
            encrypted_dict[key] = encrypt_data(str(value))
            # Mark the field as encrypted
            encrypted_dict[f"{key}_encrypted"] = True
    
    return encrypted_dict

def decrypt_dict(encrypted_dict):
    """Decrypt sensitive fields in a dictionary"""
    if not encrypted_dict:
        return {}
        
    decrypted_dict = encrypted_dict.copy()
    
    for key, value in encrypted_dict.items():
        # Check if the field is marked as encrypted
        if key.endswith('_encrypted'):
            continue
            
        if f"{key}_encrypted" in encrypted_dict and encrypted_dict[f"{key}_encrypted"]:
            decrypted_dict[key] = decrypt_data(value)
            # Remove the encryption marker
            if f"{key}_encrypted" in decrypted_dict:
                del decrypted_dict[f"{key}_encrypted"]
    
    return decrypted_dict
