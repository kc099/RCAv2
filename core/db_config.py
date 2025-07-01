import json
import os
from pathlib import Path
from django.conf import settings

# Configuration file path
CONFIG_FILE = os.path.join(settings.BASE_DIR, 'db_config.json')

# Increased timeouts to accommodate longer-running analytical queries
DEFAULT_CONFIG = {
    'query_timeout': 120,          # seconds (was 30)
    'connection_timeout': 15,     # seconds (was 10)
    'pool_minsize': 1,
    'pool_maxsize': 10,
    'pool_recycle': 3600,
    'max_execution_time': 120,    # seconds (was 30)
}

def load_config():
    """Load configuration from file or return defaults"""
    try:
        if os.path.exists(CONFIG_FILE):
            with open(CONFIG_FILE, 'r') as f:
                config = json.load(f)
                # Merge with defaults to ensure all keys exist
                merged_config = DEFAULT_CONFIG.copy()
                merged_config.update(config)
                return merged_config
    except (json.JSONDecodeError, IOError):
        pass
    
    return DEFAULT_CONFIG.copy()

def save_config(config):
    """Save configuration to file"""
    try:
        with open(CONFIG_FILE, 'w') as f:
            json.dump(config, f, indent=2)
        return True
    except IOError:
        return False

def get_config():
    """Get current configuration"""
    return load_config()

def update_config(**kwargs):
    """Update configuration with new values"""
    config = load_config()
    config.update(kwargs)
    save_config(config)
    return config 