/**
 * Schema Explorer - Functions to fetch and display database schema information
 */

// Global variable to store schema data
let databaseSchemas = [];

/**
 * Fetch database schema information from the server
 */
function fetchDatabaseSchema() {
    // Get the notebook ID from the page URL
    const notebookUUID = getNotebookUUID();
    let url = '/api/database-schema/';
    
    if (notebookUUID) {
        url = `/api/notebooks/${notebookUUID}/schema/`;
    }
    
    // Show loading indicator
    const dbSchemasSection = document.getElementById('database-schemas');
    if (dbSchemasSection) {
        dbSchemasSection.innerHTML = '<div class="loading-indicator">Loading schemas...</div>';
    }
    
    // Make API request
    fetch(url, {
        method: 'GET',
        headers: {
            'X-CSRFToken': getCsrfToken(),
        }
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        if (data.success) {
            databaseSchemas = data.schemas || [];
            renderDatabaseSchemas();
        } else {
            console.error('Error fetching database schema:', data.error);
            showSchemaError(data.error);
        }
    })
    .catch(error => {
        console.error('Error fetching database schema:', error);
        showSchemaError(error.message);
    });
}

/**
 * Render database schemas in the sidebar
 */
function renderDatabaseSchemas() {
    const dbSchemasSection = document.getElementById('database-schemas');
    if (!dbSchemasSection) return;
    
    // Clear existing content
    dbSchemasSection.innerHTML = '';
    
    if (databaseSchemas.length === 0) {
        dbSchemasSection.innerHTML = '<div class="no-schemas">No database schemas available</div>';
        return;
    }
    
    // Render each schema
    databaseSchemas.forEach(schema => {
        const schemaElement = document.createElement('div');
        schemaElement.className = 'schema expanded';
        
        // Create schema header
        const schemaHeader = document.createElement('div');
        schemaHeader.className = 'schema-header';
        schemaHeader.innerHTML = `
            <i class="fas fa-database"></i>
            <span>${schema.name}</span>
            <i class="fas fa-chevron-down"></i>
        `;
        
        // Create tables container
        const tablesContainer = document.createElement('div');
        tablesContainer.className = 'schema-tables visible';
        
        // Add tables to the container
        if (schema.tables && schema.tables.length > 0) {
            schema.tables.forEach(table => {
                const tableElement = document.createElement('div');
                tableElement.className = 'table-item';
                tableElement.dataset.tableName = table.name;
                
                // Set icon based on table type
                let icon = 'fa-table';
                if (table.type === 'view') {
                    icon = 'fa-eye';
                }
                
                tableElement.innerHTML = `
                    <i class="fas ${icon}"></i>
                    <span>${table.name}</span>
                    ${table.rows ? `<span class="row-count">(${table.rows} rows)</span>` : ''}
                `;
                
                // Add click handler to show table columns
                tableElement.addEventListener('click', () => {
                    showTableColumns(tableElement, table);
                });
                
                tablesContainer.appendChild(tableElement);
            });
        } else {
            tablesContainer.innerHTML = '<div class="no-tables">No tables available</div>';
        }
        
        // Add toggle functionality to schema header
        schemaHeader.addEventListener('click', () => {
            schemaElement.classList.toggle('expanded');
            tablesContainer.classList.toggle('visible');
            const chevron = schemaHeader.querySelector('.fa-chevron-down, .fa-chevron-right');
            if (chevron) {
                chevron.classList.toggle('fa-chevron-down');
                chevron.classList.toggle('fa-chevron-right');
            }
        });
        
        // Append all elements
        schemaElement.appendChild(schemaHeader);
        schemaElement.appendChild(tablesContainer);
        dbSchemasSection.appendChild(schemaElement);
    });
}

/**
 * Display table columns when a table is clicked
 */
function showTableColumns(tableElement, tableData) {
    // Check if columns are already displayed
    const existingColumnsElement = tableElement.nextElementSibling;
    if (existingColumnsElement && existingColumnsElement.classList.contains('table-columns')) {
        existingColumnsElement.remove();
        return;
    }
    
    // Create columns container
    const columnsElement = document.createElement('div');
    columnsElement.className = 'table-columns';
    
    // Add columns to the container
    if (tableData.columns && tableData.columns.length > 0) {
        tableData.columns.forEach(column => {
            const columnElement = document.createElement('div');
            columnElement.className = 'column-item';
            
            // Set icon based on column type
            let keyIcon = '';
            if (column.key === 'PRI') {
                keyIcon = '<i class="fas fa-key primary-key"></i>';
            } else if (column.key === 'UNI') {
                keyIcon = '<i class="fas fa-key unique-key"></i>';
            } else if (column.key === 'MUL') {
                keyIcon = '<i class="fas fa-link foreign-key"></i>';
            }
            
            columnElement.innerHTML = `
                ${keyIcon}
                <span class="column-name">${column.name}</span>
                <span class="column-type">${column.type}</span>
            `;
            
            columnsElement.appendChild(columnElement);
        });
    } else {
        columnsElement.innerHTML = '<div class="no-columns">No column information available</div>';
    }
    
    // Insert after the table element
    tableElement.parentNode.insertBefore(columnsElement, tableElement.nextSibling);
}

/**
 * Display temporary tables in the sidebar
 */
function renderTemporaryTables(tempTables) {
    const tempTablesSection = document.getElementById('temporary-tables');
    if (!tempTablesSection) return;
    
    // Clear existing content
    tempTablesSection.innerHTML = '';
    
    if (!tempTables || tempTables.length === 0) {
        tempTablesSection.innerHTML = '<div class="no-temp-tables">No temporary tables available</div>';
        return;
    }
    
    // Render each temporary table
    tempTables.forEach(table => {
        const tableElement = document.createElement('div');
        tableElement.className = 'table-item temp-table';
        
        tableElement.innerHTML = `
            <i class="fas fa-clock"></i>
            <span>${table.name}</span>
            ${table.rows ? `<span class="row-count">(${table.rows} rows)</span>` : ''}
        `;
        
        tempTablesSection.appendChild(tableElement);
    });
}

/**
 * Show an error message in the schema section
 */
function showSchemaError(errorMessage) {
    const dbSchemasSection = document.getElementById('database-schemas');
    if (dbSchemasSection) {
        dbSchemasSection.innerHTML = `
            <div class="schema-error">
                <i class="fas fa-exclamation-triangle"></i>
                <span>Error loading schema: ${errorMessage}</span>
            </div>
        `;
    }
}

/**
 * Get notebook UUID from the URL or DOM
 */
function getNotebookUUID() {
    // First try to get from the notebook container's data attribute (for workbench notebooks)
    const notebookContainer = document.getElementById('notebook-container');
    if (notebookContainer && notebookContainer.dataset.notebookId) {
        console.log('Schema explorer: Found notebook UUID from container data attribute:', notebookContainer.dataset.notebookId);
        return notebookContainer.dataset.notebookId;
    }

    // Try to get from global notebookId variable
    if (typeof notebookId !== 'undefined' && notebookId) {
        console.log('Schema explorer: Found notebook UUID from global variable:', notebookId);
        return notebookId;
    }

    // Try to extract from URL (for notebooks opened via /notebooks/<uuid>/)
    const path = window.location.pathname;
    const matches = path.match(/\/notebooks\/([a-f0-9-]+)\//);
    if (matches && matches[1]) {
        console.log('Schema explorer: Found notebook UUID from URL:', matches[1]);
        return matches[1];
    }

    // Fallback: try to extract from workbench URL if it has UUID after workbench/
    const urlParts = window.location.pathname.split('/');
    const workbenchIndex = urlParts.indexOf('workbench');
    if (workbenchIndex !== -1 && urlParts[workbenchIndex + 1]) {
        console.log('Schema explorer: Found notebook UUID from workbench URL:', urlParts[workbenchIndex + 1]);
        return urlParts[workbenchIndex + 1];
    }

    console.warn('Schema explorer: Could not determine notebook UUID from any source');
    return null;
}

/**
 * Initialize schema explorer when page loads
 */
document.addEventListener('DOMContentLoaded', function() {
    // Set up section toggle handlers
    const sectionHeaders = document.querySelectorAll('.section-header');
    sectionHeaders.forEach(header => {
        header.addEventListener('click', function() {
            const sectionName = this.dataset.section;
            const contentElement = document.getElementById(sectionName);
            
            // Toggle icon
            const icon = this.querySelector('i');
            icon.classList.toggle('fa-chevron-right');
            icon.classList.toggle('fa-chevron-down');
            
            // Toggle expanded state
            this.classList.toggle('expanded');
            
            // Toggle content visibility
            if (contentElement) {
                contentElement.classList.toggle('visible');
            }
        });
    });
    
    // Fetch database schema on page load
    fetchDatabaseSchema();
});
