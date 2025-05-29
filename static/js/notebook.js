// static/js/notebook.js
// Notebook functionality for SQL workbench

document.addEventListener('DOMContentLoaded', function() {
    initNotebook();
});

// Global variables for tracking cells and editors
let cells = [];
let editors = {};
let cellResults = {}; // Store cell execution results
let pendingImport = null; // Track pending imports
let autoSaveInterval = null; // Track auto-save interval
let notebookId = null; // Current notebook ID

/**
 * Initialize the SQL notebook
 */
function initNotebook() {
    // Get notebook ID from the page
    const container = document.getElementById('notebook-container');
    if (!container) {
        console.error('Notebook container not found');
        return;
    }
    
    notebookId = container.dataset.notebookId;
    
    if (!notebookId) {
        console.error('No notebook ID found');
        return;
    }
    
    console.log('Initializing notebook with UUID:', notebookId);
    
    // Set up event listeners
    const addCellBtn = document.getElementById('add-cell-btn');
    if (addCellBtn) {
        addCellBtn.addEventListener('click', addNewCell);
    }
    
    const saveNotebookBtn = document.getElementById('save-notebook-btn');
    if (saveNotebookBtn) {
        saveNotebookBtn.addEventListener('click', saveNotebook);
    }
    
    // Set up notebook title editing
    initTitleEditing();
    
    // Initialize existing cells if any
    if (window.cellsData && window.cellsData.length) {
        console.log('Loading cells:', window.cellsData);
        for (const cellData of window.cellsData) {
            renderCell(cellData);
        }
    }
    
    // Add auto-save functionality if not already set
    if (!autoSaveInterval) {
        autoSaveInterval = setInterval(autoSaveNotebook, 300000); // Save every 5 minutes
    }
    
    // Mark notebook as initialized
    window.notebookInitialized = true;
    
    // Expose key functions globally for agent integration
    window.addNewCell = addNewCell;
    window.renderCell = renderCell;
    window.updateCellContent = updateCellContent;
    window.executeCell = executeCell;
    window.getCsrfToken = getCsrfToken;
    window.cells = cells;
    window.editors = editors;
    
    console.log('Notebook functions exposed globally:', {
        addNewCell: typeof window.addNewCell,
        renderCell: typeof window.renderCell,
        updateCellContent: typeof window.updateCellContent,
        executeCell: typeof window.executeCell
    });
}

/**
 * Initialize cell name editing functionality
 */
function initCellNameEditing(nameElement) {
    if (!nameElement) return;
    
    const cellId = nameElement.dataset.cellId;
    
    // Double click to edit
    nameElement.addEventListener('dblclick', () => {
        // Create an input element
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'cell-name editing';
        input.value = nameElement.textContent;
        input.style.width = '300px';
        
        // Replace the name display with the input
        nameElement.parentNode.replaceChild(input, nameElement);
        input.focus();
        input.select();
        
        // Save on blur
        input.addEventListener('blur', () => {
            saveCellName(cellId, input.value, input, nameElement);
        });
        
        // Save on Enter key
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                saveCellName(cellId, input.value, input, nameElement);
            } else if (e.key === 'Escape') {
                // Cancel editing on Escape
                input.parentNode.replaceChild(nameElement, input);
            }
        });
    });
}

/**
 * Save a cell's name to the server
 */
function saveCellName(cellId, name, inputElement, nameElement) {
    // Update the name in the UI first
    const displayName = name.trim() || 'Untitled Cell';
    nameElement.textContent = displayName;
    
    // Replace the input with the name element
    if (inputElement && inputElement.parentNode) {
        inputElement.parentNode.replaceChild(nameElement, inputElement);
    }
    
    // Update in memory
    const cellIndex = cells.findIndex(c => c.id === cellId);
    if (cellIndex !== -1) {
        cells[cellIndex].name = displayName;
    }
    
    // Dispatch event for cell reference manager
    document.dispatchEvent(new CustomEvent('cellUpdated', { 
        detail: { cellId: cellId, newName: displayName } 
    }));
    
    // Send to server
    fetch(`/api/cells/${cellId}/update-name/`, {
        method: 'POST',
        headers: {
            'X-CSRFToken': getCsrfToken(),
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `name=${encodeURIComponent(displayName)}`
    })
    .catch(error => {
        console.error('Error saving cell name:', error);
    });
}

/**
 * Initialize editable notebook title
 */
function initTitleEditing() {
    // Replace the static title with an editable input
    const titleElement = document.querySelector('.notebook-header h3');
    if (titleElement) {
        const currentTitle = titleElement.textContent;
        const titleInput = document.createElement('input');
        titleInput.type = 'text';
        titleInput.className = 'notebook-title-input';
        titleInput.value = currentTitle;
        titleInput.placeholder = 'Untitled Notebook';
        
        // Replace the h3 with the input
        titleElement.parentNode.replaceChild(titleInput, titleElement);
        
        // Add event listener to save title when changed
        titleInput.addEventListener('blur', () => {
            updateNotebookTitle(titleInput.value);
        });
        
        titleInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                titleInput.blur();
            }
        });
    }
}

/**
 * Get CSRF token for AJAX requests
 */
function getCsrfToken() {
    // Get CSRF token from cookies
    const name = 'csrftoken';
    let cookieValue = null;
    if (document.cookie && document.cookie !== '') {
        const cookies = document.cookie.split(';');
        for (let i = 0; i < cookies.length; i++) {
            const cookie = cookies[i].trim();
            if (cookie.substring(0, name.length + 1) === (name + '=')) {
                cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                break;
            }
        }
    }
    return cookieValue;
}

/**
 * Update notebook title
 */
function updateNotebookTitle(title) {
    if (!title.trim()) {
        title = 'Untitled Notebook';
    }
    
    // Update title in UI
    const titleInput = document.querySelector('.notebook-title-input');
    if (titleInput) {
        titleInput.value = title;
    }
    
    // Send update to server using the UUID format
    fetch(`/api/notebooks/${notebookId}/update-title/`, {
        method: 'POST',
        headers: {
            'X-CSRFToken': getCsrfToken(),
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `title=${encodeURIComponent(title)}`
    })
    .then(response => response.json())
    .then(data => {
        if (!data.success) {
            console.error('Error updating notebook title:', data.error);
        }
    })
    .catch(error => {
        console.error('Error updating notebook title:', error);
    });
}

/**
 * Add a new cell to the notebook
 */
function addNewCell() {
    // Call API to add a cell to the database using the UUID format
    fetch(`/api/notebooks/${notebookId}/add-cell/`, {
        method: 'POST',
        headers: {
            'X-CSRFToken': getCsrfToken(),
            'Content-Type': 'application/x-www-form-urlencoded',
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
            // Remove any placeholder empty state
            const emptyNotebook = document.querySelector('.empty-notebook');
            if (emptyNotebook) {
                emptyNotebook.remove();
            }
            
            renderCell({
                id: data.cell_id,
                order: data.order,
                name: data.name || 'Untitled Cell',  // Include the name from the API response
                query: "-- Write your SQL here",
                result: null,
                is_executed: false
            });
        } else {
            console.error('Error adding cell:', data.error);
            alert('Failed to add cell: ' + data.error);
        }
    })
    .catch(error => {
        console.error('Error adding cell:', error);
        alert('Failed to add cell: ' + error.message);
    });
}

/**
 * Render a cell in the notebook
 */
function renderCell(cellData) {
    const cellElement = document.createElement('div');
    cellElement.className = 'sql-cell';
    cellElement.dataset.cellId = cellData.id;
    cellElement.dataset.order = cellData.order;
    
    const cellHtml = `
        <div class="cell-toolbar">
            <div class="cell-order">[${cellData.order}]</div>
            <div class="cell-name" data-cell-id="${cellData.id}" title="Double-click to edit">${cellData.name || 'Untitled Cell'}</div>
            <div class="cell-buttons">
                <button class="run-cell-btn" title="Run Cell"><i class="fas fa-play"></i></button>
                <button class="move-up-btn" title="Move Up"><i class="fas fa-arrow-up"></i></button>
                <button class="move-down-btn" title="Move Down"><i class="fas fa-arrow-down"></i></button>
                <button class="import-cell-btn" title="Import to Examples"><i class="fas fa-file-import"></i></button>
                <button class="delete-cell-btn" title="Delete Cell"><i class="fas fa-trash"></i></button>
            </div>
        </div>
        <textarea class="cell-editor-textarea" id="editor-${cellData.id}">${cellData.query || '-- Write your SQL here'}</textarea>
        <div class="cell-result hidden">
            <div class="result-header">
                <span>Result</span>
                ${cellData.execution_time ? `<span class="exec-time">(${cellData.execution_time.toFixed(2)}s)</span>` : ''}
            </div>
            <div class="result-content" id="result-${cellData.id}">
                <div class="empty-result">Execute the query to see results</div>
            </div>
        </div>
    `;
    
    cellElement.innerHTML = cellHtml;
    
    // Insert before the "Add Cell" button
    const addCellDiv = document.querySelector('.add-cell');
    if (addCellDiv) {
        addCellDiv.parentNode.insertBefore(cellElement, addCellDiv);
    } else {
        const container = document.getElementById('notebook-container');
        if (container) {
            container.appendChild(cellElement);
        }
    }
    
    // Initialize the editor with CodeMirror
    initCodeEditor(cellData.id, cellData.query || '-- Write your SQL here');
    
    // Add event listeners
    addCellEventListeners(cellElement, cellData.id);
    
    // Set up cell name editing
    initCellNameEditing(cellElement.querySelector('.cell-name'));
    
    // Store cell in memory
    cells.push({
        id: cellData.id,
        order: cellData.order,
        element: cellElement,
        name: cellData.name || 'Untitled Cell'
    });
    
    // Dispatch event for cell reference manager
    document.dispatchEvent(new CustomEvent('cellAdded', { 
        detail: { cellId: cellData.id, cellData: cellData } 
    }));
}

/**
 * Initialize CodeMirror editor for a cell
 */
function initCodeEditor(cellId, initialValue) {
    try {
        // Select the textarea element
        const textareaElement = document.getElementById(`editor-${cellId}`);
        if (!textareaElement) {
            console.error(`Textarea with id editor-${cellId} not found`);
            return;
        }
        
        // Initialize CodeMirror editor
        const editor = CodeMirror.fromTextArea(textareaElement, {
            mode: 'text/x-sql',
            theme: 'default',
            lineNumbers: true,
            indentWithTabs: false,
            indentUnit: 4,
            smartIndent: true,
            electricChars: true,
            lineWrapping: true,
            autoRefresh: true
        });
        
        // Set the initial value
        editor.setValue(initialValue || '');
        
        // Set editor height
        editor.setSize('100%', 'auto');
        
        // Store the editor instance for later use
        editors[cellId] = editor;
        const cell = cells.find(cell => cell.id === cellId);
        if (cell) {
            cell.editor = editor;
            
            // Auto-save changes
            editor.on('blur', () => {
                updateCellContent(cellId, editor.getValue());
            });
        }
    } catch (error) {
        console.error('Error initializing CodeMirror:', error);
    }
}

/**
 * Update cell content on the server
 */
function updateCellContent(cellId, content) {
    // Call API to update the cell content
    fetch(`/api/cells/${cellId}/update/`, {
        method: 'POST',
        headers: {
            'X-CSRFToken': getCsrfToken(),
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `query=${encodeURIComponent(content)}`
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        if (!data.success) {
            console.error('Error updating cell:', data.error);
        }
    })
    .catch(error => {
        console.error('Error updating cell:', error);
    });
}

/**
 * Process result data for export to Query Examples
 */
function processResultForExport(result) {
    // Check if we have a valid result object
    if (!result) {
        console.error('Result is null or undefined');
        return [];
    }
    
    // Debug log to see the structure
    // console.log('Result structure:', JSON.stringify(result, null, 2));
    
    // Handle different result structures
    if (result.rows && Array.isArray(result.rows)) {
        // The result already has a rows array of objects
        // This is the format we need for the examples tab
        return result.rows;
    } else if (result.data && Array.isArray(result.data)) {
        // Handle column-based format if present
        if (!result.columns || !Array.isArray(result.columns)) {
            console.error('Result has data but no columns');
            return [];
        }
        
        // Convert from column-based to row-based format
        const data = [];
        const rowCount = result.data[0]?.length || 0;
        
        for (let i = 0; i < rowCount; i++) {
            const rowData = {};
            
            for (let j = 0; j < result.columns.length; j++) {
                if (result.data[j] && i < result.data[j].length) {
                    const columnName = result.columns[j];
                    rowData[columnName] = result.data[j][i];
                }
            }
            
            data.push(rowData);
        }
        
        return data;
    }
    
    console.error('Unrecognized result format');
    return [];
}

/**
 * Format results for display in the cell
 */
function formatResult(result) {
    if (!result) return '<div class="empty-result">No results to display</div>';
    
    try {
        // Format SQL results as a table
        let html = '<div class="result-table-wrapper"><table class="result-table"><thead><tr>';
        
        // Headers
        const headers = result.columns || [];
        if (!headers.length && result.rows && result.rows.length) {
            // If no columns defined but rows exist, use the first row's keys
            headers.push(...Object.keys(result.rows[0]));
        }
        
        headers.forEach(header => {
            html += `<th>${header}</th>`;
        });
        html += '</tr></thead><tbody>';
        
        // Rows
        if (result.rows && result.rows.length) {
            result.rows.forEach(row => {
                html += '<tr>';
                headers.forEach(header => {
                    const value = row[header];
                    // Safely format cell value, handling null, undefined, and long text
                    let displayValue = 'NULL';
                    
                    if (value !== null && value !== undefined) {
                        // Convert to string and handle long text values
                        displayValue = String(value);
                        
                        // Escape HTML to prevent XSS
                        displayValue = displayValue
                            .replace(/&/g, '&amp;')
                            .replace(/</g, '&lt;')
                            .replace(/>/g, '&gt;')
                            .replace(/"/g, '&quot;')
                            .replace(/'/g, '&#039;');
                    }
                    
                    html += `<td>${displayValue}</td>`;
                });
                html += '</tr>';
            });
            
            // Add result count
            html += `</tbody></table>`;
            html += `<div class="result-count">${result.rows.length} rows returned</div>`;
        } else {
            html += `<tr><td colspan="${headers.length || 1}" class="no-data">No data returned</td></tr></tbody></table>`;
        }
        
        html += '</div>';
        return html;
    } catch (error) {
        console.error('Error formatting result:', error);
        return `<div class="error-result">Error formatting results: ${error.message}</div>`;
    }
}

/**
 * Add event listeners to cell buttons
 */
function addCellEventListeners(cellElement, cellId) {
    // Run button
    const runBtn = cellElement.querySelector('.run-cell-btn');
    if (runBtn) {
        runBtn.addEventListener('click', () => {
            executeCell(cellId);
        });
    }
    
    // Move up button
    const moveUpBtn = cellElement.querySelector('.move-up-btn');
    if (moveUpBtn) {
        moveUpBtn.addEventListener('click', () => {
            moveCell(cellId, 'up');
        });
    }
    
    // Move down button
    const moveDownBtn = cellElement.querySelector('.move-down-btn');
    if (moveDownBtn) {
        moveDownBtn.addEventListener('click', () => {
            moveCell(cellId, 'down');
        });
    }
    
    // Import button
    const importBtn = cellElement.querySelector('.import-cell-btn');
    if (importBtn) {
        importBtn.addEventListener('click', () => {
            importCellToExamples(cellId);
        });
    }
    
    // Delete button
    const deleteBtn = cellElement.querySelector('.delete-cell-btn');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', () => {
            deleteCell(cellId);
        });
    }
}

/**
 * Helper function to toggle between compact and expanded result views
 */
function toggleResultView(resultElement, toggleBtn) {
    if (resultElement.classList.contains('compact')) {
        // Expand the results
        resultElement.classList.remove('compact');
        resultElement.classList.add('expanded');
        toggleBtn.textContent = 'Compact view';
    } else {
        // Collapse the results
        resultElement.classList.remove('expanded');
        resultElement.classList.add('compact');
        toggleBtn.textContent = 'Show all';
    }
}

/**
 * Helper function to adjust spacing between cells when results are shown/hidden
 */
function adjustCellSpacing(currentCell) {
    // Find all cells in the notebook
    const allCells = document.querySelectorAll('.sql-cell');
    // Extra space for cells with visible results
    allCells.forEach(cell => {
        const resultElement = cell.querySelector('.cell-result');
        if (resultElement && !resultElement.classList.contains('hidden')) {
            cell.style.marginBottom = '2rem';
        } else {
            cell.style.marginBottom = '1.5rem';
        }
    });
}

/**
 * Export cell data to dashboard for visualization
 */
function importCellToExamples(cellId) {
    console.log(`Exporting cell ${cellId} to dashboard`);
    
    // Get cell data
    const cell = cells.find(cell => cell.id === cellId);
    if (!cell) {
        console.error(`Cell ${cellId} not found`);
        alert('Error: Cell not found');
        return false;
    }
    
    // Get query text
    const query = getQueryText(cellId);
    if (!query) {
        console.error(`No query found for cell ${cellId}`);
        alert('Error: No SQL query found for this cell');
        return false;
    }
    
    // Get result data
    const resultData = getResultData(cellId);
    if (!resultData || !Array.isArray(resultData) || resultData.length === 0) {
        console.error(`No result data found for cell ${cellId}`);
        alert('No result data available. Please execute the query first.');
        return false;
    }
    
    // Export to dashboard
    exportToDashboard(cellId, query, resultData);
    return true;
}

/**
 * Export data to the dashboard for visualization
 */
function exportToDashboard(cellId, query, data) {
    try {
        console.log(`Exporting ${data.length} rows to dashboard from cell ${cellId}`);
        
        // Get cell name to use as source
        const cell = cells.find(cell => cell.id === cellId);
        const cellName = cell ? cell.name : `Cell ${cellId}`;
        
        // Prepare dashboard data
        const dashboardData = {
            source: `${cellName} (#${cellId})`,
            query: query,
            rows: data,
            columns: Object.keys(data[0] || {}),
            timestamp: new Date().toISOString()
        };
        
        // Send to server
        fetch('/api/dashboard/save/', {
            method: 'POST',
            headers: {
                'X-CSRFToken': getCsrfToken(),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(dashboardData)
        })
        .then(response => response.json())
        .then(result => {
            if (result.success) {
                console.log('Data exported to dashboard successfully');
                
                // Activate dashboard tab and load data
                console.log('Activating dashboard tab...');
                
                // Direct approach: click the dashboard tab to activate it through existing event handlers
                const dashboardTab = document.querySelector('.tab[data-tab="dashboard"]');
                if (dashboardTab) {
                    console.log('Dashboard tab found, clicking it');
                    dashboardTab.click(); // This will trigger the tab's click event handler
                    
                    // Load the data using the dashboard.js function
                    if (typeof window.loadDashboardData === 'function' && result.data) {
                        console.log('Loading dashboard data...');
                        window.loadDashboardData(result.data);
                    } else {
                        console.error('loadDashboardData function not available');
                    }
                } else {
                    console.error('Dashboard tab not found');
                }
                
                showNotification('Data exported to dashboard successfully');
            } else {
                console.error('Error exporting data to dashboard:', result.error);
                alert('Error exporting data: ' + result.error);
            }
        })
        .catch(error => {
            console.error('Error during dashboard export:', error);
            alert(`Error exporting data: ${error.message}`);
        });
        
        return true;
    } catch (error) {
        console.error('Error preparing dashboard data:', error);
        alert(`Error exporting data: ${error.message}`);
        return false;
    }
}

/**
 * Show a notification message
 * @param {string} message - Message to display
 * @param {string} type - Type of notification (success, error, info, etc.)
 */
function showNotification(message, type = 'success') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.textContent = message;
    
    if (type === 'error') {
        notification.style.backgroundColor = '#dc3545';
    } else if (type === 'info') {
        notification.style.backgroundColor = '#17a2b8';
    }
    
    // Add to body
    document.body.appendChild(notification);
    
    // Trigger animation
    setTimeout(() => {
        notification.style.opacity = '1';
        
        // Remove after 3 seconds
        setTimeout(() => {
            notification.style.opacity = '0';
            setTimeout(() => {
                notification.remove();
            }, 300);
        }, 3000);
    }, 10);
}

/**
 * Get SQL query text from a cell
 */
function getQueryText(cellId) {
    try {
        // Try to get from CodeMirror editor first
        const editorId = `editor-${cellId}`;
        if (editors[editorId]) {
            return editors[editorId].getValue();
        }
        
        // Fallback to getting query from textarea in DOM
        const cellElement = document.querySelector(`.sql-cell[data-cell-id="${cellId}"]`);
        if (cellElement) {
            const textarea = cellElement.querySelector('.cell-editor-textarea');
            if (textarea) {
                return textarea.value;
            }
        }
        
        // Last resort - check if we have cell results with query
        if (cellResults[cellId] && cellResults[cellId].query) {
            return cellResults[cellId].query;
        }
        
        console.warn(`Could not find query text for cell ${cellId}`);
        return '';
    } catch (error) {
        console.error(`Error getting query text for cell ${cellId}:`, error);
        return '';
    }
}

/**
 * Get result data from cell
 */
function getResultData(cellId) {
    try {
        // Check if we have result data in memory
        if (cellResults[cellId] && cellResults[cellId].data) {
            console.log(`Using cached result data for cell ${cellId}`);
            return cellResults[cellId].data;
        }
        
        // If not in memory, try to parse from DOM
        const resultTable = document.querySelector(`#result-${cellId} table.result-table`);
        if (resultTable) {
            console.log(`Parsing table data from DOM for cell ${cellId}`);
            return parseTableData(resultTable);
        }
        
        console.warn(`No result data found for cell ${cellId}`);
        return [];
    } catch (error) {
        console.error(`Error getting result data for cell ${cellId}:`, error);
        return [];
    }
}

/**
 * Parse HTML table data into JSON
 */
function parseTableData(table) {
    const data = [];
    const headers = [];
    
    // Get headers
    const headerCells = table.querySelectorAll('thead th');
    headerCells.forEach(cell => {
        headers.push(cell.textContent.trim());
    });
    
    // Get rows
    const rows = table.querySelectorAll('tbody tr');
    rows.forEach(row => {
        const rowData = {};
        const cells = row.querySelectorAll('td');
        
        cells.forEach((cell, index) => {
            if (index < headers.length) {
                // Try to parse numeric values
                const value = cell.textContent.trim();
                if (value === 'NULL') {
                    rowData[headers[index]] = null;
                } else if (!isNaN(value) && value !== '') {
                    rowData[headers[index]] = Number(value);
                } else {
                    rowData[headers[index]] = value;
                }
            }
        });
        
        data.push(rowData);
    });
    
    return data;
}

/**
 * Execute SQL in a cell
 */
function executeCell(cellId) {
    console.log(`Executing cell ${cellId}`);
    const cell = cells.find(cell => cell.id === cellId);
    if (!cell) {
        console.error(`Cell ${cellId} not found`);
        return;
    }
    
    const editor = editors[cellId];
    if (!editor) {
        console.error(`Editor for cell ${cellId} not initialized`);
        return;
    }
    
    const query = editor.getValue();
    if (!query.trim()) {
        alert('Please enter a SQL query to execute');
        return;
    }
    
    // Show loading indicator
    const resultElement = cell.element.querySelector('.cell-result');
    resultElement.classList.remove('hidden');
    resultElement.classList.add('compact'); // Start with compact view by default
    resultElement.querySelector('.result-content').innerHTML = '<div class="loading">Executing query...</div>';
    
    // Remove any existing toggle buttons
    const existingToggleBtn = resultElement.querySelector('.toggle-result-size');
    if (existingToggleBtn) {
        existingToggleBtn.remove();
    }
    
    // Make sure all cells below have proper spacing
    adjustCellSpacing(cell.element);
    
    // Call API to execute the cell
    fetch(`/api/cells/${cellId}/execute/`, {
        method: 'POST',
        headers: {
            'X-CSRFToken': getCsrfToken(),
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `query=${encodeURIComponent(query)}`
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        if (data.success) {
            // Update the result
            const execTimeSpan = resultElement.querySelector('.exec-time');
            if (execTimeSpan) {
                execTimeSpan.textContent = `(${data.execution_time.toFixed(2)}s)`;
            } else {
                const resultHeader = resultElement.querySelector('.result-header');
                const timeSpan = document.createElement('span');
                timeSpan.className = 'exec-time';
                timeSpan.textContent = `(${data.execution_time.toFixed(2)}s)`;
                resultHeader.appendChild(timeSpan);
            }
            
            // Format and display the results
            const resultContentEl = resultElement.querySelector('.result-content');
            resultContentEl.innerHTML = formatResult(data.result);
            
            // Process and store the cell result for potential import
            try {
                const processedData = processResultForExport(data.result);
                cellResults[cellId] = {
                    data: processedData,
                    executionTime: data.execution_time
                };
                console.log(`Processed data for cell ${cellId}:`, processedData.length, 'rows');
            } catch (error) {
                console.error('Error processing result data:', error);
                cellResults[cellId] = {
                    data: [],
                    executionTime: data.execution_time,
                    error: error.message
                };
            }
            
            // Add a toggle button for large result sets, if there are a significant number of results
            if (data.result && data.result.rows && data.result.rows.length > 10) {
                const toggleBtn = document.createElement('button');
                toggleBtn.className = 'toggle-result-size';
                toggleBtn.textContent = 'Show all';
                toggleBtn.addEventListener('click', function() {
                    toggleResultView(resultElement, toggleBtn);
                });
                resultElement.appendChild(toggleBtn);
            }
            
            // Update spacing for all cells to account for the new content
            adjustCellSpacing(cell.element);
            
            // If this isn't the last cell, scroll it into view to ensure user can see results
            const cellIndex = Array.from(document.querySelectorAll('.sql-cell')).indexOf(cell.element);
            const totalCells = document.querySelectorAll('.sql-cell').length;
            if (cellIndex < totalCells - 1) {
                setTimeout(() => {
                    cell.element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }, 100);
            }
            
            // Check if there's a pending import for this cell
            if (pendingImport === cellId) {
                pendingImport = null;
                // Give a slight delay to ensure UI is updated
                setTimeout(() => {
                    try {
                        // Get the query and processed result data
                        const query = editor.getValue();
                        const resultData = cellResults[cellId].data;
                        
                        // Make sure we have valid data
                        if (resultData && Array.isArray(resultData) && resultData.length > 0) {
                            // Import the data to examples tab
                            importData(cellId, query, resultData);
                        } else {
                            console.error('No valid data to import after execution');
                            alert('The query execution didn\'t produce importable results.');
                        }
                    } catch (error) {
                        console.error('Error handling pending import:', error);
                    }
                }, 100);
            }
        } else {
            resultElement.querySelector('.result-content').innerHTML = 
                `<div class="error-result">Error: ${data.error || 'Unknown error occurred'}</div>`;
            
            // Even for errors, update the cell spacing
            adjustCellSpacing(cell.element);
        }
    })
    .catch(error => {
        console.error('Error executing cell:', error);
        resultElement.querySelector('.result-content').innerHTML = 
            `<div class="error-result">Error: ${error.message}</div>`;
    });
}

/**
 * Move a cell up or down
 */
function moveCell(cellId, direction) {
    console.log(`Moving cell ${cellId} ${direction}`);
    
    // Find the current cell in our in-memory array
    const cellIndex = cells.findIndex(c => c.id === cellId);
    if (cellIndex === -1) {
        console.error('Cell not found in memory');
        showNotification('Error: Cell not found', 'error');
        return;
    }
    
    // Calculate new position
    let newIndex;
    if (direction === 'up') {
        if (cellIndex === 0) {
            showNotification('Cell is already at the top', 'info');
            return;
        }
        newIndex = cellIndex - 1;
    } else {
        if (cellIndex === cells.length - 1) {
            showNotification('Cell is already at the bottom', 'info');
            return;
        }
        newIndex = cellIndex + 1;
    }
    
    // Get DOM elements
    const allCellElements = document.querySelectorAll('.sql-cell');
    const currentCellElement = allCellElements[cellIndex];
    const targetCellElement = allCellElements[newIndex];
    
    if (!currentCellElement || !targetCellElement) {
        console.error('Cell elements not found in DOM');
        showNotification('Error: Cell elements not found', 'error');
        return;
    }
    
    // Update DOM immediately for responsive UI
    if (direction === 'up') {
        // Insert current cell before target cell
        targetCellElement.parentNode.insertBefore(currentCellElement, targetCellElement);
    } else {
        // Insert current cell after target cell
        if (targetCellElement.nextSibling) {
            targetCellElement.parentNode.insertBefore(currentCellElement, targetCellElement.nextSibling);
        } else {
            targetCellElement.parentNode.appendChild(currentCellElement);
        }
    }
    
    // Update in-memory cell order
    const [movedCell] = cells.splice(cellIndex, 1);
    cells.splice(newIndex, 0, movedCell);
    
    // Update order properties
    cells.forEach((cell, index) => {
        cell.order = index + 1;
    });
    
    // Update order displays in the UI
    updateCellOrderDisplays();
    
    // Save the new order to the database asynchronously
    saveNotebookOrder()
        .then(() => {
            showNotification(`Cell moved ${direction} successfully`);
        })
        .catch(error => {
            console.error('Error saving cell order:', error);
            showNotification('Cell moved but failed to save order', 'error');
        });
}

/**
 * Save the current notebook cell order to the database
 */
async function saveNotebookOrder() {
    try {
        // Prepare cell data with current order
        const cellsData = cells.map(cell => ({
            id: cell.id,
            query: editors[cell.id] ? editors[cell.id].getValue() : '',
            order: cell.order,
            name: cell.name
        }));
        
        const titleInput = document.querySelector('.notebook-title-input');
        const title = titleInput ? titleInput.value : 'Untitled Notebook';
        
        // Send data to server
        const response = await fetch(`/api/notebooks/${notebookId}/save/`, {
            method: 'POST',
            headers: {
                'X-CSRFToken': getCsrfToken(),
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                title: title,
                cells: cellsData
            })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        if (!data.success) {
            throw new Error(data.error || 'Failed to save notebook');
        }
        
        return data;
    } catch (error) {
        console.error('Error saving notebook order:', error);
        throw error;
    }
}

/**
 * Update cell order displays after reordering
 */
function updateCellOrderDisplays() {
    const allCells = document.querySelectorAll('.sql-cell');
    allCells.forEach((cellElement, index) => {
        const orderElement = cellElement.querySelector('.cell-order');
        if (orderElement) {
            orderElement.textContent = `[${index + 1}]`;
        }
        
        // Update the cell's data-order attribute
        cellElement.dataset.order = index + 1;
    });
}

/**
 * Delete a cell
 */
function deleteCell(cellId) {
    if (confirm('Are you sure you want to delete this cell?')) {
        // Call API to delete the cell
        fetch(`/api/cells/${cellId}/delete/`, {
            method: 'POST',
            headers: {
                'X-CSRFToken': getCsrfToken(),
                'Content-Type': 'application/x-www-form-urlencoded',
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
                // Remove cell from UI
                const cellIndex = cells.findIndex(cell => cell.id === cellId);
                if (cellIndex !== -1) {
                    const cell = cells[cellIndex];
                    cell.element.remove();
                    cells.splice(cellIndex, 1);
                    
                    // Remove editor reference
                    delete editors[cellId];
                    
                    // Dispatch event for cell reference manager
                    document.dispatchEvent(new CustomEvent('cellDeleted', { 
                        detail: { cellId: cellId } 
                    }));
                }
            } else {
                alert('Failed to delete cell: ' + (data.error || 'Unknown error'));
            }
        })
        .catch(error => {
            console.error('Error deleting cell:', error);
            alert('Failed to delete cell: ' + error.message);
        });
    }
}

/**
 * Save notebook to server
 */
function saveNotebook() {
    // Collect all cell data
    const cellsData = [];
    
    cells.forEach(cell => {
        const editor = editors[cell.id];
        if (editor) {
            cellsData.push({
                id: cell.id,
                query: editor.getValue(),
                order: cell.order
            });
        }
    });
    
    const titleInput = document.querySelector('.notebook-title-input');
    const title = titleInput ? titleInput.value : 'Untitled Notebook';
    
    // Send data to server using the UUID format
    fetch(`/api/notebooks/${notebookId}/save/`, {
        method: 'POST',
        headers: {
            'X-CSRFToken': getCsrfToken(),
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            title: title,
            cells: cellsData // Fixed variable name from cellData to cellsData
        })
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        if (data.success) {
            console.log('Notebook saved successfully');
            // Show a success message
            const saveBtn = document.getElementById('save-notebook-btn');
            if (saveBtn) {
                const originalText = saveBtn.textContent;
                saveBtn.textContent = 'Saved!'; 
                saveBtn.classList.add('success');
                
                setTimeout(() => {
                    saveBtn.textContent = originalText;
                    saveBtn.classList.remove('success');
                }, 2000);
            }
        } else {
            console.error('Error saving notebook:', data.error);
            alert('Failed to save notebook: ' + (data.error || 'Unknown error'));
        }
    })
    .catch(error => {
        console.error('Error saving notebook:', error);
        alert('Failed to save notebook: ' + error.message);
    });
}

/**
 * Auto-save the notebook periodically
 */
function autoSaveNotebook() {
    // Only save if there are cells
    if (cells.length > 0) {
        console.log('Auto-saving notebook...');
        saveNotebook();
    }
}
