# core/db_handlers.py

import mysql.connector
# import psycopg2
import json
import time

def execute_mysql_query(connection_info, query):
    """Execute query in MySQL database"""
    try:
        conn = mysql.connector.connect(
            host=connection_info.get('server'),
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
            result = {
                'columns': [column[0] for column in cursor.description],
                'rows': rows,
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

def execute_redshift_query(connection_info, query):
    """Execute query in Redshift database (placeholder function)"""
    # This is a placeholder function until proper Redshift implementation is added
    raise Exception("Redshift connection not yet implemented. Please use MySQL connection instead.")
    
    # Real implementation would look something like this:
    # try:
    #     conn = psycopg2.connect(
    #         host=connection_info.get('server'),
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