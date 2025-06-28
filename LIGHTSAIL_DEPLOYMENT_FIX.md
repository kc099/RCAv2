# AWS Lightsail Deployment Fix - Worker Timeout Issue

This document provides solutions for the Gunicorn worker timeout issue that occurs when running the text-to-SQL agent on AWS Lightsail.

## Problem Description

**Error**: `WORKER TIMEOUT (pid:1181) Error handling request /mcp_agent/text-to-sql/`

**Cause**: The text-to-SQL agent takes longer than the default Gunicorn worker timeout (30 seconds) due to:
- Multiple Anthropic API calls during iterations
- Database query execution times  
- Network latency on cloud infrastructure

## Solutions Implemented

### 1. Agent-Level Timeout Handling
The agent now includes:
- **API Timeout**: 20-second timeout on Anthropic API calls
- **Workflow Timeout**: 40-second overall workflow timeout
- **Graceful Degradation**: Uses last successful SQL if timeout occurs

### 2. Gunicorn Configuration
A new `gunicorn.conf.py` file with optimized settings:
- **Worker Timeout**: Increased to 120 seconds
- **Worker Management**: Optimized for cloud deployment
- **Resource Limits**: Configured for AWS Lightsail

### 3. Systemd Service Management
A `rca-django.service` file for better process management:
- **Process Monitoring**: Automatic restart on failure
- **Resource Limits**: Proper file descriptor limits
- **Security**: Hardened service configuration

## Deployment Steps

### Step 1: Update Application Code
The code changes have been automatically applied:
- Agent timeout handling in `mcp_agent/agent_logic.py`
- Workflow start time tracking in `mcp_agent/views.py`

### Step 2: Deploy Gunicorn Configuration
```bash
# Copy the configuration file to your server
scp gunicorn.conf.py ubuntu@your-lightsail-ip:/home/ubuntu/RCAv2/

# Make sure the log directory exists
sudo mkdir -p /var/log/gunicorn
sudo chown ubuntu:ubuntu /var/log/gunicorn
```

### Step 3: Update Systemd Service
```bash
# Copy the service file
sudo cp rca-django.service /etc/systemd/system/

# Reload systemd and restart the service
sudo systemctl daemon-reload
sudo systemctl stop rca-django  # If running
sudo systemctl enable rca-django
sudo systemctl start rca-django
sudo systemctl status rca-django
```

### Step 4: Update Nginx Configuration (Optional)
Add timeout settings to your nginx configuration:

```nginx
server {
    # ... existing configuration ...
    
    location / {
        include proxy_params;
        proxy_pass http://127.0.0.1:8000;
        
        # Timeout settings for long-running requests
        proxy_connect_timeout 60s;
        proxy_send_timeout 120s;
        proxy_read_timeout 120s;
        
        # Buffer settings
        proxy_buffering on;
        proxy_buffer_size 8k;
        proxy_buffers 16 8k;
    }
}
```

Then restart nginx:
```bash
sudo nginx -t
sudo systemctl reload nginx
```

## Alternative: Quick Fix Without Files

If you can't use configuration files, start Gunicorn manually with increased timeout:

```bash
# Stop existing service
sudo systemctl stop rca-django

# Start with manual configuration
cd /home/ubuntu/RCAv2
source .venv/bin/activate
gunicorn --bind 0.0.0.0:8000 \
         --workers 3 \
         --timeout 120 \
         --keepalive 60 \
         --max-requests 1000 \
         --access-logfile /var/log/gunicorn/access.log \
         --error-logfile /var/log/gunicorn/error.log \
         --log-level info \
         rca.wsgi:application
```

## Monitoring and Troubleshooting

### Check Service Status
```bash
# Service status
sudo systemctl status rca-django

# View logs
sudo journalctl -u rca-django -f

# Gunicorn logs
tail -f /var/log/gunicorn/error.log
tail -f /var/log/gunicorn/access.log
```

### Monitor Resource Usage
```bash
# CPU and memory usage
htop

# Process information
ps aux | grep gunicorn

# Network connections
netstat -tlnp | grep :8000
```

### Performance Metrics
The agent now logs performance information:
- API call duration
- SQL execution time  
- Total workflow time
- Iteration count

Look for these in Django logs:
```bash
tail -f /var/log/django/debug.log
```

## Configuration Tuning

### For Low-Resource Lightsail Instances
If you have a small Lightsail instance (512MB - 1GB RAM):

```python
# In gunicorn.conf.py, adjust:
workers = 2  # Reduce workers
timeout = 90  # Slightly lower timeout
worker_tmp_dir = None  # Don't use /dev/shm
```

### For High-Traffic Scenarios
If you expect many concurrent agent requests:

```python
# In gunicorn.conf.py, adjust:
workers = multiprocessing.cpu_count() * 2 + 1  # More workers
worker_connections = 2000  # More connections
max_requests = 500  # Restart workers more frequently
```

## Environment Variables

Ensure these are set in your environment:
```bash
# Required
export ANTHROPIC_API_KEY="your_key_here"

# Optional performance tuning
export DJANGO_DEBUG=False
export DJANGO_LOG_LEVEL=INFO
export DB_QUERY_TIMEOUT=30
```

## Testing the Fix

1. **Deploy the changes** using the steps above
2. **Test agent functionality**:
   ```bash
   curl -X POST http://your-lightsail-ip/mcp_agent/text-to-sql/ \
        -H "Content-Type: application/json" \
        -d '{"query": "show me all tables", "connection_id": 1, "notebook_id": 1}'
   ```
3. **Monitor logs** for timeout messages
4. **Check response times** in browser network tab

## Expected Results

After implementing these fixes:
- ✅ No more worker timeout errors
- ✅ Agent completes complex queries successfully  
- ✅ Graceful handling of long-running operations
- ✅ Better error messages for users
- ✅ Improved monitoring and debugging

## Backup Plan

If issues persist, you can temporarily disable the agent and use manual SQL writing:
1. Comment out the agent endpoint in `mcp_agent/urls.py`
2. Restart the service
3. Users can still write SQL manually in notebooks

## Support

If you continue experiencing issues:
1. Check the logs for specific error messages
2. Monitor resource usage during agent operations
3. Consider upgrading your Lightsail instance size
4. Test with simpler queries first

The timeout fixes should resolve the worker timeout issue while maintaining the agent's functionality and performance. 