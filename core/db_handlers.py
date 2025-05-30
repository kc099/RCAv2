# core/db_handlers.py

import mysql.connector
# import psycopg2
import json
import time
import datetime
from typing import Any, Dict, List, Union

def serialize_value(value: Any) -> Any:
    """Convert non-serializable values to serializable ones"""
    if isinstance(value, datetime.datetime):
        return value.isoformat()
    elif isinstance(value, datetime.date):
        return value.isoformat()
    elif isinstance(value, datetime.time):
        return value.isoformat()
    return value

def serialize_row(row: Dict[str, Any]) -> Dict[str, Any]:
    """Convert all values in a row to serializable format"""
    return {key: serialize_value(value) for key, value in row.items()}

def execute_mysql_query(connection_info, query):
    """Execute query in MySQL database"""
    try:
        conn = mysql.connector.connect(
            host=connection_info.get('host'),
            port=connection_info.get('port'),
            database=connection_info.get('database'),
            user=connection_info.get('username'),
            password=connection_info.get('password'),
            buffered=True
        )
        
        cursor = conn.cursor(dictionary=True)
        start_time = time.time()
        cursor.execute(query)
        
        # Handle different query types
        if query.strip().upper().startswith(('SELECT', 'SHOW', 'DESCRIBE', 'EXPLAIN')):
            rows = cursor.fetchall()
            # Serialize each row to handle datetime objects
            serialized_rows = [serialize_row(row) for row in rows]
            result = {
                'columns': [column[0] for column in cursor.description],
                'rows': serialized_rows,  # Using serialized rows instead of raw rows
                'rowCount': len(rows),
                'time': time.time() - start_time
            }
        else:
            # For INSERT, UPDATE, DELETE, etc.
            conn.commit()  # Commit the transaction
            result = {
                'rowCount': cursor.rowcount,
                'time': time.time() - start_time
            }
        
        cursor.close()
        conn.close()
        return result
        
    except mysql.connector.Error as err:
        raise Exception(f"MySQL Error: {err}")

def get_mysql_schema_info(connection_info):
    """Get schema, tables, and column information from MySQL database"""
    try:
        conn = mysql.connector.connect(
            host=connection_info.get('host'),
            port=connection_info.get('port'),
            database=connection_info.get('database'),
            user=connection_info.get('username'),
            password=connection_info.get('password')
        )
        
        cursor = conn.cursor(dictionary=True)
        schemas = []
        
        # Get all tables in the current database
        current_db = connection_info.get('database')
        
        if current_db:
            cursor.execute(
                """SELECT table_schema AS 'schema', 
                          table_name AS 'name', 
                          table_rows AS 'rows',
                          CASE WHEN table_type = 'BASE TABLE' THEN 'table' 
                               WHEN table_type = 'VIEW' THEN 'view' 
                               ELSE table_type END AS 'type'
                   FROM information_schema.tables 
                   WHERE table_schema = %s 
                   ORDER BY table_name""", 
                (current_db,)
            )
            tables = cursor.fetchall()
            
            # Get table and column information
            schema_data = {
                'name': current_db,
                'tables': []
            }
            
            for table in tables:
                # Get column information for each table
                cursor.execute(
                    """SELECT column_name AS 'name', 
                              data_type AS 'type',
                              column_key AS 'key',
                              is_nullable AS 'nullable'
                       FROM information_schema.columns 
                       WHERE table_schema = %s AND table_name = %s 
                       ORDER BY ordinal_position""", 
                    (current_db, table['name'])
                )
                columns = cursor.fetchall()
                
                # Add table with its columns to the schema
                schema_data['tables'].append({
                    'name': table['name'],
                    'type': table['type'],
                    'rows': table['rows'] or 0,
                    'columns': columns
                })
            
            schemas.append(schema_data)
        
        cursor.close()
        conn.close()
        
        return schemas
        
    except mysql.connector.Error as err:
        raise Exception(f"MySQL Error: {err}")

def execute_query(connection_info, query):
    """
    Generic query execution function that routes to appropriate database handler
    Returns (success: bool, result: Any)
    """
    try:
        connection_type = connection_info.get('type', 'mysql').lower()
        
        if connection_type == 'mysql':
            result = execute_mysql_query(connection_info, query)
            return True, result
        elif connection_type in ['redshift', 'postgresql']:
            return False, "Redshift/PostgreSQL connection not yet implemented"
        else:
            return False, f"Unsupported connection type: {connection_type}"
            
    except Exception as e:
        return False, str(e)


def get_schema_for_connection(db_connection):
    """
    Get database schema as a formatted string suitable for LLM context
    Returns a string representation of the database schema
    """
    try:
        connection_config = db_connection.get_connection_config()
        connection_type = connection_config.get('type', 'mysql').lower()
        
        if connection_type == 'mysql':
            schemas = get_mysql_schema_info(connection_config)
            formatted_schema = format_schema_for_llm(schemas)
            return formatted_schema
        elif connection_type in ['redshift', 'postgresql']:
            return "Schema retrieval for Redshift/PostgreSQL not yet implemented"
        else:
            return f"Unsupported connection type: {connection_type}"
            
    except Exception as e:
        return f"Error retrieving schema: {str(e)}"


def format_schema_for_llm(schemas):
    """
    Format schema information into a readable string for LLM context
    """
    if not schemas:
        return "No schema information available"
    
    formatted_schema = ""
    
    for schema in schemas:
        formatted_schema += f"Database: {schema['name']}\n"
        formatted_schema += "=" * (len(schema['name']) + 10) + "\n\n"
        
        if not schema['tables']:
            formatted_schema += "No tables found in this database.\n\n"
            continue
            
        for table in schema['tables']:
            formatted_schema += f"Table: {table['name']} ({table['type']})\n"
            if table['rows']:
                formatted_schema += f"Rows: ~{table['rows']}\n"
            formatted_schema += f"Columns:\n"
            
            for column in table['columns']:
                key_info = ""
                if column['key'] == 'PRI':
                    key_info = " (PRIMARY KEY)"
                elif column['key'] == 'UNI':
                    key_info = " (UNIQUE)"
                elif column['key'] == 'MUL':
                    key_info = " (INDEX)"
                
                nullable_info = "" if column['nullable'] == 'YES' else " NOT NULL"
                
                formatted_schema += f"  - {column['name']}: {column['type']}{key_info}{nullable_info}\n"
            
            formatted_schema += "\n"
    
    return formatted_schema


def execute_redshift_query(connection_info, query):
    """Execute query in Redshift database (placeholder function)"""
    # This is a placeholder function until proper Redshift implementation is added
    raise Exception("Redshift connection not yet implemented. Please use MySQL connection instead.")

