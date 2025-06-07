# core/db_handlers.py

import mysql.connector
import psycopg2
import asyncpg
import json
import time
import datetime
import asyncio
import aiomysql
from typing import Any, Dict, List, Union, Optional
from threading import Lock
import logging

# Set up logging
logger = logging.getLogger(__name__)

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

class MySQLConnectionPool:
    """MySQL connection pool manager using aiomysql"""
    
    def __init__(self):
        self._pools = {}  # Connection pools keyed by connection string
        self._lock = Lock()
        
    def _get_pool_key(self, connection_info):
        """Generate a unique key for connection pooling"""
        return f"{connection_info.get('host')}:{connection_info.get('port')}:{connection_info.get('database')}:{connection_info.get('username')}"
    
    async def get_pool(self, connection_info):
        """Get or create a connection pool for the given connection info"""
        pool_key = self._get_pool_key(connection_info)
        
        with self._lock:
            if pool_key not in self._pools:
                try:
                    # Create new connection pool with configurable settings
                    config = get_db_config()
                    pool = await aiomysql.create_pool(
                        host=connection_info.get('host'),
                        port=connection_info.get('port', 3306),
                        user=connection_info.get('username'),
                        password=connection_info.get('password'),
                        db=connection_info.get('database'),
                        minsize=config['pool_minsize'],
                        maxsize=config['pool_maxsize'],
                        echo=False,
                        autocommit=True,
                        pool_recycle=config['pool_recycle'],
                        connect_timeout=config['connection_timeout'],
                        charset='utf8mb4'
                    )
                    self._pools[pool_key] = pool
                    logger.info(f"Created new connection pool for {pool_key}")
                except Exception as e:
                    logger.error(f"Failed to create connection pool: {e}")
                    raise
                    
            return self._pools[pool_key]
    
    async def close_all_pools(self):
        """Close all connection pools"""
        with self._lock:
            for pool_key, pool in self._pools.items():
                try:
                    pool.close()
                    await pool.wait_closed()
                    logger.info(f"Closed connection pool for {pool_key}")
                except Exception as e:
                    logger.error(f"Error closing pool {pool_key}: {e}")
            self._pools.clear()

class PostgreSQLConnectionPool:
    """PostgreSQL connection pool manager using asyncpg"""
    
    def __init__(self):
        self._pools = {}  # Connection pools keyed by connection string
        self._lock = Lock()
        
    def _get_pool_key(self, connection_info):
        """Generate a unique key for connection pooling"""
        return f"{connection_info.get('host')}:{connection_info.get('port')}:{connection_info.get('database')}:{connection_info.get('username')}"
    
    async def get_pool(self, connection_info):
        """Get or create a connection pool for the given connection info"""
        pool_key = self._get_pool_key(connection_info)
        
        with self._lock:
            if pool_key not in self._pools:
                try:
                    # Create new connection pool with configurable settings
                    config = get_db_config()
                    pool = await asyncpg.create_pool(
                        host=connection_info.get('host'),
                        port=connection_info.get('port', 5432),
                        user=connection_info.get('username'),
                        password=connection_info.get('password'),
                        database=connection_info.get('database'),
                        min_size=config['pool_minsize'],
                        max_size=config['pool_maxsize'],
                        command_timeout=config['connection_timeout'],
                    )
                    self._pools[pool_key] = pool
                    logger.info(f"Created new PostgreSQL connection pool for {pool_key}")
                except Exception as e:
                    logger.error(f"Failed to create PostgreSQL connection pool: {e}")
                    raise
                    
            return self._pools[pool_key]
    
    async def close_all_pools(self):
        """Close all connection pools"""
        with self._lock:
            for pool_key, pool in self._pools.items():
                try:
                    await pool.close()
                    logger.info(f"Closed PostgreSQL connection pool for {pool_key}")
                except Exception as e:
                    logger.error(f"Error closing PostgreSQL pool {pool_key}: {e}")
            self._pools.clear()

# Global connection pool managers
_connection_pool = MySQLConnectionPool()
_postgresql_pool = PostgreSQLConnectionPool()

# Import persistent configuration
from .db_config import get_config, update_config

def configure_db_settings(**kwargs):
    """Configure database settings globally"""
    config = update_config(**kwargs)
    logger.info(f"Updated database configuration: {config}")
    return config

def get_db_config():
    """Get current database configuration"""
    return get_config()

async def close_connection_pools():
    """Close all connection pools - useful for cleanup"""
    await _connection_pool.close_all_pools()
    await _postgresql_pool.close_all_pools()

async def execute_mysql_query_async(connection_info, query, query_timeout=None):
    """Execute query using connection pool with timeout"""
    try:
        if query_timeout is None:
            query_timeout = get_db_config()['query_timeout']
            
        pool = await _connection_pool.get_pool(connection_info)
        
        async with pool.acquire() as conn:
            async with conn.cursor(aiomysql.DictCursor) as cursor:
                start_time = time.time()
                
                # Execute query with timeout
                try:
                    await asyncio.wait_for(cursor.execute(query), timeout=query_timeout)
                except asyncio.TimeoutError:
                    raise Exception(f"Query timeout after {query_timeout} seconds")
                
                # Handle different query types
                if query.strip().upper().startswith(('SELECT', 'SHOW', 'DESCRIBE', 'EXPLAIN')):
                    rows = await cursor.fetchall()
                    # Convert rows to list of dicts and serialize
                    serialized_rows = [serialize_row(dict(row)) for row in rows]
                    
                    # Get column names
                    columns = [desc[0] for desc in cursor.description] if cursor.description else []
                    
                    result = {
                        'columns': columns,
                        'rows': serialized_rows,
                        'rowCount': len(rows),
                        'time': time.time() - start_time
                    }
                else:
                    # For INSERT, UPDATE, DELETE, etc.
                    # Note: autocommit is enabled in pool, so no need to commit
                    result = {
                        'rowCount': cursor.rowcount,
                        'time': time.time() - start_time
                    }
                
                return result
                
    except Exception as e:
        logger.error(f"MySQL query execution error: {e}")
        raise Exception(f"MySQL Error: {e}")

def execute_mysql_query(connection_info, query, query_timeout=None):
    """Synchronous wrapper for async MySQL query execution"""
    try:
        if query_timeout is None:
            query_timeout = get_db_config()['query_timeout']
        # Get or create event loop
        try:
            loop = asyncio.get_event_loop()
        except RuntimeError:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
        
        # If the loop is already running (e.g., in Django async views), 
        # we need to run in a thread pool
        if loop.is_running():
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as executor:
                future = executor.submit(asyncio.run, execute_mysql_query_async(connection_info, query, query_timeout))
                return future.result()
        else:
            return loop.run_until_complete(execute_mysql_query_async(connection_info, query, query_timeout))
            
    except Exception as e:
        # Fallback to synchronous connection if async fails
        logger.warning(f"Async execution failed, falling back to sync: {e}")
        return execute_mysql_query_fallback(connection_info, query, query_timeout)

def execute_mysql_query_fallback(connection_info, query, query_timeout=None):
    """Fallback synchronous MySQL query execution with timeout"""
    try:
        if query_timeout is None:
            query_timeout = get_db_config()['query_timeout']
        # Configure connection with timeout
        config = {
            'host': connection_info.get('host'),
            'port': connection_info.get('port'),
            'database': connection_info.get('database'),
            'user': connection_info.get('username'),
            'password': connection_info.get('password'),
            'buffered': True,
            'connection_timeout': get_db_config()['connection_timeout'],
            'autocommit': True,
            'charset': 'utf8mb4'
        }
        
        conn = mysql.connector.connect(**config)
        
        cursor = conn.cursor(dictionary=True)
        start_time = time.time()
        
        # Set session timeout for the query
        cursor.execute(f"SET SESSION max_execution_time = {query_timeout * 1000}")  # Convert to milliseconds
        cursor.execute(query)
        
        # Handle different query types
        if query.strip().upper().startswith(('SELECT', 'SHOW', 'DESCRIBE', 'EXPLAIN')):
            rows = cursor.fetchall()
            # Serialize each row to handle datetime objects
            serialized_rows = [serialize_row(row) for row in rows]
            result = {
                'columns': [column[0] for column in cursor.description],
                'rows': serialized_rows,
                'rowCount': len(rows),
                'time': time.time() - start_time
            }
        else:
            # For INSERT, UPDATE, DELETE, etc.
            result = {
                'rowCount': cursor.rowcount,
                'time': time.time() - start_time
            }
        
        cursor.close()
        conn.close()
        return result
        
    except mysql.connector.Error as err:
        raise Exception(f"MySQL Error: {err}")

async def get_mysql_schema_info_async(connection_info):
    """Get schema, tables, and column information from MySQL database using connection pool"""
    try:
        pool = await _connection_pool.get_pool(connection_info)
        
        async with pool.acquire() as conn:
            async with conn.cursor(aiomysql.DictCursor) as cursor:
                schemas = []
                
                # Get all tables in the current database
                current_db = connection_info.get('database')
                
                if current_db:
                    await cursor.execute(
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
                    tables = await cursor.fetchall()
                    
                    # Get table and column information
                    schema_data = {
                        'name': current_db,
                        'tables': []
                    }
                    
                    for table in tables:
                        # Get column information for each table
                        await cursor.execute(
                            """SELECT column_name AS 'name', 
                                      data_type AS 'type',
                                      column_key AS 'key',
                                      is_nullable AS 'nullable'
                               FROM information_schema.columns 
                               WHERE table_schema = %s AND table_name = %s 
                               ORDER BY ordinal_position""", 
                            (current_db, table['name'])
                        )
                        columns = await cursor.fetchall()
                        
                        # Convert columns to list of dicts
                        columns_list = [dict(col) for col in columns]
                        
                        # Add table with its columns to the schema
                        schema_data['tables'].append({
                            'name': table['name'],
                            'type': table['type'],
                            'rows': table['rows'] or 0,
                            'columns': columns_list
                        })
                    
                    schemas.append(schema_data)
                
                return schemas
                
    except Exception as e:
        logger.error(f"MySQL schema info error: {e}")
        raise Exception(f"MySQL Error: {e}")

def get_mysql_schema_info(connection_info):
    """Synchronous wrapper for async MySQL schema info retrieval"""
    try:
        # Get or create event loop
        try:
            loop = asyncio.get_event_loop()
        except RuntimeError:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
        
        # If the loop is already running, run in thread pool
        if loop.is_running():
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as executor:
                future = executor.submit(asyncio.run, get_mysql_schema_info_async(connection_info))
                return future.result()
        else:
            return loop.run_until_complete(get_mysql_schema_info_async(connection_info))
            
    except Exception as e:
        # Fallback to synchronous connection if async fails
        logger.warning(f"Async schema retrieval failed, falling back to sync: {e}")
        return get_mysql_schema_info_fallback(connection_info)

def get_mysql_schema_info_fallback(connection_info):
    """Fallback synchronous MySQL schema info retrieval"""
    try:
        config = {
            'host': connection_info.get('host'),
            'port': connection_info.get('port'),
            'database': connection_info.get('database'),
            'user': connection_info.get('username'),
            'password': connection_info.get('password'),
            'connection_timeout': get_db_config()['connection_timeout'],
            'charset': 'utf8mb4'
        }
        
        conn = mysql.connector.connect(**config)
        
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

async def execute_postgresql_query_async(connection_info, query, query_timeout=None):
    """Execute query using PostgreSQL connection pool with timeout"""
    try:
        if query_timeout is None:
            query_timeout = get_db_config()['query_timeout']
            
        pool = await _postgresql_pool.get_pool(connection_info)
        
        async with pool.acquire() as conn:
            start_time = time.time()
            
            # Execute query with timeout
            try:
                if query.strip().upper().startswith(('SELECT', 'SHOW', 'DESCRIBE', 'EXPLAIN', 'WITH')):
                    # For SELECT queries, fetch all rows
                    result_rows = await asyncio.wait_for(conn.fetch(query), timeout=query_timeout)
                    
                    # Convert asyncpg.Record objects to dictionaries
                    rows = [dict(row) for row in result_rows]
                    serialized_rows = [serialize_row(row) for row in rows]
                    
                    # Get column names from the first row if available
                    columns = list(result_rows[0].keys()) if result_rows else []
                    
                    result = {
                        'columns': columns,
                        'rows': serialized_rows,
                        'rowCount': len(rows),
                        'time': time.time() - start_time
                    }
                else:
                    # For INSERT, UPDATE, DELETE, etc.
                    status = await asyncio.wait_for(conn.execute(query), timeout=query_timeout)
                    
                    # Extract row count from status string like "INSERT 0 5"
                    row_count = 0
                    if status:
                        parts = status.split()
                        if len(parts) >= 2 and parts[-1].isdigit():
                            row_count = int(parts[-1])
                    
                    result = {
                        'rowCount': row_count,
                        'time': time.time() - start_time
                    }
                
                return result
                
            except asyncio.TimeoutError:
                raise Exception(f"Query timeout after {query_timeout} seconds")
                
    except Exception as e:
        logger.error(f"PostgreSQL query execution error: {e}")
        raise Exception(f"PostgreSQL Error: {e}")

def execute_postgresql_query(connection_info, query, query_timeout=None):
    """Synchronous wrapper for async PostgreSQL query execution"""
    try:
        if query_timeout is None:
            query_timeout = get_db_config()['query_timeout']
        
        # Always use the synchronous fallback to avoid async loop issues
        # The async version has loop conflicts in Django request context
        return execute_postgresql_query_fallback(connection_info, query, query_timeout)
    except Exception as e:
        logger.error(f"PostgreSQL query execution failed: {e}")
        raise

def execute_postgresql_query_fallback(connection_info, query, query_timeout=None):
    """Fallback synchronous PostgreSQL query execution with timeout"""
    try:
        if query_timeout is None:
            query_timeout = get_db_config()['query_timeout']
        
        # Configure connection
        conn = psycopg2.connect(
            host=connection_info.get('host'),
            port=connection_info.get('port', 5432),
            database=connection_info.get('database'),
            user=connection_info.get('username'),
            password=connection_info.get('password'),
            connect_timeout=get_db_config()['connection_timeout']
        )
        
        conn.autocommit = True
        cursor = conn.cursor()
        start_time = time.time()
        
        # Set statement timeout for the query
        cursor.execute(f"SET statement_timeout = '{query_timeout * 1000}ms'")
        
        # Execute the main query
        cursor.execute(query)
        
        # Handle different query types
        if query.strip().upper().startswith(('SELECT', 'SHOW', 'DESCRIBE', 'EXPLAIN', 'WITH')):
            rows = cursor.fetchall()
            
            # Get column names
            columns = [desc[0] for desc in cursor.description] if cursor.description else []
            
            # Convert rows to list of dicts and serialize
            row_dicts = [dict(zip(columns, row)) for row in rows]
            serialized_rows = [serialize_row(row_dict) for row_dict in row_dicts]
            
            result = {
                'columns': columns,
                'rows': serialized_rows,
                'rowCount': len(rows),
                'time': time.time() - start_time
            }
        else:
            # For INSERT, UPDATE, DELETE, etc.
            result = {
                'rowCount': cursor.rowcount,
                'time': time.time() - start_time
            }
        
        cursor.close()
        conn.close()
        return result
        
    except psycopg2.Error as err:
        raise Exception(f"PostgreSQL Error: {err}")

async def get_postgresql_schema_info_async(connection_info):
    """Get schema, tables, and column information from PostgreSQL database using connection pool"""
    try:
        pool = await _postgresql_pool.get_pool(connection_info)
        
        async with pool.acquire() as conn:
            schemas_data = []
            
            # Get all schemas
            schema_query = """
                SELECT schema_name 
                FROM information_schema.schemata 
                WHERE schema_name NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
                ORDER BY schema_name
            """
            schema_rows = await conn.fetch(schema_query)
            
            for schema_row in schema_rows:
                schema_name = schema_row['schema_name']
                
                # Get tables in this schema
                table_query = """
                    SELECT 
                        schemaname as schema,
                        tablename as name,
                        'table' as type
                    FROM pg_tables 
                    WHERE schemaname = $1
                    UNION ALL
                    SELECT 
                        schemaname as schema,
                        viewname as name,
                        'view' as type
                    FROM pg_views 
                    WHERE schemaname = $1
                    ORDER BY name
                """
                table_rows = await conn.fetch(table_query, schema_name)
                
                tables_list = []
                for table_row in table_rows:
                    table_name = table_row['name']
                    table_type = table_row['type']
                    
                    # Get column information for each table
                    column_query = """
                        SELECT 
                            column_name as name,
                            data_type as type,
                            CASE 
                                WHEN column_name IN (
                                    SELECT column_name 
                                    FROM information_schema.table_constraints tc
                                    JOIN information_schema.key_column_usage kcu 
                                    ON tc.constraint_name = kcu.constraint_name
                                    WHERE tc.table_schema = $1 
                                    AND tc.table_name = $2 
                                    AND tc.constraint_type = 'PRIMARY KEY'
                                ) THEN 'PRI'
                                WHEN column_name IN (
                                    SELECT column_name 
                                    FROM information_schema.table_constraints tc
                                    JOIN information_schema.key_column_usage kcu 
                                    ON tc.constraint_name = kcu.constraint_name
                                    WHERE tc.table_schema = $1 
                                    AND tc.table_name = $2 
                                    AND tc.constraint_type = 'UNIQUE'
                                ) THEN 'UNI'
                                ELSE ''
                            END as key,
                            is_nullable as nullable
                        FROM information_schema.columns
                        WHERE table_schema = $1 AND table_name = $2
                        ORDER BY ordinal_position
                    """
                    column_rows = await conn.fetch(column_query, schema_name, table_name)
                    
                    columns_list = [dict(col) for col in column_rows]
                    
                    # Get row count for tables (not views)
                    row_count = 0
                    if table_type == 'table':
                        try:
                            count_query = f'SELECT COUNT(*) as count FROM "{schema_name}"."{table_name}"'
                            count_result = await conn.fetchrow(count_query)
                            row_count = count_result['count'] if count_result else 0
                        except:
                            row_count = 0  # If count fails, default to 0
                    
                    tables_list.append({
                        'name': table_name,
                        'type': table_type,
                        'rows': row_count,
                        'columns': columns_list
                    })
                
                if tables_list:  # Only include schemas that have tables
                    schemas_data.append({
                        'name': schema_name,
                        'tables': tables_list
                    })
            
            return schemas_data
                
    except Exception as e:
        logger.error(f"PostgreSQL schema info error: {e}")
        raise Exception(f"PostgreSQL Error: {e}")

def get_postgresql_schema_info(connection_info):
    """Synchronous wrapper for async PostgreSQL schema info retrieval"""
    try:
        # Always use the synchronous fallback to avoid async loop issues
        # The async version has loop conflicts in Django request context
        return get_postgresql_schema_info_fallback(connection_info)
    except Exception as e:
        logger.error(f"PostgreSQL schema retrieval failed: {e}")
        raise

def get_postgresql_schema_info_fallback(connection_info):
    """Fallback synchronous PostgreSQL schema info retrieval"""
    try:
        conn = psycopg2.connect(
            host=connection_info.get('host'),
            port=connection_info.get('port', 5432),
            database=connection_info.get('database'),
            user=connection_info.get('username'),
            password=connection_info.get('password'),
            connect_timeout=get_db_config()['connection_timeout']
        )
        
        cursor = conn.cursor()
        schemas_data = []
        
        # Get all schemas
        cursor.execute("""
            SELECT schema_name 
            FROM information_schema.schemata 
            WHERE schema_name NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
            ORDER BY schema_name
        """)
        schema_rows = cursor.fetchall()
        
        for schema_row in schema_rows:
            schema_name = schema_row[0]
            
            # Get tables in this schema
            cursor.execute("""
                SELECT 
                    schemaname as schema,
                    tablename as name,
                    'table' as type
                FROM pg_tables 
                WHERE schemaname = %s
                UNION ALL
                SELECT 
                    schemaname as schema,
                    viewname as name,
                    'view' as type
                FROM pg_views 
                WHERE schemaname = %s
                ORDER BY name
            """, (schema_name, schema_name))
            table_rows = cursor.fetchall()
            
            tables_list = []
            for table_row in table_rows:
                table_name = table_row[1]
                table_type = table_row[2]
                
                # Get column information for each table
                cursor.execute("""
                    SELECT 
                        column_name as name,
                        data_type as type,
                        CASE 
                            WHEN column_name IN (
                                SELECT column_name 
                                FROM information_schema.table_constraints tc
                                JOIN information_schema.key_column_usage kcu 
                                ON tc.constraint_name = kcu.constraint_name
                                WHERE tc.table_schema = %s 
                                AND tc.table_name = %s 
                                AND tc.constraint_type = 'PRIMARY KEY'
                            ) THEN 'PRI'
                            WHEN column_name IN (
                                SELECT column_name 
                                FROM information_schema.table_constraints tc
                                JOIN information_schema.key_column_usage kcu 
                                ON tc.constraint_name = kcu.constraint_name
                                WHERE tc.table_schema = %s 
                                AND tc.table_name = %s 
                                AND tc.constraint_type = 'UNIQUE'
                            ) THEN 'UNI'
                            ELSE ''
                        END as key,
                        is_nullable as nullable
                    FROM information_schema.columns
                    WHERE table_schema = %s AND table_name = %s
                    ORDER BY ordinal_position
                """, (schema_name, table_name, schema_name, table_name, schema_name, table_name))
                column_rows = cursor.fetchall()
                
                columns_list = []
                for col_row in column_rows:
                    columns_list.append({
                        'name': col_row[0],
                        'type': col_row[1], 
                        'key': col_row[2],
                        'nullable': col_row[3]
                    })
                
                # Get row count for tables (not views)
                row_count = 0
                if table_type == 'table':
                    try:
                        cursor.execute(f'SELECT COUNT(*) FROM "{schema_name}"."{table_name}"')
                        count_result = cursor.fetchone()
                        row_count = count_result[0] if count_result else 0
                    except:
                        row_count = 0  # If count fails, default to 0
                
                tables_list.append({
                    'name': table_name,
                    'type': table_type,
                    'rows': row_count,
                    'columns': columns_list
                })
            
            if tables_list:  # Only include schemas that have tables
                schemas_data.append({
                    'name': schema_name,
                    'tables': tables_list
                })
        
        cursor.close()
        conn.close()
        
        return schemas_data
        
    except psycopg2.Error as err:
        raise Exception(f"PostgreSQL Error: {err}")

def execute_query(connection_info, query, query_timeout=None):
    """
    Generic query execution function that routes to appropriate database handler
    Returns (success: bool, result: Any)
    """
    try:
        if query_timeout is None:
            query_timeout = get_db_config()['query_timeout']
        connection_type = connection_info.get('type', 'mysql').lower()
        
        if connection_type == 'mysql':
            result = execute_mysql_query(connection_info, query, query_timeout)
            return True, result
        elif connection_type == 'postgresql':
            result = execute_postgresql_query(connection_info, query, query_timeout)
            return True, result
        elif connection_type == 'redshift':
            return False, "Redshift connection not yet implemented"
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
        elif connection_type == 'postgresql':
            schemas = get_postgresql_schema_info(connection_config)
            formatted_schema = format_schema_for_llm(schemas)
            return formatted_schema
        elif connection_type == 'redshift':
            return "Schema retrieval for Redshift not yet implemented"
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
        schema_name = schema['name']
        formatted_schema += f"Schema: {schema_name}\n"
        formatted_schema += "=" * (len(schema_name) + 8) + "\n\n"
        
        if not schema['tables']:
            formatted_schema += "No tables found in this schema.\n\n"
            continue
            
        for table in schema['tables']:
            table_name = table['name']
            table_type = table['type']
            
            # For PostgreSQL, show full qualified name (schema.table)
            full_table_name = f"{schema_name}.{table_name}" if len(schemas) > 1 or schema_name != 'main' else table_name
            
            formatted_schema += f"Table: {full_table_name} ({table_type})\n"
            if table.get('rows', 0) > 0:
                formatted_schema += f"Estimated rows: ~{table['rows']}\n"
            formatted_schema += f"Columns:\n"
            
            if not table.get('columns'):
                formatted_schema += "  (No column information available)\n"
            else:
                for column in table['columns']:
                    # Enhanced column information
                    col_name = column['name']
                    col_type = column['type']
                    
                    # Key information
                    key_info = ""
                    if column.get('key') == 'PRI':
                        key_info = " [PRIMARY KEY]"
                    elif column.get('key') == 'UNI':
                        key_info = " [UNIQUE]"
                    elif column.get('key') == 'MUL':
                        key_info = " [INDEX]"
                    
                    # Nullable information
                    nullable_info = ""
                    if column.get('nullable') == 'NO':
                        nullable_info = " NOT NULL"
                    elif column.get('nullable') == 'YES':
                        nullable_info = " NULLABLE"
                    
                    formatted_schema += f"  - {col_name}: {col_type}{key_info}{nullable_info}\n"
            
            formatted_schema += "\n"
    
    # Add helpful notes for PostgreSQL (always add for PostgreSQL schemas)
    formatted_schema += "\nIMPORTANT POSTGRESQL SYNTAX NOTES:\n"
    formatted_schema += "- ALWAYS use double quotes around column names that contain spaces or special characters\n"
    formatted_schema += "- Column names like 'Order_id' should be referenced as \"Order_id\" in queries\n" 
    formatted_schema += "- Schema-qualified table names: schema.table_name (e.g., datasage.customer_info)\n"
    formatted_schema += "- Use LIMIT and OFFSET for pagination\n"
    formatted_schema += "- Boolean values: TRUE/FALSE\n"
    formatted_schema += "- Case sensitivity: PostgreSQL is case sensitive for quoted identifiers\n\n"
    
    return formatted_schema


def execute_redshift_query(connection_info, query):
    """Execute query in Redshift database (placeholder function)"""
    # This is a placeholder function until proper Redshift implementation is added
    raise Exception("Redshift connection not yet implemented. Please use MySQL connection instead.")

