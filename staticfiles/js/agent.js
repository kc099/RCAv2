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
        
        if (!currentNotebookId || !activeConnectionId) {
            this.showError('Please ensure you have a notebook open and a database connection active');
            return;
        }

        // Show the conversation area
        this.showConversationArea();

        this.isProcessing = true;
        this.showProcessingStatus('Sending query to agent...');

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

            if (result.success) {
                // Update conversation ID
                this.currentConversationId = result.conversation_id;
                
                // Render the full conversation
                this.renderAgentConversation(result.messages);
                
                // Show completion status
                this.showSuccessStatus(`Completed in ${result.iterations} iterations`);
                
                // If we got final SQL, offer to add it to notebook
                if (result.final_sql) {
                    this.offerSqlInsertion(result.final_sql);
                }
                
                // Show warning if any
                if (result.warning) {
                    this.showWarning(result.warning);
                }
                
            } else {
                this.showError(result.error || 'Agent request failed');
            }

        } catch (error) {
            console.error('Agent request error:', error);
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