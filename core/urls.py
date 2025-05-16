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

urlpatterns += [
    path('notebooks/', views.notebook_list, name='notebook_list'),
    path('notebooks/create/', views.create_notebook, name='create_notebook'),
    path('notebooks/<int:notebook_id>/', views.open_notebook, name='open_notebook'),
    
    # API endpoints
    path('api/notebooks/<int:notebook_id>/add-cell/', views.api_add_cell, name='api_add_cell'),
    path('api/notebooks/<int:notebook_id>/save/', views.api_save_notebook, name='api_save_notebook'), 
    path('api/notebooks/<int:notebook_id>/update-title/', views.api_update_notebook_title, name='api_update_notebook_title'),
    path('api/cells/<int:cell_id>/update/', views.api_update_cell, name='api_update_cell'),
    path('api/cells/<int:cell_id>/execute/', views.api_execute_cell, name='api_execute_cell'),
    path('api/cells/<int:cell_id>/delete/', views.api_delete_cell, name='api_delete_cell'),
]
