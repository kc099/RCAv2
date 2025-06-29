# Gunicorn configuration for Django application
# This configuration is optimized for AWS Lightsail deployment

import multiprocessing
import os

# Server socket
bind = "0.0.0.0:8000"
backlog = 2048

# Worker processes
workers = multiprocessing.cpu_count() * 2 + 1
worker_class = "sync"
worker_connections = 1000

# Timeout settings - increased to handle text-to-SQL agent processing
timeout = 200  # 200 seconds worker timeout (for complex 3-minute queries)
keepalive = 60  # Keep alive timeout
max_requests = 1000  # Restart workers after this many requests
max_requests_jitter = 50  # Add randomness to max_requests

# Logging
accesslog = "/var/log/gunicorn/access.log" if os.path.exists("/var/log/gunicorn") else "-"
errorlog = "/var/log/gunicorn/error.log" if os.path.exists("/var/log/gunicorn") else "-"
loglevel = "info"
access_log_format = '%(h)s %(l)s %(u)s %(t)s "%(r)s" %(s)s %(b)s "%(f)s" "%(a)s" %(T)s'

# Process naming
proc_name = 'rca_django'

# Server mechanics
daemon = False  # Don't daemonize when using systemd
pidfile = '/tmp/gunicorn.pid'
user = None  # Let systemd handle user switching
group = None
tmp_upload_dir = None

# SSL - if you want to handle SSL at Gunicorn level (usually nginx handles this)
# keyfile = None
# certfile = None

# Security
limit_request_line = 4094
limit_request_fields = 100
limit_request_field_size = 8190

# Performance tuning for AWS Lightsail
preload_app = True  # Preload app for better performance
worker_tmp_dir = "/dev/shm"  # Use memory for worker tmp directory if available

def on_starting(server):
    """Called just before the master process is initialized."""
    server.log.info("Starting Gunicorn server for RCA Django application")

def on_reload(server):
    """Called to recycle workers during a reload via SIGHUP."""
    server.log.info("Reloading Gunicorn server")

def when_ready(server):
    """Called just after the server is started."""
    server.log.info("Gunicorn server is ready. Workers: %s", server.cfg.workers)

def worker_int(worker):
    """Called when a worker receives the SIGINT or SIGQUIT signal."""
    worker.log.info("Worker received SIGINT or SIGQUIT signal")

def on_exit(server):
    """Called just before exiting."""
    server.log.info("Shutting down Gunicorn server") 