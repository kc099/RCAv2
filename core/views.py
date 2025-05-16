from django.shortcuts import render, redirect
from django.contrib.auth.decorators import login_required
from django.urls import reverse
from django.http import HttpResponse, JsonResponse
from django.conf import settings
import os
import json
import mysql.connector
from django.contrib.auth import get_user_model, authenticate, login, logout

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
    
    context = {
        'connection': db_connection
    }
    
    return render(request, 'workbench.html', context)
