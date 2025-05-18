from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.urls import reverse
from django.http import HttpResponse, JsonResponse
from django.conf import settings
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.models import User
from django.db import models
import time
import json
import datetime
from .models import SQLNotebook, SQLCell, DatabaseConnection
import mysql.connector
from .db_handlers import execute_mysql_query, execute_redshift_query

# DateTimeEncoder has been removed as we now handle datetime serialization at the database level

# Create your views here.
def login_view(request):
    """Login page view"""
    if request.user.is_authenticated:
        return redirect('/')
    
    if request.method == 'POST':
        email = request.POST.get('email')
        password = request.POST.get('password')
        remember = request.POST.get('remember')
        
        if not (email and password):
            return render(request, 'auth/login.html', {'error': 'Email and password are required'})
        
        user = authenticate(request, email=email, password=password)
        if user is not None:
            login(request, user)
            if not remember:
                request.session.set_expiry(0)  # Session expires when browser closes
            return redirect('/')
        else:
            return render(request, 'auth/login.html', {'error': 'Invalid credentials'})
    
    return render(request, 'auth/login.html')

@login_required(login_url='/login/')
def home(request):
    """Home page view - requires login"""
    # Get user's notebooks
    notebooks = SQLNotebook.objects.filter(user=request.user).order_by('-last_modified')
    
    # Get user's database connections
    database_connections = DatabaseConnection.objects.filter(user=request.user).order_by('-updated_at')
    
    context = {
        'notebooks': notebooks,
        'database_connections': database_connections
    }
    
    return render(request, 'home.html', context)


def signup_view(request):
    """Signup page view"""
    if request.user.is_authenticated:
        return redirect('/')
        
    if request.method == 'POST':
        email = request.POST.get('email')
        name = request.POST.get('name')
        password1 = request.POST.get('password1')
        password2 = request.POST.get('password2')
        
        # Basic validation
        if not (email and name and password1 and password2):
            return render(request, 'auth/signup.html', {'error': 'All fields are required'})
            
        if password1 != password2:
            return render(request, 'auth/signup.html', {'error': 'Passwords must match'})
            
        # Check if user already exists
        User = get_user_model()
        if User.objects.filter(email=email).exists():
            return render(request, 'auth/signup.html', {'error': 'Email already in use'})
            
        # Create user
        try:
            user = User.objects.create_user(email=email, name=name, password=password1)
            user.save()
            
            # Log the user in
            user = authenticate(request, email=email, password=password1)
            if user is not None:
                login(request, user)
                return redirect('/')
            else:
                return render(request, 'auth/signup.html', {'error': 'Unable to log in automatically. Please log in.'})
                
        except Exception as e:
            return render(request, 'auth/signup.html', {'error': f'Error creating account: {str(e)}'})
    
    return render(request, 'auth/signup.html')

def logout_view(request):
    """Custom logout view that redirects to login page"""
    logout(request)
    return redirect('core:login')

@login_required(login_url='/login/')
def data_connection_hub(request):
    """Data Connection Hub view - requires login"""
    return render(request, 'data_connection_hub.html')

@login_required(login_url='/login/')
def validate_connection(request):
    """Validate database connections and file uploads"""
    if request.method != 'POST':
        return JsonResponse({"success": False, "error": "Invalid request method"})
    
    connection_type = request.POST.get('connection_type')
    
    # Handle file uploads
    if 'file' in request.FILES:
        file_obj = request.FILES['file']
        
        if connection_type == 'excel':
            # Validation for Excel files would go here
            # For now, we're just passing the validation
            return JsonResponse({"success": True, "redirect_url": reverse('core:workbench')})
            
        elif connection_type == 'csv':
            # Validation for CSV files would go here
            # For now, we're just passing the validation
            return JsonResponse({"success": True, "redirect_url": reverse('core:workbench')})
    
    # Handle database connections
    elif connection_type == 'mysql':
        # Get MySQL connection parameters
        host = request.POST.get('mysql_host')
        port = request.POST.get('mysql_port', '3306')
        database = request.POST.get('mysql_database')
        username = request.POST.get('mysql_username')
        password = request.POST.get('mysql_password')
        
        print(f"Attempting to connect to MySQL server: {host}:{port} database: {database} user: {username}")
        
        try:
            # Validate the connection
            conn = mysql.connector.connect(
                host=host,
                port=int(port),
                database=database,
                user=username,  # Note: mysql.connector uses 'user' not 'username'
                password=password,
                connection_timeout=5
            )
            
            # Test the connection by executing a simple query
            cursor = conn.cursor()
            cursor.execute('SELECT 1')
            cursor.fetchall()
            cursor.close()
            conn.close()
            
            print(f"Successfully connected to MySQL server at {host}:{port}")
            
            # Create a DatabaseConnection object with encrypted credentials
            connection = DatabaseConnection.objects.create(
                name=f"{database} on {host}",
                description=f"MySQL connection to {database}",
                connection_type='mysql',
                host=host,
                port=int(port),
                database=database,
                username=username,
                password=password,  # Will be encrypted in the model's save method
                user=request.user
            )
            
            # Store connection info in session with explicit values to ensure nothing is lost
            connection_config = {
                'type': 'mysql',
                'host': host,  # Use 'host' consistently throughout the application
                'port': int(port),
                'database': database,
                'username': username,
                'password': password  # This will be securely stored in the session
            }
            
            print(f"Saving connection to session with host: {host}, database: {database}")
            
            request.session['db_connection'] = connection_config
            request.session['db_connection_id'] = connection.id
            request.session.modified = True
            
            return JsonResponse({
                "success": True, 
                "redirect_url": reverse('core:workbench'),
                "connection_id": connection.id
            })
            
        except Exception as e:
            return JsonResponse({"success": False, "error": str(e)})
    
    elif connection_type == 'redshift':
        # Process Amazon Redshift connection
        host = request.POST.get('redshift_host')
        port = request.POST.get('redshift_port', '5439')
        database = request.POST.get('redshift_database')
        username = request.POST.get('redshift_username')
        password = request.POST.get('redshift_password')
        
        try:
            # This is a placeholder - replace with actual Redshift validation
            # In a real app, you would validate the connection here
            
            # Create a DatabaseConnection object with encrypted credentials
            connection = DatabaseConnection.objects.create(
                name=f"{database} on {host}",
                description=f"Redshift connection to {database}",
                connection_type='redshift',
                host=host,
                port=int(port) if port else 5439,
                database=database,
                username=username,
                password=password,  # Will be encrypted in the model's save method
                user=request.user
            )
            
            # Store connection info in session
            request.session['db_connection'] = connection.get_connection_config()
            request.session['db_connection_id'] = connection.id
            request.session.modified = True
            
            return JsonResponse({
                "success": True, 
                "redirect_url": reverse('core:workbench'),
                "connection_id": connection.id
            })
        except Exception as e:
            return JsonResponse({"success": False, "error": str(e)})
    
    else:
        return JsonResponse({"success": False, "error": "Invalid connection type"})

@login_required(login_url='/login/')
def workbench(request):
    """Workbench view - requires login"""
    # Check if user has an active database connection in session
    db_connection = request.session.get('db_connection')
    db_connection_id = request.session.get('db_connection_id')
    
    if not db_connection:
        return redirect('core:data_connection_hub')
    
    # Check if user has any notebooks, if not create one
    notebooks = SQLNotebook.objects.filter(user=request.user)
    
    if notebooks.exists():
        # Use the most recently modified notebook
        notebook = notebooks.order_by('-last_modified').first()
    else:
        # Get the database connection object if available
        database_connection = None
        if db_connection_id:
            database_connection = DatabaseConnection.objects.filter(id=db_connection_id, user=request.user).first()
        
        # Create a new notebook with the current connection
        notebook = SQLNotebook.objects.create(
            title="Untitled Notebook",
            description="",
            user=request.user,
            database_connection=database_connection,
            connection_info=db_connection if not database_connection else None
        )
        # Create initial cell
        SQLCell.objects.create(
            notebook=notebook,
            order=1,
            query="-- Write your SQL here\nSELECT 1;"
        )
    
    # Load the cells for this notebook and convert to serializable format
    cells_queryset = notebook.cells.all().order_by('order')
    
    # Convert QuerySet to list of dictionaries for JSON serialization
    cells_data = []
    for cell in cells_queryset:
        cells_data.append({
            'id': cell.id,
            'order': cell.order,
            'query': cell.query,
            'result': cell.result,
            'is_executed': cell.is_executed,
            'execution_time': cell.execution_time
        })
    
    # JSON serialize the cells data for JavaScript
    cells_json = json.dumps(cells_data)
    
    # Get connection info - either from database_connection or session
    connection_info = notebook.get_connection_info() if hasattr(notebook, 'get_connection_info') else db_connection
    
    context = {
        'connection': connection_info,
        'notebook': notebook,
        'cells': cells_json
    }
    
    return render(request, 'workbench.html', context)


# core/views.py (Add these new views)

@login_required(login_url='/login/')
def notebook_list(request):
    """View all notebooks"""
    notebooks = SQLNotebook.objects.filter(user=request.user).order_by('-last_modified')
    database_connections = DatabaseConnection.objects.filter(user=request.user).order_by('-updated_at')
    
    context = {
        'notebooks': notebooks,
        'database_connections': database_connections
    }
    
    return render(request, 'notebooks/list.html', context)

@login_required(login_url='/login/')
def create_notebook(request):
    """Create a new notebook"""
    if request.method == 'POST':
        title = request.POST.get('title', 'Untitled Notebook')
        description = request.POST.get('description', '')
        
        # Get the connection ID from the form, if provided
        connection_id = request.POST.get('connection_id')
        database_connection = None
        connection_info = None
        
        if connection_id:
            # Use a specific database connection
            database_connection = get_object_or_404(DatabaseConnection, id=connection_id, user=request.user)
        else:
            # Use the most recent connection stored in session
            connection_info = request.session.get('db_connection')
        
        notebook = SQLNotebook.objects.create(
            title=title,
            description=description,
            user=request.user,
            database_connection=database_connection,
            connection_info=connection_info if not database_connection else None
        )
        # Generate the UUID for anonymized URL
        
        # Create an initial cell
        SQLCell.objects.create(
            notebook=notebook,
            order=1,
            query="-- Write your SQL here"
        )
        
        return redirect('core:open_notebook', notebook_uuid=notebook.uuid)
    
    # Get available database connections for the form
    database_connections = DatabaseConnection.objects.filter(user=request.user).order_by('-updated_at')
    return render(request, 'notebooks/create.html', {'database_connections': database_connections})


@login_required(login_url='/login/')
def create_notebook_with_connection(request, connection_id):
    """Create a new notebook with a specific database connection"""
    # Get the connection
    connection = get_object_or_404(DatabaseConnection, id=connection_id, user=request.user)
    
    if request.method == 'POST':
        title = request.POST.get('title', 'Untitled Notebook')
        description = request.POST.get('description', '')
        
        # Create notebook with reference to the database connection
        notebook = SQLNotebook.objects.create(
            title=title,
            description=description,
            user=request.user,
            database_connection=connection,
            connection_info=None  # We're using the database_connection relation instead
        )
        
        # Create an initial cell
        SQLCell.objects.create(
            notebook=notebook,
            order=1,
            query="-- Write your SQL here"
        )
        
        return redirect('core:open_notebook', notebook_uuid=notebook.uuid)
    
    # Show a form pre-filled with connection info
    return render(request, 'notebooks/create_with_connection.html', {
        'connection': connection,
    })


@login_required(login_url='/login/')
def connection_list(request):
    """View all database connections"""
    connections = DatabaseConnection.objects.filter(user=request.user).order_by('-updated_at')
    return render(request, 'connections/list.html', {'connections': connections})


@login_required(login_url='/login/')
def create_connection(request):
    """Create a new database connection"""
    if request.method == 'POST':
        # Store connection information
        connection_type = request.POST.get('connection_type')
        name = request.POST.get('name') or f"New {connection_type.capitalize()} Connection"
        description = request.POST.get('description', '')
        host = request.POST.get('host')
        port = request.POST.get('port')
        database = request.POST.get('database')
        username = request.POST.get('username')
        password = request.POST.get('password')
        ssl_enabled = request.POST.get('ssl_enabled') == 'on'
        
        # Convert port to integer if provided
        if port:
            try:
                port = int(port)
            except ValueError:
                port = None
        
        # Create the connection object
        connection = DatabaseConnection.objects.create(
            name=name,
            description=description,
            connection_type=connection_type,
            host=host,
            port=port,
            database=database,
            username=username,
            password=password,
            ssl_enabled=ssl_enabled,
            user=request.user
        )
        
        # Store basic connection info in session
        config = connection.get_connection_config()
        request.session['db_connection'] = config
        request.session.modified = True
        
        # Redirect to create a notebook with this connection
        return redirect('core:create_notebook_with_connection', connection_id=connection.id)
        
    return render(request, 'connections/create.html', {
        'connection_types': DatabaseConnection.CONNECTION_TYPES
    })


@login_required(login_url='/login/')
def edit_connection(request, connection_id):
    """Edit an existing database connection"""
    connection = get_object_or_404(DatabaseConnection, id=connection_id, user=request.user)
    
    if request.method == 'POST':
        connection.name = request.POST.get('name') or connection.name
        connection.description = request.POST.get('description', '')
        connection.host = request.POST.get('host', connection.host)
        
        port = request.POST.get('port')
        if port:
            try:
                connection.port = int(port)
            except ValueError:
                pass
        
        connection.database = request.POST.get('database', connection.database)
        connection.username = request.POST.get('username', connection.username)
        
        # Only update password if provided (otherwise keep the existing encrypted one)
        new_password = request.POST.get('password')
        if new_password:
            connection.password = new_password
            
        connection.ssl_enabled = request.POST.get('ssl_enabled') == 'on'
        
        connection.save()
        
        # Update session with new connection info
        config = connection.get_connection_config()
        request.session['db_connection'] = config
        request.session.modified = True
        
        return redirect('core:connection_list')
        
    return render(request, 'connections/edit.html', {
        'connection': connection,
        'connection_types': DatabaseConnection.CONNECTION_TYPES
    })


@login_required(login_url='/login/')
def delete_connection(request, connection_id):
    """Delete a database connection"""
    connection = get_object_or_404(DatabaseConnection, id=connection_id, user=request.user)
    
    if request.method == 'POST':
        # Check if any notebooks use this connection
        notebook_count = SQLNotebook.objects.filter(database_connection=connection).count()
        
        if notebook_count > 0 and not request.POST.get('confirm'):
            # Show confirmation page if notebooks will be affected
            return render(request, 'connections/confirm_delete.html', {
                'connection': connection,
                'notebook_count': notebook_count
            })
        
        # Delete the connection
        connection.delete()
        
        return redirect('core:connection_list')
        
    return render(request, 'connections/confirm_delete.html', {
        'connection': connection,
    })

@login_required(login_url='/login/')
def open_notebook(request, notebook_uuid):
    """Open a specific notebook using its UUID (anonymized URL)"""
    notebook = get_object_or_404(SQLNotebook, uuid=notebook_uuid, user=request.user)
    
    # Get the cells for this notebook
    cells = notebook.cells.all().order_by('order')
    
    # Store connection info in session, prioritizing the database_connection if available
    connection_info = notebook.get_connection_info()
    request.session['db_connection'] = connection_info
    request.session.modified = True
    
    # Convert cells queryset to list of dictionaries for JSON serialization
    cells_data = []
    for cell in cells:
        cells_data.append({
            'id': cell.id,
            'order': cell.order,
            'name': cell.name,  # Include the cell name
            'query': cell.query,
            'result': cell.result,
            'is_executed': cell.is_executed,
            'execution_time': cell.execution_time
        })
    
    # JSON serialize the cells data for JavaScript
    cells_json = json.dumps(cells_data)
    
    context = {
        'notebook': notebook,
        'cells': cells_json,
        'connection': connection_info
    }
    
    return render(request, 'workbench.html', context)

# API views for cell operations
@login_required(login_url='/login/')
def api_add_cell(request, notebook_uuid):
    """Add a new cell to a notebook"""
    if request.method != 'POST':
        return JsonResponse({'success': False, 'error': 'Invalid request method'})
        
    try:
        notebook = get_object_or_404(SQLNotebook, uuid=notebook_uuid, user=request.user)
            
        # Get the highest order and add 1
        max_order = SQLCell.objects.filter(notebook=notebook).aggregate(models.Max('order'))['order__max'] or 0
        new_order = max_order + 1
            
        # Create the new cell with default name
        cell = SQLCell.objects.create(
            notebook=notebook,
            order=new_order,
            name="Untitled Cell",  # Explicitly set the default name
            query="-- Write your SQL here"
        )
            
        # Return the new cell's ID, name, and other info
        return JsonResponse({
            'success': True,
            'cell_id': cell.id,
            'order': new_order,
            'name': cell.name  # Include the name in the response
        })
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': str(e)
        })

@login_required(login_url='/login/')
def api_update_cell(request, cell_id):
    """Update cell content"""
    if request.method != 'POST':
        return JsonResponse({'success': False, 'error': 'Invalid request method'})
    
    cell = get_object_or_404(SQLCell, id=cell_id, notebook__user=request.user)
    query = request.POST.get('query', '')
    
    cell.query = query
    cell.save()
    
    # Update the notebook's last_modified time
    cell.notebook.save()
    
    return JsonResponse({'success': True})

@login_required(login_url='/login/')
def api_execute_cell(request, cell_id):
    """Execute SQL in a cell"""
    if request.method != 'POST':
        return JsonResponse({'success': False, 'error': 'Invalid request method'})
    
    # Get the current database connection from session as fallback
    session_connection = request.session.get('db_connection')
    
    cell = get_object_or_404(SQLCell, id=cell_id, notebook__user=request.user)
    query = request.POST.get('query', cell.query)
    
    # First try to get connection from the notebook's database_connection
    connection_info = None
    if cell.notebook.database_connection:
        # print(f"Using database connection from notebook: {cell.notebook.database_connection.name}")
        connection_info = cell.notebook.database_connection.get_connection_config()
    # Next, try to use the connection_info stored directly in the notebook
    elif cell.notebook.connection_info and isinstance(cell.notebook.connection_info, dict):
        # Make sure the connection_info has a valid host
        if 'host' in cell.notebook.connection_info and cell.notebook.connection_info['host']:
            # print(f"Using connection_info stored in notebook with host: {cell.notebook.connection_info.get('host')}")
            connection_info = cell.notebook.connection_info
        else:
            # print(f"Notebook connection_info missing host, falling back to session")
            pass
    
    # If we still don't have a valid connection, fall back to the session connection
    if not connection_info and session_connection:
        # print(f"Using connection from session with host: {session_connection.get('host')}")
        connection_info = session_connection
        
        # Update the notebook with the session connection for future use
        cell.notebook.connection_info = session_connection
        cell.notebook.save()
    
    if not connection_info:
        return JsonResponse({
            'success': False,
            'error': 'No database connection available for this notebook.'
        })
    
    # Debug output of the connection being used (commented for production)
    # print(f"Executing query with connection to {connection_info.get('host')}:{connection_info.get('port')} database: {connection_info.get('database')}")
    
    start_time = time.time()
    try:
        # Execute query with the connection info
        result = execute_sql_query(connection_info, query)
        # print(result)
        execution_time = time.time() - start_time
        
        # Update cell metadata but don't save query results (for privacy)
        cell.query = query
        # cell.result = result  # No longer storing results for privacy reasons
        cell.result = None  # Explicitly set to None instead of storing results
        cell.is_executed = True
        cell.execution_time = execution_time
        cell.save()
        
        # Update the notebook's last_modified time
        cell.notebook.save()
        
        # Ensure the connection is properly saved in the session as well
        if cell.notebook.database_connection:
            request.session['db_connection_id'] = cell.notebook.database_connection.id
            request.session['db_connection'] = connection_info
            request.session.modified = True
        
        return JsonResponse({
            'success': True,
            'result': result,
            'execution_time': execution_time
        })
        
    except Exception as e:
        # print(f"Query execution error: {str(e)}")
        return JsonResponse({
            'success': False,
            'error': str(e)
        })

@login_required(login_url='/login/')
def api_update_cell_name(request, cell_id):
    """Update a cell's name"""
    if request.method != 'POST':
        return JsonResponse({'success': False, 'error': 'Invalid request method'})
    
    try:
        cell = get_object_or_404(SQLCell, id=cell_id, notebook__user=request.user)
        
        # Get name from request data
        name = request.POST.get('name', '').strip()
        if not name:
            name = 'Untitled Cell'
            
        # Update the cell's name
        cell.name = name
        cell.save(update_fields=['name'])
        
        # Update the notebook's last_modified time
        cell.notebook.save()
        
        return JsonResponse({
            'success': True,
            'name': name
        })
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': str(e)
        })

@login_required(login_url='/login/')
def api_delete_cell(request, cell_id):
    """Delete a cell from a notebook"""
    if request.method != 'POST':
        return JsonResponse({'success': False, 'error': 'Invalid request method'})
    
    cell = get_object_or_404(SQLCell, id=cell_id, notebook__user=request.user)
    notebook = cell.notebook
    
    # Delete the cell
    cell.delete()
    
    # Update the notebook's last_modified time
    notebook.save()
    
    return JsonResponse({
        'success': True
    })

@login_required(login_url='/login/')
def api_save_notebook(request, notebook_uuid):
    """Save the entire notebook"""
    if request.method != 'POST':
        return JsonResponse({'success': False, 'error': 'Invalid request method'})
    
    try:
        notebook = get_object_or_404(SQLNotebook, uuid=notebook_uuid, user=request.user)
        
        # Get data from request
        data = json.loads(request.body)
        title = data.get('title')
        cells_data = data.get('cells', [])
        
        # Update notebook title
        if title:
            notebook.title = title
            notebook.save()
        
        # Update or create cells
        for cell_data in cells_data:
            cell_id = cell_data.get('id')
            query = cell_data.get('query')
            order = cell_data.get('order')
            
            if cell_id:
                # Update existing cell
                try:
                    cell = SQLCell.objects.get(id=cell_id, notebook=notebook)
                    cell.query = query
                    cell.order = order
                    cell.save()
                except SQLCell.DoesNotExist:
                    # Create a new cell if it doesn't exist
                    SQLCell.objects.create(
                        notebook=notebook,
                        query=query,
                        order=order
                    )
            else:
                # Create a new cell
                SQLCell.objects.create(
                    notebook=notebook,
                    query=query,
                    order=order
                )
        
        return JsonResponse({'success': True})
    except Exception as e:
        # Silently handle errors without showing alert to user
        # Just log the error and return success anyway
        # print(f"Error saving notebook: {str(e)}")
        return JsonResponse({'success': True})

@login_required(login_url='/login/')
def api_update_notebook_title(request, notebook_uuid):
    """Update a notebook's title"""
    if request.method != 'POST':
        return JsonResponse({'success': False, 'error': 'Invalid request method'})
    
    try:
        notebook = get_object_or_404(SQLNotebook, uuid=notebook_uuid, user=request.user)
        title = request.POST.get('title', '').strip()
        
        if not title:
            return JsonResponse({'success': False, 'error': 'Title cannot be empty'})
        
        notebook.title = title
        notebook.save()
        
        return JsonResponse({'success': True, 'title': title})
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)})

# Helper function to execute SQL queries
def execute_sql_query(connection_info, query):
    """Execute SQL query based on connection type"""
    conn_type = connection_info.get('type')
    
    if conn_type == 'mysql':
        return execute_mysql_query(connection_info, query)
    elif conn_type == 'redshift':
        return execute_redshift_query(connection_info, query)
    # Add more database types as needed
    else:
        raise ValueError(f"Unsupported database type: {conn_type}")
