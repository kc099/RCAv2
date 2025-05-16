from django.urls import path
from . import views

app_name = 'core'

urlpatterns = [
    path('', views.home, name='home'),
    path('login/', views.login_view, name='login'),
    path('signup/', views.signup_view, name='signup'),
    path('logout/', views.logout_view, name='logout'),
    path('data-connection-hub/', views.data_connection_hub, name='data_connection_hub'),
    path('validate-connection/', views.validate_connection, name='validate_connection'),
    path('workbench/', views.workbench, name='workbench'),
]
