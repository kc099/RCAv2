from django.urls import path
from . import views
from . import views_oauth
from . import views_graph

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
    # Notebook routes
    path('notebooks/', views.notebook_list, name='notebook_list'),
    path('notebooks/create/', views.create_notebook, name='create_notebook'),
    path('notebooks/<uuid:notebook_uuid>/', views.open_notebook, name='open_notebook'),
    path('notebooks/create/connection/<int:connection_id>/', views.create_notebook_with_connection, name='create_notebook_with_connection'),
    
    # Database connection routes
    path('connections/', views.connection_list, name='connection_list'),
    path('connections/create/', views.create_connection, name='create_connection'),
    path('connections/<int:connection_id>/', views.edit_connection, name='edit_connection'),
    path('connections/<int:connection_id>/delete/', views.delete_connection, name='delete_connection'),
    
    # OAuth related routes are handled by django-allauth
]

urlpatterns += [
    # API endpoints
    path('api/notebooks/<uuid:notebook_uuid>/add-cell/', views.api_add_cell, name='api_add_cell'),
    path('api/notebooks/<uuid:notebook_uuid>/save/', views.api_save_notebook, name='api_save_notebook'), 
    path('api/notebooks/<uuid:notebook_uuid>/update-title/', views.api_update_notebook_title, name='api_update_notebook_title'),
    path('api/cells/<int:cell_id>/update/', views.api_update_cell, name='api_update_cell'),
    path('api/cells/<int:cell_id>/update-name/', views.api_update_cell_name, name='api_update_cell_name'),
    path('api/cells/<int:cell_id>/execute/', views.api_execute_cell, name='api_execute_cell'),
    path('api/cells/<int:cell_id>/delete/', views.api_delete_cell, name='api_delete_cell'),
    path('api/notebooks/<uuid:notebook_uuid>/schema/', views.api_get_database_schema, name='api_get_database_schema'),
    path('api/database-schema/', views.api_get_database_schema, name='api_get_database_schema_no_notebook'),
    
    # Knowledge Graph endpoints
    path('api/notebooks/<uuid:notebook_uuid>/knowledge-graph/generate/', views_graph.generate_knowledge_graph, name='generate_knowledge_graph'),
    path('api/notebooks/<uuid:notebook_uuid>/knowledge-graph/', views_graph.get_knowledge_graph, name='get_knowledge_graph'),
]
