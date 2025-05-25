/**
 * Agent.js - Text-to-SQL Agent Integration
 * 
 * This module handles the interaction with the LangGraph text-to-SQL agent,
 * providing natural language to SQL conversion with iterative refinement.
 */

class TextToSQLAgent {
    constructor() {
        this.currentConversationId = null;
        this.isProcessing = false;
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.createAgentUI();
    }

    setupEventListeners() {
        // Store reference to this for use in event handlers
        const self = this;
        
        // Natural language query submission
        document.addEventListener('click', (e) => {
            if (e.target.id === 'submitNlQuery' || e.target.closest('#submitNlQuery')) {
                e.preventDefault();
                self.handleNlQuerySubmit();
            }
        });

        // Enter key submission for natural language input
        document.addEventListener('keydown', (e) => {
            if (e.target.id === 'nlQueryInput' && e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                self.handleNlQuerySubmit();
            }
        });

        // Clear conversation
        document.addEventListener('click', (e) => {
            if (e.target.id === 'clearConversation' || e.target.closest('#clearConversation')) {
                e.preventDefault();
                self.clearConversation();
            }
        });

        // Example prompts
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('example-prompt')) {
                e.preventDefault();
                const promptText = e.target.textContent.trim();
                const nlInput = document.getElementById('nlQueryInput');
                if (nlInput) {
                    nlInput.value = promptText;
                    nlInput.focus();
                }
            }
        });
    }

    createAgentUI() {
        // This function will be called to enhance the existing workbench UI
        // We'll look for existing elements and enhance them rather than create from scratch
        this.enhanceExistingUI();
    }

    enhanceExistingUI() {
        console.log('Enhancing existing UI...');
        
        // Find the existing natural language input area in workbench
        const existingNlInput = document.querySelector('input[placeholder*="natural language"], input[placeholder*="Describe your query"], .nl-input');
        
        console.log('Found input:', existingNlInput);
        
        if (existingNlInput) {
            // Enhance the existing input
            existingNlInput.id = 'nlQueryInput';
            
            // Find or create the submit button
            let submitButton = existingNlInput.parentElement.querySelector('button');
            console.log('Found button:', submitButton);
            
            if (submitButton) {
                // Update existing button
                submitButton.innerHTML = '<i class="fas fa-robot"></i> Ask Agent';
                submitButton.className = 'nl-submit btn btn-primary';
            } else {
                // Create new button if none exists
                submitButton = document.createElement('button');
                submitButton.innerHTML = '<i class="fas fa-robot"></i> Ask Agent';
                submitButton.className = 'btn btn-primary ms-2';
                existingNlInput.parentElement.appendChild(submitButton);
            }
            submitButton.id = 'submitNlQuery';
            
            console.log('Enhanced button:', submitButton);
            
            // The agent response area is now in the HTML template, just show it when needed
            const agentArea = document.getElementById('agentResponseArea');
            if (agentArea) {
                console.log('Found agent response area in template');
            } else {
                console.warn('Agent response area not found in template');
            }
            
            console.log('Agent UI enhanced successfully');
        } else {
            console.error('Could not find natural language input field');
        }
    }

    createAgentResponseArea() {
        const agentArea = document.createElement('div');
        agentArea.id = 'agentResponseArea';
        agentArea.className = 'agent-response-area mt-3';
        
        agentArea.innerHTML = `
            <div class="card">
                <div class="card-header d-flex justify-content-between align-items-center">
                    <h5 class="mb-0">
                        <i class="fas fa-robot me-2"></i>
                        SQL Agent Conversation
                    </h5>
                    <button id="clearConversation" class="btn btn-sm btn-outline-secondary">
                        <i class="fas fa-trash"></i> Clear
                    </button>
                </div>
                <div class="card-body">
                    <div id="conversationHistory" class="conversation-history">
                        <div class="text-muted text-center py-3">
                            Ask me to generate SQL queries in natural language!
                        </div>
                    </div>
                    <div id="agentStatus" class="agent-status mt-2"></div>
                </div>
            </div>
        `;
        
        return agentArea;
    }

    async handleNlQuerySubmit() {
        const nlInput = document.getElementById('nlQueryInput');
        const query = nlInput.value.trim();
        
        if (!query) {
            this.showError('Please enter a natural language query');
            return;
        }

        if (this.isProcessing) {
            this.showError('Agent is currently processing. Please wait...');
            return;
        }

        // Get current context
        const currentNotebookId = this.getCurrentNotebookId();
        const activeConnectionId = this.getActiveConnectionId();
        
        console.log('Agent context:', { currentNotebookId, activeConnectionId, query });
        
        if (!currentNotebookId || !activeConnectionId) {
            this.showError('Please ensure you have a notebook open and a database connection active');
            return;
        }

        // Show the conversation area
        this.showConversationArea();

        // Create a new notebook cell for the agent work
        const cellId = await this.createAgentCell(query);
        if (!cellId) {
            this.showError('Failed to create notebook cell');
            return;
        }

        this.isProcessing = true;
        this.updateCellContent(cellId, '-- Processing your request...', 'Processing...');

        try {
            // Clear input
            nlInput.value = '';
            
            // Add user message to conversation immediately
            this.addMessageToConversation('user', query);
            
            // Prepare request data
            const requestData = {
                query: query,
                connection_id: activeConnectionId,
                notebook_id: currentNotebookId,
                conversation_id: this.currentConversationId
            };

            console.log('Sending request to agent:', requestData);

            // Send to agent endpoint
            const response = await fetch('/mcp_agent/text-to-sql/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': this.getCsrfToken()
                },
                body: JSON.stringify(requestData)
            });

            const result = await response.json();
            console.log('Agent response:', result);

            if (result.success) {
                // Update conversation ID
                this.currentConversationId = result.conversation_id;
                
                // Render the full conversation
                this.renderAgentConversation(result.messages);
                
                // Extract final SQL from the conversation
                let finalSQL = result.final_sql;
                if (!finalSQL) {
                    // Try to extract SQL from the last assistant message
                    const assistantMessages = result.messages.filter(msg => msg.role === 'assistant');
                    if (assistantMessages.length > 0) {
                        const lastAssistant = assistantMessages[assistantMessages.length - 1];
                        const sqlMatch = lastAssistant.content.match(/```sql\s*([\s\S]*?)\s*```/i);
                        if (sqlMatch) {
                            finalSQL = sqlMatch[1].trim();
                        }
                    }
                }

                if (finalSQL) {
                    // Update the cell with the final SQL 
                    await this.updateCellContent(cellId, finalSQL, `Generated SQL (${result.iterations || 1} iterations)`);
                    
                    // Execute the cell to show results in UI (the backend already executed it for iteration)
                    setTimeout(async () => {
                        const executionResult = await this.executeCellAndGetResults(cellId);
                        
                        if (executionResult.success) {
                            this.showSuccessStatus(`SQL generated and executed in ${result.iterations || 1} iterations. Returned ${executionResult.rowCount} rows.`);
                        } else {
                            // If frontend execution fails, just show a warning but don't fail the whole process
                            // since the backend execution already worked for the agent
                            this.showWarning(`SQL generated successfully, but UI execution failed: ${executionResult.error}`);
                        }
                    }, 500); // Small delay to ensure cell is fully updated
                } else {
                    this.updateCellContent(cellId, '-- No SQL generated', 'No SQL Generated');
                    this.showError('Agent did not generate valid SQL');
                }
                
                // Show warning if any
                if (result.warning) {
                    this.showWarning(result.warning);
                }
                
            } else {
                this.updateCellContent(cellId, `-- Error: ${result.error}`, 'Error');
                this.showError(result.error || 'Agent request failed');
            }

        } catch (error) {
            console.error('Agent request error:', error);
            this.updateCellContent(cellId, `-- Network error: ${error.message}`, 'Error');
            this.showError('Network error: ' + error.message);
        } finally {
            this.isProcessing = false;
            this.hideProcessingStatus();
        }
    }

    showConversationArea() {
        const agentArea = document.getElementById('agentResponseArea');
        if (agentArea) {
            agentArea.style.display = 'block';
        }
    }

    async createAgentCell(query) {
        try {
            const notebookUuid = this.getNotebookUuid();
            if (!notebookUuid) {
                console.error('No notebook UUID found');
                return null;
            }

            console.log('Creating cell for notebook:', notebookUuid);

            // Use the global addNewCell function if available
            if (typeof addNewCell === 'function') {
                // Get current cell count
                const currentCells = document.querySelectorAll('.sql-cell').length;
                
                // Call the existing function
                addNewCell();
                
                // Wait for the cell to be created
                let attempts = 0;
                let cellId = null;
                while (attempts < 10 && !cellId) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                    const newCells = document.querySelectorAll('.sql-cell');
                    if (newCells.length > currentCells) {
                        const lastCell = newCells[newCells.length - 1];
                        cellId = parseInt(lastCell.dataset.cellId);
                        break;
                    }
                    attempts++;
                }
                
                if (cellId) {
                    await this.updateCellName(cellId, `Agent: ${query.substring(0, 30)}...`);
                    console.log('Created cell using addNewCell:', cellId);
                    return cellId;
                }
            }

            // Fallback to direct API call
            const response = await fetch(`/api/notebooks/${notebookUuid}/add-cell/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'X-CSRFToken': this.getCsrfToken()
                },
                body: ''
            });

            const result = await response.json();
            if (result.success) {
                console.log('Created cell via API:', result.cell_id);
                
                // Manually render the cell if needed
                if (typeof renderCell === 'function') {
                    // Remove any placeholder empty state
                    const emptyNotebook = document.querySelector('.empty-notebook');
                    if (emptyNotebook) {
                        emptyNotebook.remove();
                    }
                    
                    renderCell({
                        id: result.cell_id,
                        order: result.order,
                        name: `Agent: ${query.substring(0, 30)}...`,
                        query: "-- Processing your request...",
                        result: null,
                        is_executed: false
                    });
                }
                
                return result.cell_id;
            } else {
                console.error('Failed to create cell:', result.error);
                return null;
            }
        } catch (error) {
            console.error('Error creating cell:', error);
            return null;
        }
    }

    async updateCellContent(cellId, sql, name) {
        try {
            console.log('Updating cell:', cellId, 'with SQL:', sql.substring(0, 50) + '...');

            // Update the CodeMirror editor directly if it exists
            if (typeof editors !== 'undefined' && editors[cellId]) {
                editors[cellId].setValue(sql);
                console.log('Updated CodeMirror editor for cell:', cellId);
            }

            // Update via existing function if available
            if (typeof updateCellContent === 'function' && updateCellContent !== this.updateCellContent) {
                // Use the global notebook function
                updateCellContent(cellId, sql);
            } else {
                // Fallback to direct API call
                const updateResponse = await fetch(`/api/cells/${cellId}/update/`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'X-CSRFToken': this.getCsrfToken()
                    },
                    body: `query=${encodeURIComponent(sql)}`
                });

                const updateResult = await updateResponse.json();
                if (!updateResult.success) {
                    console.error('Failed to update cell content:', updateResult.error);
                    return;
                }
            }

            // Update cell name if provided
            if (name) {
                await this.updateCellName(cellId, name);
            }

            console.log('Updated cell:', cellId, 'with SQL length:', sql.length);
        } catch (error) {
            console.error('Error updating cell:', error);
        }
    }

    async updateCellName(cellId, name) {
        try {
            console.log('Updating cell name:', cellId, 'to:', name);

            // Update the name in the UI first
            const nameElement = document.querySelector(`.cell-name[data-cell-id="${cellId}"]`);
            if (nameElement) {
                nameElement.textContent = name;
                console.log('Updated name element in UI');
            }

            // Update in the cells array if it exists
            if (typeof cells !== 'undefined') {
                const cell = cells.find(c => c.id === cellId);
                if (cell) {
                    cell.name = name;
                }
            }

            // Use existing function if available
            if (typeof saveCellName === 'function') {
                saveCellName(cellId, name, null, nameElement);
            } else {
                // Fallback to direct API call
                const response = await fetch(`/api/cells/${cellId}/update-name/`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'X-CSRFToken': this.getCsrfToken()
                    },
                    body: `name=${encodeURIComponent(name)}`
                });

                const result = await response.json();
                if (!result.success) {
                    console.error('Failed to update cell name:', result.error);
                }
            }
        } catch (error) {
            console.error('Error updating cell name:', error);
        }
    }

    getNotebookUuid() {
        // Try to get from the notebook container
        const notebookContainer = document.getElementById('notebook-container');
        if (notebookContainer && notebookContainer.dataset.notebookId) {
            console.log('Found notebook UUID from container:', notebookContainer.dataset.notebookId);
            return notebookContainer.dataset.notebookId;
        }

        // Try to get from global notebookId variable
        if (typeof notebookId !== 'undefined' && notebookId) {
            console.log('Found notebook UUID from global variable:', notebookId);
            return notebookId;
        }

        // Try to extract from URL
        const urlParts = window.location.pathname.split('/');
        const workbenchIndex = urlParts.indexOf('workbench');
        if (workbenchIndex !== -1 && urlParts[workbenchIndex + 1]) {
            console.log('Found notebook UUID from URL:', urlParts[workbenchIndex + 1]);
            return urlParts[workbenchIndex + 1];
        }

        console.warn('Could not find notebook UUID');
        return null;
    }

    async executeCellAndGetResults(cellId) {
        try {
            console.log('Executing cell:', cellId);

            // Get the SQL query from the cell
            let query = '';
            if (typeof editors !== 'undefined' && editors[cellId]) {
                query = editors[cellId].getValue();
            } else {
                // Fallback: get from textarea if CodeMirror isn't available
                const textarea = document.querySelector(`#editor-${cellId}`);
                if (textarea) {
                    query = textarea.value;
                }
            }

            if (!query.trim()) {
                return { success: false, error: 'No SQL query to execute' };
            }

            console.log('Executing query:', query.substring(0, 100) + '...');

            // Execute the cell via the API
            const response = await fetch(`/api/cells/${cellId}/execute/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'X-CSRFToken': this.getCsrfToken()
                },
                body: `query=${encodeURIComponent(query)}`
            });

            const result = await response.json();
            console.log('Execution result:', result);

            if (result.success) {
                // Update the cell UI to show results (like the notebook executeCell function does)
                this.updateCellResultDisplay(cellId, result);

                // Extract the raw data for the LLM (before formatting)
                const rawData = this.extractRawResultData(result.result);

                return {
                    success: true,
                    data: rawData,
                    executionTime: result.execution_time,
                    rowCount: rawData.rows ? rawData.rows.length : 0
                };
            } else {
                // Update cell to show error
                this.updateCellResultDisplay(cellId, result);
                
                return {
                    success: false,
                    error: result.error || 'Query execution failed'
                };
            }

        } catch (error) {
            console.error('Error executing cell:', error);
            return {
                success: false,
                error: `Network error: ${error.message}`
            };
        }
    }

    updateCellResultDisplay(cellId, executionResult) {
        try {
            // Find the cell element
            const cellElement = document.querySelector(`[data-cell-id="${cellId}"]`);
            if (!cellElement) {
                console.warn('Cell element not found for result display');
                return;
            }

            const resultElement = cellElement.querySelector('.cell-result');
            if (!resultElement) {
                console.warn('Result element not found in cell');
                return;
            }

            // Show the result area
            resultElement.classList.remove('hidden');

            if (executionResult.success) {
                // Update execution time
                const execTimeSpan = resultElement.querySelector('.exec-time');
                if (execTimeSpan) {
                    execTimeSpan.textContent = `(${executionResult.execution_time.toFixed(2)}s)`;
                } else {
                    const resultHeader = resultElement.querySelector('.result-header');
                    if (resultHeader) {
                        const timeSpan = document.createElement('span');
                        timeSpan.className = 'exec-time';
                        timeSpan.textContent = `(${executionResult.execution_time.toFixed(2)}s)`;
                        resultHeader.appendChild(timeSpan);
                    }
                }

                // Format and display results using the existing formatResult function
                const resultContentEl = resultElement.querySelector('.result-content');
                if (resultContentEl && typeof formatResult === 'function') {
                    resultContentEl.innerHTML = formatResult(executionResult.result);
                } else {
                    // Fallback simple display
                    resultContentEl.innerHTML = '<div class="result-success">Query executed successfully</div>';
                }
            } else {
                // Show error
                const resultContentEl = resultElement.querySelector('.result-content');
                if (resultContentEl) {
                    resultContentEl.innerHTML = `<div class="error-result">Error: ${executionResult.error || 'Unknown error'}</div>`;
                }
            }

            console.log('Updated cell result display for cell:', cellId);
        } catch (error) {
            console.error('Error updating cell result display:', error);
        }
    }

    extractRawResultData(result) {
        try {
            if (!result) {
                return { rows: [], columns: [], rowCount: 0 };
            }

            // Use the same logic as processResultForExport to get clean data
            let rows = [];
            let columns = [];

            if (result.rows && Array.isArray(result.rows)) {
                rows = result.rows;
                if (result.columns && Array.isArray(result.columns)) {
                    columns = result.columns;
                } else if (rows.length > 0) {
                    // Extract column names from first row
                    columns = Object.keys(rows[0]);
                }
            } else if (result.data && Array.isArray(result.data) && result.columns) {
                // Convert from column-based to row-based format
                columns = result.columns;
                const rowCount = result.data[0]?.length || 0;
                
                for (let i = 0; i < rowCount; i++) {
                    const rowData = {};
                    for (let j = 0; j < columns.length; j++) {
                        if (result.data[j] && i < result.data[j].length) {
                            rowData[columns[j]] = result.data[j][i];
                        }
                    }
                    rows.push(rowData);
                }
            }

            return {
                rows: rows,
                columns: columns,
                rowCount: rows.length
            };

        } catch (error) {
            console.error('Error extracting raw result data:', error);
            return { rows: [], columns: [], rowCount: 0 };
        }
    }

    renderAgentConversation(messages) {
        const conversationHistory = document.getElementById('conversationHistory');
        if (!conversationHistory) return;

        // Clear existing content
        conversationHistory.innerHTML = '';

        messages.forEach(message => {
            const messageElement = this.createMessageElement(message);
            conversationHistory.appendChild(messageElement);
        });

        // Scroll to bottom
        conversationHistory.scrollTop = conversationHistory.scrollHeight;
    }

    createMessageElement(message) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message message-${message.role} mb-3`;
        
        let iconClass = 'fas fa-user';
        let roleLabel = 'User';
        let messageClass = 'alert alert-light';
        
        switch (message.role.toLowerCase()) {
            case 'user':
                iconClass = 'fas fa-user';
                roleLabel = 'You';
                messageClass = 'alert alert-primary';
                break;
            case 'assistant':
                iconClass = 'fas fa-robot';
                roleLabel = 'Agent';
                messageClass = 'alert alert-success';
                break;
            case 'tool_result':
                iconClass = 'fas fa-database';
                roleLabel = 'Database';
                messageClass = 'alert alert-info';
                break;
            case 'system':
                iconClass = 'fas fa-cog';
                roleLabel = 'System';
                messageClass = 'alert alert-secondary';
                break;
        }

        const formattedContent = this.formatMessageContent(message.content, message.role);
        
        messageDiv.innerHTML = `
            <div class="${messageClass}">
                <div class="d-flex align-items-start">
                    <i class="${iconClass} me-2 mt-1"></i>
                    <div class="flex-grow-1">
                        <strong>${roleLabel}</strong>
                        <small class="text-muted ms-2">${this.formatTimestamp(message.timestamp)}</small>
                        <div class="mt-1">${formattedContent}</div>
                    </div>
                </div>
            </div>
        `;

        return messageDiv;
    }

    formatMessageContent(content, role) {
        if (role.toLowerCase() === 'assistant') {
            // Format SQL code blocks
            return content.replace(
                /```sql\s*([\s\S]*?)\s*```/gi, 
                '<div class="sql-block bg-dark text-light p-3 rounded mt-2 mb-2"><pre><code>$1</code></pre></div>'
            ).replace(/\n/g, '<br>');
        } else if (role.toLowerCase() === 'tool_result') {
            // Format tool results with syntax highlighting
            if (content.includes('Query executed successfully')) {
                return `<div class="text-success">${content.replace(/\n/g, '<br>')}</div>`;
            } else if (content.includes('failed') || content.includes('error')) {
                return `<div class="text-danger">${content.replace(/\n/g, '<br>')}</div>`;
            }
        }
        
        return content.replace(/\n/g, '<br>');
    }

    formatTimestamp(timestamp) {
        if (!timestamp) return '';
        const date = new Date(timestamp);
        return date.toLocaleTimeString();
    }

    addMessageToConversation(role, content) {
        const conversationHistory = document.getElementById('conversationHistory');
        if (!conversationHistory) return;

        // Remove welcome message if it exists
        const welcomeMsg = conversationHistory.querySelector('.text-muted.text-center');
        if (welcomeMsg) {
            welcomeMsg.remove();
        }

        const message = {
            role: role,
            content: content,
            timestamp: new Date().toISOString()
        };

        const messageElement = this.createMessageElement(message);
        conversationHistory.appendChild(messageElement);
        conversationHistory.scrollTop = conversationHistory.scrollHeight;
    }

    offerSqlInsertion(sql) {
        const statusArea = document.getElementById('agentStatus');
        if (!statusArea) return;

        statusArea.innerHTML = `
            <div class="alert alert-success d-flex justify-content-between align-items-center">
                <span><i class="fas fa-check-circle me-2"></i>SQL query generated successfully!</span>
                <button class="btn btn-primary btn-sm" onclick="textToSQLAgent.insertSqlToNotebook('${this.escapeSql(sql)}')">
                    <i class="fas fa-plus"></i> Add to Notebook
                </button>
            </div>
        `;
    }

    escapeSql(sql) {
        return sql.replace(/'/g, "\\'").replace(/\n/g, '\\n');
    }

    insertSqlToNotebook(sql) {
        // Clean up the SQL
        const cleanSql = sql.replace(/\\'/g, "'").replace(/\\n/g, '\n');
        
        // Try different methods to add to notebook
        if (typeof window.notebook !== 'undefined' && window.notebook.addCell) {
            // Method 1: Use global notebook object
            window.notebook.addCell(cleanSql);
            this.showSuccessStatus('SQL added to notebook successfully!');
        } else if (typeof addCellToNotebook === 'function') {
            // Method 2: Use global function
            addCellToNotebook(cleanSql);
            this.showSuccessStatus('SQL added to notebook successfully!');
        } else {
            // Method 3: Trigger the add cell button and set content
            const addButton = document.getElementById('add-cell-btn');
            if (addButton) {
                addButton.click();
                
                // Wait a bit for the cell to be created, then set its content
                setTimeout(() => {
                    const cells = document.querySelectorAll('.sql-cell');
                    const lastCell = cells[cells.length - 1];
                    if (lastCell) {
                        const textarea = lastCell.querySelector('textarea, .CodeMirror');
                        if (textarea) {
                            if (textarea.CodeMirror) {
                                textarea.CodeMirror.setValue(cleanSql);
                            } else {
                                textarea.value = cleanSql;
                            }
                            this.showSuccessStatus('SQL added to notebook successfully!');
                        }
                    }
                }, 100);
            } else {
                // Fallback: copy to clipboard
                navigator.clipboard.writeText(cleanSql).then(() => {
                    this.showSuccessStatus('SQL copied to clipboard! Paste it into a new cell.');
                }).catch(() => {
                    this.showError('Unable to add SQL to notebook. Please copy and paste manually.');
                });
            }
        }
    }

    clearConversation() {
        this.currentConversationId = null;
        const conversationHistory = document.getElementById('conversationHistory');
        if (conversationHistory) {
            conversationHistory.innerHTML = `
                <div class="text-muted text-center py-3">
                    Ask me to generate SQL queries in natural language!
                </div>
            `;
        }
        this.hideStatus();
    }

    showProcessingStatus(message) {
        const statusArea = document.getElementById('agentStatus');
        if (statusArea) {
            statusArea.innerHTML = `
                <div class="alert alert-info">
                    <i class="fas fa-spinner fa-spin me-2"></i>${message}
                </div>
            `;
        }
    }

    showSuccessStatus(message) {
        const statusArea = document.getElementById('agentStatus');
        if (statusArea) {
            statusArea.innerHTML = `
                <div class="alert alert-success">
                    <i class="fas fa-check-circle me-2"></i>${message}
                </div>
            `;
            setTimeout(() => this.hideStatus(), 5000);
        }
    }

    showError(message) {
        const statusArea = document.getElementById('agentStatus');
        if (statusArea) {
            statusArea.innerHTML = `
                <div class="alert alert-danger">
                    <i class="fas fa-exclamation-circle me-2"></i>${message}
                </div>
            `;
        }
    }

    showWarning(message) {
        const statusArea = document.getElementById('agentStatus');
        if (statusArea) {
            statusArea.innerHTML = `
                <div class="alert alert-warning">
                    <i class="fas fa-exclamation-triangle me-2"></i>${message}
                </div>
            `;
        }
    }

    hideProcessingStatus() {
        // Keep other status messages, only hide processing
        const statusArea = document.getElementById('agentStatus');
        if (statusArea && statusArea.innerHTML.includes('fa-spinner')) {
            statusArea.innerHTML = '';
        }
    }

    hideStatus() {
        const statusArea = document.getElementById('agentStatus');
        if (statusArea) {
            statusArea.innerHTML = '';
        }
    }

    getCurrentNotebookId() {
        console.log('Getting current notebook ID...');
        
        // Try to get from global variables
        if (typeof window.currentNotebookId !== 'undefined' && window.currentNotebookId) {
            console.log('Found notebook ID from global variable:', window.currentNotebookId);
            return window.currentNotebookId;
        }
        
        // Try to extract from URL
        const urlParts = window.location.pathname.split('/');
        const notebookIndex = urlParts.indexOf('workbench');
        if (notebookIndex !== -1 && urlParts[notebookIndex + 1]) {
            const notebookId = parseInt(urlParts[notebookIndex + 1]);
            console.log('Found notebook ID from URL:', notebookId);
            return notebookId;
        }
        
        console.warn('Could not find notebook ID');
        return null;
    }

    getActiveConnectionId() {
        console.log('Getting active connection ID...');
        
        // Try to get from global variables
        if (typeof window.activeConnectionId !== 'undefined' && window.activeConnectionId) {
            console.log('Found connection ID from global variable:', window.activeConnectionId);
            return window.activeConnectionId;
        }
        
        // Try to get from data attributes or stored values
        const connectionSelect = document.querySelector('select[name="connection"], #connectionSelect');
        if (connectionSelect && connectionSelect.value) {
            const connectionId = parseInt(connectionSelect.value);
            console.log('Found connection ID from select:', connectionId);
            return connectionId;
        }
        
        console.warn('Could not find active connection ID');
        return null;
    }

    getCsrfToken() {
        const csrfToken = document.querySelector('[name=csrfmiddlewaretoken]');
        if (csrfToken) {
            return csrfToken.value;
        }
        
        // Try to get from cookie
        const cookieValue = document.cookie
            .split('; ')
            .find(row => row.startsWith('csrftoken='))
            ?.split('=')[1];
            
        return cookieValue || '';
    }
}

// Initialize the agent when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded, initializing TextToSQLAgent...');
    try {
        window.textToSQLAgent = new TextToSQLAgent();
        console.log('TextToSQLAgent initialized successfully');
    } catch (error) {
        console.error('Error initializing TextToSQLAgent:', error);
    }
});

// Register with app registry if available
if (typeof AppRegistry !== 'undefined') {
    AppRegistry.register('textToSQLAgent', () => window.textToSQLAgent);
} 