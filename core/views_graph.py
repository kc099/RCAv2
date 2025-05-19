"""
Views for knowledge graph generation and retrieval
"""
from django.http import JsonResponse
from django.contrib.auth.decorators import login_required
from django.views.decorators.http import require_http_methods
from django.shortcuts import get_object_or_404

from .models import SQLNotebook, KnowledgeGraph
from .db_handlers import get_mysql_schema_info
from .knowledge_graph import KnowledgeGraphGenerator

@login_required(login_url='/login/')
@require_http_methods(["POST"])
def generate_knowledge_graph(request, notebook_uuid):
    """
    Generate a knowledge graph for the given notebook
    """
    try:
        # Get notebook
        notebook = get_object_or_404(SQLNotebook, uuid=notebook_uuid, user=request.user)
        
        # Get connection info from notebook
        connection_info = notebook.get_connection_info()
        if not connection_info:
            return JsonResponse({
                'success': False,
                'error': 'No database connection available for this notebook'
            })
        
        # Only MySQL is supported for now
        if connection_info.get('type', '').lower() != 'mysql':
            return JsonResponse({
                'success': False,
                'error': 'Knowledge graph generation is currently only supported for MySQL databases'
            })
        
        # Get database schema
        try:
            schemas = get_mysql_schema_info(connection_info)
        except Exception as e:
            return JsonResponse({
                'success': False,
                'error': f'Error retrieving database schema: {str(e)}'
            })
        
        # Generate knowledge graph
        graph_generator = KnowledgeGraphGenerator()
        graph_generator.process_mysql_schema(schemas)
        graph_data = graph_generator.get_vis_js_data()
        
        # Save knowledge graph
        knowledge_graph = KnowledgeGraph.objects.create(
            notebook=notebook,
            user=request.user,
            graph_data=graph_generator.serialize(),
            table_count=graph_data['stats']['tables'],
            column_count=graph_data['stats']['columns'],
            relation_count=graph_data['stats']['relationships']
        )
        
        return JsonResponse({
            'success': True,
            'graph_id': knowledge_graph.id,
            'graph_data': graph_data
        })
        
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': str(e)
        })

@login_required(login_url='/login/')
def get_knowledge_graph(request, notebook_uuid):
    """
    Get the latest knowledge graph for the given notebook
    """
    try:
        # Get notebook
        notebook = get_object_or_404(SQLNotebook, uuid=notebook_uuid, user=request.user)
        
        # Get latest knowledge graph for this notebook
        knowledge_graph = KnowledgeGraph.objects.filter(
            notebook=notebook, 
            user=request.user
        ).order_by('-created_at').first()
        
        if not knowledge_graph:
            return JsonResponse({
                'success': False,
                'error': 'No knowledge graph found for this notebook'
            })
        
        return JsonResponse({
            'success': True,
            'graph_id': knowledge_graph.id,
            'graph_data': knowledge_graph.graph_data,
            'created_at': knowledge_graph.created_at.isoformat(),
            'updated_at': knowledge_graph.updated_at.isoformat()
        })
        
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': str(e)
        })
