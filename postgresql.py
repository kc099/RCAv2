import psycopg2
from psycopg2 import sql, Error
from psycopg2.extras import RealDictCursor
import os
from contextlib import contextmanager

# Database configuration
DB_CONFIG = {
    'host': '34.84.59.161',  # Replace with your actual host
    'port': '5432',                               # Default PostgreSQL port
    'database': 'ecomm',           # Replace with your default DB name
    'user': 'postgres',                      # Replace with your username
    'password': '12345'                   # Replace with your password
}

# Alternative: Use environment variables for security
# DB_CONFIG = {
#     'host': os.getenv('DB_HOST'),
#     'port': os.getenv('DB_PORT', '5432'),
#     'database': os.getenv('DB_NAME'),
#     'user': os.getenv('DB_USER'),
#     'password': os.getenv('DB_PASSWORD')
# }

class PostgreSQLConnection:
    """A class to handle PostgreSQL database connections and operations."""
    
    def __init__(self, config):
        self.config = config
        self.connection = None
        self.cursor = None
    
    def connect(self):
        """Establish connection to PostgreSQL database."""
        try:
            self.connection = psycopg2.connect(**self.config)
            self.cursor = self.connection.cursor(cursor_factory=RealDictCursor)
            print("Successfully connected to PostgreSQL database")
            return True
        except Error as e:
            print(f"Error connecting to PostgreSQL: {e}")
            return False
    
    def disconnect(self):
        """Close database connection."""
        if self.cursor:
            self.cursor.close()
        if self.connection:
            self.connection.close()
        print("PostgreSQL connection closed")
    
    def execute_query(self, query, params=None):
        """Execute a SELECT query and return results."""
        try:
            self.cursor.execute(query, params)
            results = self.cursor.fetchall()
            return results
        except Error as e:
            print(f"Error executing query: {e}")
            return None
    
    def execute_command(self, command, params=None):
        """Execute INSERT, UPDATE, DELETE commands."""
        try:
            self.cursor.execute(command, params)
            self.connection.commit()
            print(f"Command executed successfully. Rows affected: {self.cursor.rowcount}")
            return True
        except Error as e:
            print(f"Error executing command: {e}")
            self.connection.rollback()
            return False

# Context manager for automatic connection handling
@contextmanager
def get_db_connection(config):
    """Context manager for database connections."""
    conn = None
    try:
        conn = psycopg2.connect(**config)
        yield conn
    except Error as e:
        print(f"Database error: {e}")
        if conn:
            conn.rollback()
    finally:
        if conn:
            conn.close()

# Example usage functions
def example_basic_connection():
    """Basic connection example."""
    try:
        # Connect to database
        connection = psycopg2.connect(**DB_CONFIG)
        cursor = connection.cursor()
        
        # Test connection
        cursor.execute("SELECT version();")
        db_version = cursor.fetchone()
        print(f"PostgreSQL version: {db_version[0]}")
        
        # Close connection
        cursor.close()
        connection.close()
        
    except Error as e:
        print(f"Error: {e}")

def example_using_class():
    """Example using the PostgreSQLConnection class."""
    db = PostgreSQLConnection(DB_CONFIG)
    
    if db.connect():
        # Create a sample table
        create_table_query = """
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            email VARCHAR(100) UNIQUE NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        """
        db.execute_command(create_table_query)
        
        # Insert sample data
        insert_query = """
        INSERT INTO users (name, email) 
        VALUES (%s, %s)
        ON CONFLICT (email) DO NOTHING;
        """
        db.execute_command(insert_query, ("John Doe", "john@example.com"))
        db.execute_command(insert_query, ("Jane Smith", "jane@example.com"))
        
        # Query data
        select_query = "SELECT * FROM users ORDER BY created_at DESC;"
        results = db.execute_query(select_query)
        
        if results:
            print("\nUsers in database:")
            for row in results:
                print(f"ID: {row['id']}, Name: {row['name']}, Email: {row['email']}")
        
        # Update data
        update_query = "UPDATE users SET name = %s WHERE email = %s;"
        db.execute_command(update_query, ("John Updated", "john@example.com"))
        
        # Query specific user
        user_query = "SELECT * FROM users WHERE email = %s;"
        user = db.execute_query(user_query, ("john@example.com",))
        if user:
            print(f"\nUpdated user: {user[0]['name']}")
        
        db.disconnect()

def example_context_manager():
    """Example using context manager for automatic connection handling."""
    with get_db_connection(DB_CONFIG) as conn:
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Query all tables in current database
        cursor.execute("""
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public';
        """)
        
        tables = cursor.fetchall()
        print("Tables in database:")
        for table in tables:
            print(f"- {table['table_name']}")

def example_bulk_operations():
    """Example of bulk insert operations."""
    with get_db_connection(DB_CONFIG) as conn:
        cursor = conn.cursor()
        
        # Bulk insert data
        users_data = [
            ("Alice Johnson", "alice@example.com"),
            ("Bob Wilson", "bob@example.com"),
            ("Carol Brown", "carol@example.com")
        ]
        
        insert_query = """
        INSERT INTO users (name, email) 
        VALUES (%s, %s)
        ON CONFLICT (email) DO NOTHING;
        """
        
        try:
            cursor.executemany(insert_query, users_data)
            conn.commit()
            print(f"Bulk insert completed. {cursor.rowcount} rows affected.")
        except Error as e:
            print(f"Bulk insert failed: {e}")
            conn.rollback()

def example_transaction():
    """Example of transaction handling."""
    with get_db_connection(DB_CONFIG) as conn:
        cursor = conn.cursor()
        
        try:
            # Start transaction (automatically handled by psycopg2)
            cursor.execute("INSERT INTO users (name, email) VALUES (%s, %s);", 
                         ("Transaction User", "transaction@example.com"))
            
            # Simulate some business logic
            cursor.execute("UPDATE users SET name = %s WHERE email = %s;", 
                         ("Updated Transaction User", "transaction@example.com"))
            
            # Commit transaction
            conn.commit()
            print("Transaction completed successfully")
            
        except Error as e:
            # Rollback on error
            conn.rollback()
            print(f"Transaction failed, rolled back: {e}")

# Main execution
if __name__ == "__main__":
    print("PostgreSQL Connection Examples")
    print("=" * 40)
    
    # Test basic connection
    print("\n1. Basic Connection Test:")
    example_basic_connection()
    
    # Use class-based approach
    # print("\n2. Class-based Connection:")
    # example_using_class()
    
    # Use context manager
    print("\n3. Context Manager Approach:")
    example_context_manager()
    
    # # Bulk operations
    # print("\n4. Bulk Operations:")
    # example_bulk_operations()
    
    # # Transaction example
    # print("\n5. Transaction Handling:")
    # example_transaction()