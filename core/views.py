from django.shortcuts import render, redirect
from django.contrib.auth.decorators import login_required
from django.urls import reverse
from django.http import HttpResponse
from django.conf import settings
import os
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
