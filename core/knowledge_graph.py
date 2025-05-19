"""
Knowledge Graph Generator for Database Schemas
"""
import json
import networkx as nx
from collections import defaultdict
from datetime import datetime
import re

class KnowledgeGraphGenerator:
    """
    Generate a knowledge graph from database schema
    """
    
    def __init__(self):
        self.graph = nx.DiGraph()
        self.table_nodes = {}
        self.column_nodes = {}
        self.relationships = []
        self.column_types = defaultdict(lambda: "other")  # Default column type
        self.type_colors = {
            "number": "#4CAF50",  # Green
            "string": "#2196F3",  # Blue
            "datetime": "#FF9800",  # Orange
            "boolean": "#9C27B0",  # Purple
            "other": "#607D8B"    # Gray
        }
    
    def detect_column_type(self, column_name, data_type):
        """
        Detect column type based on name and database type
        """
        data_type = data_type.lower()
        
        # Detect number types
        if any(num_type in data_type for num_type in ["int", "double", "float", "decimal", "numeric"]):
            return "number"
        
        # Detect string types
        if any(str_type in data_type for str_type in ["char", "text", "varchar"]):
            return "string"
        
        # Detect datetime types
        if any(date_type in data_type for date_type in ["date", "time", "timestamp"]):
            return "datetime"
        
        # Detect boolean types
        if "bool" in data_type or data_type == "tinyint(1)":
            return "boolean"
        
        # Detect by column name patterns
        if re.search(r'(^id$|_id$)', column_name.lower()):
            return "number"
        
        if re.search(r'(date|time|created_at|updated_at)', column_name.lower()):
            return "datetime"
        
        if re.search(r'(is_|has_|enable)', column_name.lower()):
            return "boolean"
        
        return "other"
    
    def detect_relationships(self):
        """
        Detect relationships between tables based on column names
        """
        # Group columns by name
        columns_by_name = defaultdict(list)
        
        for col_id, data in self.column_nodes.items():
            column_name = data['label']
            columns_by_name[column_name].append(col_id)
        
        # Find potential relationships based on common column names
        for column_name, column_ids in columns_by_name.items():
            # Skip if only one column with this name (no relationship)
            if len(column_ids) < 2:
                continue
                
            # Check if this might be an ID column (ends with _id or is named 'id')
            is_id_column = column_name.lower().endswith('_id') or column_name.lower() == 'id'
            
            # For every pair of columns with the same name
            for i in range(len(column_ids)):
                for j in range(i+1, len(column_ids)):
                    source = column_ids[i]
                    target = column_ids[j]
                    
                    source_table = self.column_nodes[source]['parent_table']
                    target_table = self.column_nodes[target]['parent_table']
                    
                    # Skip self-relationships on the same table
                    if source_table == target_table:
                        continue
                    
                    # Determine relationship type
                    if is_id_column:
                        rel_type = "foreign_key"
                    else:
                        rel_type = "same_column_name"
                    
                    # Add to relationships
                    self.relationships.append({
                        'source': source,
                        'target': target,
                        'type': rel_type,
                        'label': f"{column_name}"
                    })
    
    def process_mysql_schema(self, schemas):
        """
        Process MySQL schema data into graph nodes and edges
        
        Args:
            schemas: List of schema data from get_mysql_schema_info function
        """
        if not schemas:
            return
            
        # Process tables and columns
        node_id = 0
        
        for schema in schemas:
            schema_name = schema.get('name', 'Unknown')
            
            for table in schema.get('tables', []):
                table_name = table.get('name', 'Unknown')
                node_id += 1
                table_id = f"table_{node_id}"
                
                # Add table node
                self.table_nodes[table_id] = {
                    'id': table_id,
                    'label': table_name,
                    'type': 'table',
                    'schema': schema_name,
                    'rows': table.get('rows', 0)
                }
                
                # Process columns
                for column in table.get('columns', []):
                    col_name = column.get('name', 'Unknown')
                    col_type = column.get('type', 'Unknown')
                    is_key = column.get('key', '') in ['PRI', 'UNI', 'MUL']
                    
                    node_id += 1
                    col_id = f"column_{node_id}"
                    
                    # Detect column type
                    column_type = self.detect_column_type(col_name, col_type)
                    self.column_types[col_id] = column_type
                    
                    # Add column node
                    self.column_nodes[col_id] = {
                        'id': col_id,
                        'label': col_name,
                        'type': 'column',
                        'parent_table': table_id,
                        'data_type': col_type,
                        'column_type': column_type,
                        'is_key': is_key
                    }
                    
                    # Add edge from table to column
                    self.graph.add_edge(table_id, col_id, type='has_column')
        
        # Detect relationships between tables
        self.detect_relationships()
        
        # Add relationship edges to the graph
        for rel in self.relationships:
            self.graph.add_edge(
                rel['source'],
                rel['target'],
                type=rel['type'],
                label=rel['label']
            )
    
    def get_vis_js_data(self):
        """
        Convert graph to visjs format for visualization
        """
        nodes = []
        edges = []
        
        # Add table nodes
        for node_id, data in self.table_nodes.items():
            nodes.append({
                'id': node_id,
                'label': data['label'],
                'group': 'table',
                'title': f"Table: {data['label']}<br>Rows: {data['rows']}",
                'shape': 'box',
                'font': {'size': 16, 'face': 'Roboto'},
                'color': {'background': '#f8f8f8', 'border': '#666'},
                'borderWidth': 2,
                'widthConstraint': 120,
                'shadow': True
            })
        
        # Add column nodes
        for node_id, data in self.column_nodes.items():
            column_type = self.column_types[node_id]
            color = self.type_colors.get(column_type, self.type_colors['other'])
            
            # Add visual cues for primary/foreign keys
            shape = 'ellipse'
            border_width = 1
            border_color = '#666'
            
            if data.get('is_key'):
                shape = 'diamond'
                border_width = 2
                border_color = '#d1b000'  # Gold for keys
                
            nodes.append({
                'id': node_id,
                'label': data['label'],
                'group': 'column',
                'title': f"Column: {data['label']}<br>Type: {data['data_type']}",
                'shape': shape,
                'font': {'size': 12, 'face': 'Roboto'},
                'color': {'background': color, 'border': border_color},
                'borderWidth': border_width,
                'shadow': True
            })
        
        # Add table-column edges
        for u, v, data in self.graph.edges(data=True):
            if data['type'] == 'has_column':
                edges.append({
                    'from': u,
                    'to': v,
                    'arrows': 'to',
                    'width': 1,
                    'color': {'color': '#aaa', 'opacity': 0.7},
                    'smooth': {'type': 'curvedCW', 'roundness': 0.2}
                })
            else:
                # Relationship edges
                edges.append({
                    'from': u,
                    'to': v,
                    'arrows': 'to, from',
                    'label': data.get('label', ''),
                    'width': 2,
                    'dashes': data['type'] != 'foreign_key',
                    'color': {'color': '#FF5722' if data['type'] == 'foreign_key' else '#2196F3'},
                    'smooth': {'type': 'cubicBezier', 'roundness': 0.5}
                })
        
        # Generate legend for column types
        legend = {
            'types': [
                {'type': 'number', 'color': self.type_colors['number'], 'label': 'Number'},
                {'type': 'string', 'color': self.type_colors['string'], 'label': 'String'},
                {'type': 'datetime', 'color': self.type_colors['datetime'], 'label': 'DateTime'},
                {'type': 'boolean', 'color': self.type_colors['boolean'], 'label': 'Boolean'},
                {'type': 'other', 'color': self.type_colors['other'], 'label': 'Other'}
            ],
            'relationships': [
                {'type': 'foreign_key', 'color': '#FF5722', 'label': 'Foreign Key', 'dashed': False},
                {'type': 'same_column_name', 'color': '#2196F3', 'label': 'Same Column Name', 'dashed': True},
            ]
        }
        
        return {
            'nodes': nodes,
            'edges': edges,
            'legend': legend,
            'stats': {
                'tables': len(self.table_nodes),
                'columns': len(self.column_nodes),
                'relationships': len(self.relationships)
            }
        }
    
    def serialize(self):
        """
        Serialize the graph data for saving to database
        """
        return json.dumps(self.get_vis_js_data())
