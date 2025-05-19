// static/js/notebook.js
// Notebook functionality for SQL workbench

document.addEventListener('DOMContentLoaded', function() {
    initNotebook();
});

// Global variables
let notebookId = null;
let cells = [];
let editors = {};
let autoSaveInterval = null; // Track auto-save interval

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
    const cell = cells.find(c => c.id === parseInt(cellId));
    if (cell) {
        cell.name = displayName;
    }
    
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
