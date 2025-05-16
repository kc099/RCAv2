// static/js/notebook.js
// Notebook functionality for SQL workbench

document.addEventListener('DOMContentLoaded', function() {
    initNotebook();
});

// Global variables
let notebookId = null;
let cells = [];
let editors = {};

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
    
    console.log('Initializing notebook with ID:', notebookId);
    
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
    
    // Add auto-save functionality
    setInterval(autoSaveNotebook, 30000); // Save every 30 seconds
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
    
    // Send update to server
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
    console.log(`Adding cell to notebook ${notebookId}`);
    // Call API to add a cell to the database
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
        console.log('Cell added successfully:', data);
        if (data.success) {
            // Remove any placeholder empty state
            const emptyNotebook = document.querySelector('.empty-notebook');
            if (emptyNotebook) {
                emptyNotebook.remove();
            }
            
            renderCell({
                id: data.cell_id,
                order: data.order,
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
    console.log('Rendering cell:', cellData);
    const cellElement = document.createElement('div');
    cellElement.className = 'sql-cell';
    cellElement.dataset.cellId = cellData.id;
    cellElement.dataset.order = cellData.order;
    
    const cellHtml = `
        <div class="cell-toolbar">
            <div class="cell-order">[${cellData.order}]</div>
            <div class="cell-buttons">
                <button class="run-cell-btn" title="Run Cell"><i class="fas fa-play"></i></button>
                <button class="move-up-btn" title="Move Up"><i class="fas fa-arrow-up"></i></button>
                <button class="move-down-btn" title="Move Down"><i class="fas fa-arrow-down"></i></button>
                <button class="delete-cell-btn" title="Delete Cell"><i class="fas fa-trash"></i></button>
            </div>
        </div>
        <textarea class="cell-editor-textarea" id="editor-${cellData.id}">${cellData.query || '-- Write your SQL here'}</textarea>
        <div class="cell-result ${cellData.is_executed ? '' : 'hidden'}">
            <div class="result-header">
                <span>Result</span>
                ${cellData.execution_time ? `<span class="exec-time">(${cellData.execution_time.toFixed(2)}s)</span>` : ''}
            </div>
            <div class="result-content" id="result-${cellData.id}">
                ${formatResult(cellData.result)}
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
    
    // Add to cells array
    cells.push({
        id: cellData.id,
        element: cellElement,
        order: cellData.order
    });
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
 * Format SQL result for display
 */
function formatResult(result) {
    if (!result) return '<div class="empty-result">No results to display</div>';
    
    try {
        // Format SQL results as a table
        let html = '<table class="result-table"><thead><tr>';
        
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
                    html += `<td>${value !== null && value !== undefined ? value : 'NULL'}</td>`;
                });
                html += '</tr>';
            });
        } else {
            html += `<tr><td colspan="${headers.length || 1}" class="no-data">No data returned</td></tr>`;
        }
        
        html += '</tbody></table>';
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
    
    // Delete button
    const deleteBtn = cellElement.querySelector('.delete-cell-btn');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', () => {
            deleteCell(cellId);
        });
    }
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
    resultElement.querySelector('.result-content').innerHTML = '<div class="loading">Executing query...</div>';
    
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
            
            resultElement.querySelector('.result-content').innerHTML = formatResult(data.result);
        } else {
            resultElement.querySelector('.result-content').innerHTML = 
                `<div class="error-result">Error: ${data.error || 'Unknown error occurred'}</div>`;
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
    // This would need a backend API to change cell order
    console.log(`Moving cell ${cellId} ${direction}`);
    // For now, just show a message
    alert('Cell reordering is not yet implemented');
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
 * Save the notebook manually
 */
function saveNotebook() {
    console.log('Saving notebook...');
    const titleInput = document.querySelector('.notebook-title-input');
    const title = titleInput ? titleInput.value.trim() : 'Untitled Notebook';
    
    // Gather all cell queries
    const cellData = cells.map(cell => ({
        id: cell.id,
        query: editors[cell.id] ? editors[cell.id].getValue() : ''
    }));
    
    // Call API to save the notebook
    fetch(`/api/notebooks/${notebookId}/save/`, {
        method: 'POST',
        headers: {
            'X-CSRFToken': getCsrfToken(),
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            title: title,
            cells: cellData
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
