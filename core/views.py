from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.urls import reverse
from django.http import HttpResponse, JsonResponse
from django.conf import settings
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.models import User
from django.db import models
import os
import mimetypes
import json
from datetime import datetime
from .forms import LoginForm, SignupForm
from .models import SQLNotebook, SQLCell
import mysql.connector
from .db_handlers import execute_mysql_query, execute_redshift_query

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
    return render(request, 'home.html')


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
    """Validates database connections and file uploads"""
    if request.method != 'POST':
        return JsonResponse({"success": False, "error": "Invalid request method"})
    
    connection_type = request.POST.get('connection_type')
    
    # Handle file uploads (Excel, CSV)
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
    else:
        server = request.POST.get('server')
        port = request.POST.get('port')
        database = request.POST.get('database')
        username = request.POST.get('username')
        password = request.POST.get('password')
        
        if not all([server, port, database, username, password]):
            return JsonResponse({"success": False, "error": "All fields are required"})
        
        if connection_type == 'mysql':
            # Validate MySQL connection
            try:
                conn = mysql.connector.connect(
                    host=server,
                    port=port,
                    database=database,
                    user=username,
                    password=password
                )
                
                if conn.is_connected():
                    conn.close()
                    # Store connection details in session for later use
                    request.session['db_connection'] = {
                        'type': 'mysql',
                        'server': server,
                        'port': port,
                        'database': database,
                        'username': username,
                        'password': password  # In a real app, you'd want to encrypt this
                    }
                    return JsonResponse({"success": True, "redirect_url": reverse('core:workbench')})
                else:
                    return JsonResponse({"success": False, "error": "Failed to connect to MySQL database"})
                    
            except mysql.connector.Error as err:
                return JsonResponse({"success": False, "error": f"MySQL Error: {str(err)}"})
                
        elif connection_type == 'redshift':
            # For now, just passing the validation
            request.session['db_connection'] = {
                'type': 'redshift',
                'server': server,
                'port': port,
                'database': database,
                'username': username,
                'password': password
            }
            return JsonResponse({"success": True, "redirect_url": reverse('core:workbench')})
            
        elif connection_type == 'snowflake':
            # For now, just passing the validation
            request.session['db_connection'] = {
                'type': 'snowflake',
                'server': server,
                'port': port,
                'database': database,
                'username': username,
                'password': password
            }
            return JsonResponse({"success": True, "redirect_url": reverse('core:workbench')})
            
        elif connection_type == 's3':
            # For now, just passing the validation
            request.session['db_connection'] = {
                'type': 's3',
                'server': server,
                'port': port,
                'database': database,
                'username': username,
                'password': password
            }
            return JsonResponse({"success": True, "redirect_url": reverse('core:workbench')})
        
        else:
            return JsonResponse({"success": False, "error": "Invalid connection type"})

@login_required(login_url='/login/')
def workbench(request):
    """Workbench view - requires login"""
    # Check if user has an active database connection in session
    db_connection = request.session.get('db_connection')
    if not db_connection:
        return redirect('core:data_connection_hub')
    
    # Check if user has any notebooks, if not create one
    notebooks = SQLNotebook.objects.filter(user=request.user)
    
    if notebooks.exists():
        # Use the most recently modified notebook
        notebook = notebooks.order_by('-last_modified').first()
    else:
        # Create a new notebook with the current connection info
        notebook = SQLNotebook.objects.create(
            title="Untitled Notebook",
            description="",
            user=request.user,
            connection_info=db_connection
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
    
    context = {
        'connection': db_connection,
        'notebook': notebook,
        'cells': cells_json
    }
    
    return render(request, 'workbench.html', context)


# core/views.py (Add these new views)

@login_required(login_url='/login/')
def notebook_list(request):
    """View to list all notebooks for the current user"""
    notebooks = SQLNotebook.objects.filter(user=request.user).order_by('-last_modified')
    return render(request, 'notebook_list.html', {'notebooks': notebooks})

@login_required(login_url='/login/')
def create_notebook(request):
    """Create a new notebook"""
    if request.method == 'POST':
        title = request.POST.get('title', 'Untitled Notebook')
        description = request.POST.get('description', '')
        # Get connection from session
        connection_info = request.session.get('db_connection')
        
        notebook = SQLNotebook.objects.create(
            title=title,
            description=description,
            user=request.user,
            connection_info=connection_info
        )
        
        # Create initial cell
        SQLCell.objects.create(
            notebook=notebook,
            order=1,
            query="-- Write your SQL here\nSELECT 1;"
        )
        
        return redirect('core:open_notebook', notebook_id=notebook.id)
    
    return render(request, 'create_notebook.html')

@login_required(login_url='/login/')
def open_notebook(request, notebook_id):
    """Open an existing notebook"""
    notebook = get_object_or_404(SQLNotebook, id=notebook_id, user=request.user)
    cells = notebook.cells.all().order_by('order')
    
    # Update session connection info based on notebook
    if notebook.connection_info:
        request.session['db_connection'] = notebook.connection_info
    
    context = {
        'notebook': notebook,
        'cells': cells,
        'connection': notebook.connection_info
    }
    
    return render(request, 'workbench.html', context)

# API views for cell operations
@login_required(login_url='/login/')
def api_add_cell(request, notebook_id):
    """Add a new cell to the notebook"""
    if request.method != 'POST':
        return JsonResponse({'success': False, 'error': 'Invalid request method'})
    
    notebook = get_object_or_404(SQLNotebook, id=notebook_id, user=request.user)
    
    # Get the highest order and add 1
    max_order = SQLCell.objects.filter(notebook=notebook).aggregate(models.Max('order'))['order__max'] or 0
    new_order = max_order + 1
    
    cell = SQLCell.objects.create(
        notebook=notebook,
        order=new_order,
        query="-- Write your SQL here"
    )
    
    return JsonResponse({
        'success': True,
        'cell_id': cell.id,
        'order': cell.order
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
    
    cell = get_object_or_404(SQLCell, id=cell_id, notebook__user=request.user)
    query = request.POST.get('query', cell.query)
    
    # Get connection info from the notebook
    connection_info = cell.notebook.connection_info
    
    start_time = time.time()
    try:
        # Execute query (this will depend on your database adapter)
        result = execute_sql_query(connection_info, query)
        execution_time = time.time() - start_time
        
        # Update cell with results
        cell.query = query
        cell.result = result
        cell.is_executed = True
        cell.execution_time = execution_time
        cell.save()
        
        # Update the notebook's last_modified time
        cell.notebook.save()
        
        return JsonResponse({
            'success': True,
            'result': result,
            'execution_time': execution_time
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
def api_save_notebook(request, notebook_id):
    """Save the entire notebook"""
    if request.method != 'POST':
        return JsonResponse({'success': False, 'error': 'Invalid request method'})
    
    notebook = get_object_or_404(SQLNotebook, id=notebook_id, user=request.user)
    
    try:
        data = json.loads(request.body)
        
        # Update cells if provided
        if 'cells' in data:
            for cell_data in data['cells']:
                cell_id = cell_data.get('id')
                query = cell_data.get('query', '')
                
                if cell_id:
                    # Update existing cell
                    try:
                        cell = SQLCell.objects.get(id=cell_id, notebook=notebook)
                        cell.query = query
                        cell.save()
                    except SQLCell.DoesNotExist:
                        pass  # Skip if cell doesn't exist
        
        # Update notebook's last_modified time
        notebook.save()
        
        return JsonResponse({
            'success': True
        })
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': str(e)
        })

@login_required(login_url='/login/')
def api_update_notebook_title(request, notebook_id):
    """Update notebook title"""
    if request.method != 'POST':
        return JsonResponse({'success': False, 'error': 'Invalid request method'})
    
    notebook = get_object_or_404(SQLNotebook, id=notebook_id, user=request.user)
    title = request.POST.get('title', '').strip()
    
    if not title:
        title = 'Untitled Notebook'
    
    notebook.title = title
    notebook.save()
    
    return JsonResponse({
        'success': True
    })

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
