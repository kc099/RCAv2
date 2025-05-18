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
            password=connection_info.get('password')
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

def execute_redshift_query(connection_info, query):
    """Execute query in Redshift database (placeholder function)"""
    # This is a placeholder function until proper Redshift implementation is added
    raise Exception("Redshift connection not yet implemented. Please use MySQL connection instead.")
    
    # Real implementation would look something like this:
    # try:
    #     conn = psycopg2.connect(
    #         host=connection_info.get('host'),
    #         port=connection_info.get('port'),
    #         dbname=connection_info.get('database'),
    #         user=connection_info.get('username'),
    #         password=connection_info.get('password')
    #     )
    #     
    #     cursor = conn.cursor()
    #     start_time = time.time()
    #     cursor.execute(query)
        
    #     # Handle different query types
    #     if query.strip().upper().startswith(('SELECT', 'SHOW')):
    #         columns = [desc[0] for desc in cursor.description]
    #         rows = []
    #         for row in cursor.fetchall():
    #             rows.append(dict(zip(columns, row)))
                
    #         result = {
    #             'columns': columns,
    #             'rows': rows,
    #             'rowCount': len(rows),
    #             'time': time.time() - start_time
    #         }
    #     else:
    #         # For INSERT, UPDATE, DELETE, etc.
    #         conn.commit()  # Commit the transaction
    #         result = {
    #             'rowCount': cursor.rowcount,
    #             'time': time.time() - start_time
    #         }
        
    #     cursor.close()
    #     conn.close()
    #     return result
        
    # except psycopg2.Error as err:
    #     raise Exception(f"Redshift Error: {err}")