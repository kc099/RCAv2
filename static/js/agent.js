/**
 * Cell Reference Manager - Handles @ functionality and checkbox-based cell selection
 */
class CellReferenceManager {
    constructor() {
        this.isDropdownOpen = false;
        this.selectedCells = new Map(); // cellId -> cellData
        this.availableCells = [];
        this.cellResults = new Map(); // Cache for cell results
        this.resultsPreviews = new Map(); // Cache for result previews
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadAvailableCells();
    }

    setupEventListeners() {
        // Reference button click
        document.addEventListener('click', (e) => {
            if (e.target.id === 'cellReferenceBtn' || e.target.closest('#cellReferenceBtn')) {
                e.preventDefault();
                this.toggleDropdown();
            }
        });

        // Search input
        document.addEventListener('input', (e) => {
            if (e.target.id === 'cellSearchInput') {
                this.filterCells(e.target.value);
            }
        });

        // Cell selection
        document.addEventListener('click', (e) => {
            if (e.target.closest('.cell-reference-item')) {
                const item = e.target.closest('.cell-reference-item');
                const cellId = parseInt(item.dataset.cellId);
                this.toggleCellSelection(cellId);
            }
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.nl-input-wrapper')) {
                this.closeDropdown();
            }
        });

        // Handle @ key in input
        document.addEventListener('keydown', (e) => {
            if (e.target.id === 'nlQueryInput') {
                if (e.key === '@') {
                    setTimeout(() => this.openDropdown(), 10);
                } else if (e.key === 'Escape' && this.isDropdownOpen) {
                    this.closeDropdown();
                }
            }
        });

        // Remove tag clicks
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('remove-tag')) {
                const tag = e.target.closest('.cell-reference-tag');
                const cellId = parseInt(tag.dataset.cellId);
                this.deselectCell(cellId);
            }
        });

        // Checkbox selection handling
        document.addEventListener('change', (e) => {
            if (e.target.classList.contains('cell-reference-checkbox')) {
                const cellId = parseInt(e.target.dataset.cellId);
                if (e.target.checked) {
                    this.selectCellFromCheckbox(cellId);
                } else {
                    this.deselectCell(cellId);
                }
            }
        });

        // Listen for cell updates
        document.addEventListener('cellUpdated', () => {
            this.loadAvailableCells();
        });

        document.addEventListener('cellAdded', () => {
            this.loadAvailableCells();
        });

        document.addEventListener('cellDeleted', () => {
            this.loadAvailableCells();
        });
    }

    loadAvailableCells() {
        this.availableCells = [];
        
        // Get cells from the notebook DOM
        const cellElements = document.querySelectorAll('.sql-cell');
        cellElements.forEach(cellElement => {
            const cellId = parseInt(cellElement.dataset.cellId);
            const cellOrder = parseInt(cellElement.dataset.order);
            const cellNameElement = cellElement.querySelector('.cell-name');
            const cellName = cellNameElement ? cellNameElement.textContent.trim() : `Cell ${cellOrder}`;
            
            // Get cell query content
            let cellQuery = '';
            try {
                const editorId = `editor-${cellId}`;
                if (window.editors && window.editors[editorId]) {
                    cellQuery = window.editors[editorId].getValue();
                } else {
                    const textarea = cellElement.querySelector('.cell-editor-textarea');
                    if (textarea) {
                        cellQuery = textarea.value;
                    }
                }
            } catch (error) {
                console.warn('Could not get query for cell', cellId, error);
            }

            this.availableCells.push({
                id: cellId,
                order: cellOrder,
                name: cellName,
                query: cellQuery || '-- Empty cell'
            });
        });

        this.renderCellList();
    }

    renderCellList() {
        const listElement = document.getElementById('cellReferenceList');
        if (!listElement) return;

        if (this.availableCells.length === 0) {
            listElement.innerHTML = '<div class="no-cells-message">No cells available in this notebook</div>';
            return;
        }

        const html = this.availableCells.map(cell => {
            const isSelected = this.selectedCells.has(cell.id);
            const preview = cell.query.length > 50 ? 
                cell.query.substring(0, 50) + '...' : 
                cell.query;

            return `
                <div class="cell-reference-item ${isSelected ? 'selected' : ''}" data-cell-id="${cell.id}">
                    <div class="cell-name-ref">
                        <span class="cell-order-ref">[${cell.order}]</span>
                        ${cell.name}
                    </div>
                    <div class="cell-preview">${preview}</div>
                </div>
            `;
        }).join('');

        listElement.innerHTML = html;
    }

    filterCells(searchTerm) {
        const filteredCells = this.availableCells.filter(cell => {
            const searchLower = searchTerm.toLowerCase();
            return cell.name.toLowerCase().includes(searchLower) ||
                   cell.query.toLowerCase().includes(searchLower) ||
                   cell.order.toString().includes(searchTerm);
        });

        const listElement = document.getElementById('cellReferenceList');
        if (!listElement) return;

        if (filteredCells.length === 0) {
            listElement.innerHTML = '<div class="no-cells-message">No cells match your search</div>';
            return;
        }

        const html = filteredCells.map(cell => {
            const isSelected = this.selectedCells.has(cell.id);
            const preview = cell.query.length > 50 ? 
                cell.query.substring(0, 50) + '...' : 
                cell.query;

            return `
                <div class="cell-reference-item ${isSelected ? 'selected' : ''}" data-cell-id="${cell.id}">
                    <div class="cell-name-ref">
                        <span class="cell-order-ref">[${cell.order}]</span>
                        ${cell.name}
                    </div>
                    <div class="cell-preview">${preview}</div>
                </div>
            `;
        }).join('');

        listElement.innerHTML = html;
    }

    toggleDropdown() {
        if (this.isDropdownOpen) {
            this.closeDropdown();
        } else {
            this.openDropdown();
        }
    }

    openDropdown() {
        const dropdown = document.getElementById('cellReferenceDropdown');
        const button = document.getElementById('cellReferenceBtn');
        
        if (dropdown && button) {
            this.loadAvailableCells();
            dropdown.style.display = 'block';
            button.classList.add('active');
            this.isDropdownOpen = true;
            
            // Focus search input
            const searchInput = document.getElementById('cellSearchInput');
            if (searchInput) {
                setTimeout(() => searchInput.focus(), 100);
            }
        }
    }

    closeDropdown() {
        const dropdown = document.getElementById('cellReferenceDropdown');
        const button = document.getElementById('cellReferenceBtn');
        
        if (dropdown && button) {
            dropdown.style.display = 'none';
            button.classList.remove('active');
            this.isDropdownOpen = false;
            
            // Clear search
            const searchInput = document.getElementById('cellSearchInput');
            if (searchInput) {
                searchInput.value = '';
            }
        }
    }

    toggleCellSelection(cellId) {
        if (this.selectedCells.has(cellId)) {
            this.deselectCell(cellId);
        } else {
            this.selectCell(cellId);
        }
    }

    selectCell(cellId) {
        const cell = this.availableCells.find(c => c.id === cellId);
        if (cell) {
            this.selectedCells.set(cellId, cell);
            this.renderSelectedCells();
            this.renderCellList(); // Update selection state in dropdown
        }
    }

    deselectCell(cellId) {
        this.selectedCells.delete(cellId);
        this.renderSelectedCells();
        this.renderCellList(); // Update selection state in dropdown
    }

    renderSelectedCells() {
        const container = document.querySelector('.nl-input-container');
        if (!container) return;

        // Remove existing tags
        const existingTags = container.querySelector('.cell-reference-tags');
        if (existingTags) {
            existingTags.remove();
        }

        if (this.selectedCells.size === 0) return;

        // Create tags container
        const tagsContainer = document.createElement('div');
        tagsContainer.className = 'cell-reference-tags';

        this.selectedCells.forEach(cell => {
            const tag = document.createElement('div');
            tag.className = 'cell-reference-tag';
            tag.dataset.cellId = cell.id;
            tag.innerHTML = `
                <span>[${cell.order}] ${cell.name}</span>
                <span class="remove-tag">×</span>
            `;
            tagsContainer.appendChild(tag);
        });

        // Insert tags at the beginning of the container (above the input row)
        const inputRow = container.querySelector('.nl-input-row');
        if (inputRow) {
            container.insertBefore(tagsContainer, inputRow);
        } else {
            // Fallback: insert at the beginning
            container.insertBefore(tagsContainer, container.firstChild);
        }
    }

    getSelectedCellsData() {
        const cellsData = [];
        this.selectedCells.forEach(cell => {
            cellsData.push({
                id: cell.id,
                name: cell.name,
                order: cell.order,
                query: cell.query
            });
        });
        return cellsData;
    }

    async selectCellFromCheckbox(cellId) {
        // Find the cell data
        const cell = this.availableCells.find(c => c.id === cellId);
        if (cell) {
            // Load full data including results if available
            const cellData = await this.loadCellData(cellId);
            this.selectedCells.set(cellId, cellData || cell);
            this.renderSelectedCells();
            this.renderCellList();
        }
    }

    async loadCellData(cellId) {
        try {
            const notebookUuid = this.getNotebookUuid();
            if (!notebookUuid) return null;

            const response = await fetch(`/api/notebooks/${notebookUuid}/cells/${cellId}/results/?detail=preview`);
            const result = await response.json();
            
            if (result.success) {
                this.resultsPreviews.set(cellId, result.data);
                return result.data;
            }
        } catch (error) {
            console.warn('Could not load cell results:', error);
        }
        
        // Fallback to basic cell data
        return this.availableCells.find(c => c.id === cellId);
    }

    async loadAvailableCellsWithResults() {
        try {
            const notebookUuid = this.getNotebookUuid();
            if (!notebookUuid) return [];

            const response = await fetch(`/api/notebooks/${notebookUuid}/cell-summaries/`);
            const result = await response.json();
            
            if (result.success) {
                return result.cells;
            }
        } catch (error) {
            console.warn('Could not load cell summaries:', error);
        }
        return [];
    }

    getNotebookUuid() {
        // Try to get from the notebook container
        const notebookContainer = document.getElementById('notebook-container');
        if (notebookContainer && notebookContainer.dataset.notebookId) {
            return notebookContainer.dataset.notebookId;
        }
        
        // Try to extract from URL
        const urlParts = window.location.pathname.split('/');
        const workbenchIndex = urlParts.indexOf('workbench');
        if (workbenchIndex !== -1 && urlParts[workbenchIndex + 1]) {
            return urlParts[workbenchIndex + 1];
        }
        
        return null;
    }

    getReferencedCellsText() {
        if (this.selectedCells.size === 0) return '';

        let referencedText = '\n\n--- Referenced Cells ---\n';
        this.selectedCells.forEach(cell => {
            referencedText += `\n[${cell.order || 'N/A'}] ${cell.cell_name || cell.name || 'Untitled'}:\n`;
            referencedText += `SQL: ${cell.cell_query || cell.query || 'No query'}\n`;
            
            // Add result info if available
            if (cell.has_results || cell.total_rows > 0) {
                referencedText += `Results: ${cell.total_rows || cell.row_count || 0} rows`;
                if (cell.columns && cell.columns.length > 0) {
                    referencedText += `, Columns: ${cell.columns.slice(0, 5).join(', ')}${cell.columns.length > 5 ? '...' : ''}`;
                }
                referencedText += '\n';
                
                // Add sample data if available
                if (cell.sample_rows && cell.sample_rows.length > 0) {
                    referencedText += `Sample Data:\n`;
                    cell.sample_rows.slice(0, 2).forEach((row, idx) => {
                        referencedText += `  Row ${idx + 1}: ${JSON.stringify(row)}\n`;
                    });
                }
            }
            referencedText += '\n';
        });
        referencedText += '--- End Referenced Cells ---\n';
        return referencedText;
    }

    clearSelectedCells() {
        this.selectedCells.clear();
        this.renderSelectedCells();
        this.renderCellList();
        
        // Uncheck all checkboxes
        document.querySelectorAll('.cell-reference-checkbox').forEach(checkbox => {
            checkbox.checked = false;
        });
    }

    getSelectedCellsForAgent() {
        const cellsData = [];
        this.selectedCells.forEach(cell => {
            const cellInfo = {
                id: cell.cell_id || cell.id,
                name: cell.cell_name || cell.name,
                order: cell.order,
                query: cell.cell_query || cell.query,
                has_results: cell.has_results || false,
                row_count: cell.total_rows || cell.row_count || 0,
                columns: cell.columns || [],
                execution_time: cell.execution_time,
                last_executed: cell.last_executed
            };
            
            // Include sample data if available
            if (cell.sample_rows) {
                cellInfo.sample_data = cell.sample_rows;
            }
            
            cellsData.push(cellInfo);
        });
        return cellsData;
    }
}

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
        this.cellReferenceManager = new CellReferenceManager();
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.createAgentUI();
        
        // Wait for notebook to be ready before finalizing setup
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.finalizeSetup());
        } else {
            this.finalizeSetup();
        }
    }
    
    finalizeSetup() {
        // Wait for notebook functions to be available
        const checkNotebookReady = () => {
            if (typeof addNewCell === 'function' && typeof renderCell === 'function') {
                return true;
            }
            return false;
        };
        
        if (!checkNotebookReady()) {
            // Wait up to 3 seconds for notebook to initialize
            let attempts = 0;
            const waitForNotebook = setInterval(() => {
                attempts++;
                if (checkNotebookReady() || attempts > 30) {
                    clearInterval(waitForNotebook);
                    if (attempts > 30) {
                        console.warn('Notebook functions not available after waiting');
                    }
                }
            }, 100);
        }
    }

    setupEventListeners() {
        // Store reference to this for use in event handlers
        const self = this;
        
        // Natural language query submission
        document.addEventListener('click', (e) => {
            const isSubmitButton = 
                e.target.id === 'submitNlQuery' || 
                e.target.closest('#submitNlQuery') ||
                e.target.classList.contains('nl-submit') ||
                e.target.closest('.nl-submit') ||
                (e.target.textContent && e.target.textContent.includes('Ask Agent'));
                
            if (isSubmitButton) {
                e.preventDefault();
                self.handleNlQuerySubmit();
            }
        });

        // Enter key submission for natural language input
        document.addEventListener('keydown', (e) => {
            if ((e.target.id === 'nlQueryInput' || e.target.classList.contains('nl-input')) && e.key === 'Enter' && !e.shiftKey) {
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

        // Copy SQL button handling
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('copy-sql-btn') || e.target.closest('.copy-sql-btn')) {
                e.preventDefault();
                const button = e.target.closest('.copy-sql-btn');
                const sqlCode = button.dataset.sql;
                if (sqlCode) {
                    navigator.clipboard.writeText(sqlCode).then(() => {
                        button.classList.add('copied');
                        setTimeout(() => button.classList.remove('copied'), 2000);
                    }).catch(err => {
                        console.error('Failed to copy SQL:', err);
                    });
                }
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
        
        // Retry enhancement after a delay if elements weren't found
        setTimeout(() => {
            this.enhanceExistingUI();
        }, 1000);
    }

    enhanceExistingUI() {
        // Find the existing natural language input area in workbench
        let existingNlInput = document.querySelector('input[placeholder*="natural language"], input[placeholder*="Describe your query"], .nl-input');
        
        // If not found, try a broader search
        if (!existingNlInput) {
            existingNlInput = document.querySelector('#nlQueryInput');
        }
        
        if (existingNlInput) {
            // Enhance the existing input
            existingNlInput.id = 'nlQueryInput';
            
            // Find the submit button
            let submitButton = document.getElementById('submitNlQuery');
            
            if (!submitButton) {
                const nlInputContainer = existingNlInput.closest('.nl-input-container');
                if (nlInputContainer) {
                    submitButton = nlInputContainer.querySelector('.nl-submit');
                    if (!submitButton) {
                        const buttons = nlInputContainer.querySelectorAll('button');
                        for (const btn of buttons) {
                            if (!btn.closest('.nl-input-wrapper')) {
                                submitButton = btn;
                                break;
                            }
                        }
                    }
                }
            }
            
            if (!submitButton) {
                const allButtons = document.querySelectorAll('button');
                for (const btn of allButtons) {
                    if (btn.textContent.includes('Ask Agent') || btn.textContent.includes('Generate SQL')) {
                        submitButton = btn;
                        break;
                    }
                }
            }
            
            if (submitButton) {
                // Update existing submit button
                submitButton.innerHTML = '<i class="fas fa-robot"></i> Ask Agent';
                submitButton.className = 'nl-submit';
                submitButton.id = 'submitNlQuery';
                
                // Add a direct click event listener as backup
                submitButton.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.handleNlQuerySubmit();
                });
            } else {
                // Create a new button as fallback
                const nlContainer = existingNlInput.closest('.nl-input-container');
                if (nlContainer) {
                    const newButton = document.createElement('button');
                    newButton.innerHTML = '<i class="fas fa-robot"></i> Ask Agent';
                    newButton.className = 'nl-submit';
                    newButton.id = 'submitNlQuery';
                    newButton.type = 'button';
                    
                    const inputRow = nlContainer.querySelector('.nl-input-row');
                    if (inputRow) {
                        inputRow.appendChild(newButton);
                    } else {
                        nlContainer.appendChild(newButton);
                    }
                    
                    newButton.addEventListener('click', (e) => {
                        e.preventDefault();
                        this.handleNlQuerySubmit();
                    });
                }
            }
        }

        // Create and add the conversation area to the DOM
        if (!document.getElementById('agentResponseArea')) {
            const agentArea = this.createAgentResponseArea();
            
            // Find a good place to insert the conversation area
            const nlContainer = document.querySelector('.nl-input-container');
            if (nlContainer) {
                // Insert after the natural language input container
                nlContainer.parentNode.insertBefore(agentArea, nlContainer.nextSibling);
            } else {
                // Fallback: add to the main content area
                const mainContent = document.querySelector('#main-content, .main-content, .content, main');
                if (mainContent) {
                    mainContent.appendChild(agentArea);
                } else {
                    // Last resort: add to body
                    document.body.appendChild(agentArea);
                }
            }
            
            // Initially hide the conversation area
            agentArea.style.display = 'none';
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
        if (!nlInput) {
            console.error('Natural language input field not found');
            this.showError('Input field not found');
            return;
        }
        
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
            const errorMsg = 'Missing context: ' + 
                (!currentNotebookId ? 'notebook ID ' : '') + 
                (!activeConnectionId ? 'connection ID' : '');
            console.error('Context validation failed:', errorMsg);
            this.showError(`Agent context error: ${errorMsg}. Please refresh the page.`);
            return;
        }

        // Set processing flag early to prevent multiple submissions
        this.isProcessing = true;

        // Show the conversation area
        this.showConversationArea();

        // Create a new notebook cell for the agent work
        const cellId = await this.createAgentCell(query);
        if (!cellId) {
            console.error('Failed to create agent cell');
            this.showError('Failed to create notebook cell. Please try adding a cell manually first.');
            this.isProcessing = false; // Reset processing flag
            return;
        }
        
        this.updateCellContent(cellId, '-- Processing your request...');

        try {
            // Get selected cells for context
            const selectedCells = this.cellReferenceManager.getSelectedCellsForAgent();
            
            // Clear input
            nlInput.value = '';
            
            // Add user message to conversation immediately
            let displayQuery = query;
            if (selectedCells.length > 0) {
                displayQuery += ` (referencing ${selectedCells.length} cell${selectedCells.length > 1 ? 's' : ''})`;
            }
            this.addMessageToConversation('user', displayQuery);
            
            // Prepare request data
            const requestData = {
                query: query,
                connection_id: activeConnectionId,
                notebook_id: currentNotebookId,
                conversation_id: this.currentConversationId,
                referenced_cells: selectedCells
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
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error('Agent response error:', response.status, errorText);
                throw new Error(`Server error ${response.status}: ${errorText}`);
            }

            const result = await response.json();

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
                    // Update the cell with the final SQL (don't override the name)
                    await this.updateCellContent(cellId, finalSQL);
                    
                    // Execute the cell using the global function to show results in UI
                    setTimeout(() => {
                        if (typeof executeCell === 'function') {
                            executeCell(cellId);
                            this.showSuccessStatus(`SQL generated and executed in ${result.iterations || 1} iterations.`);
                        } else {
                            console.warn('executeCell function not available, trying manual execution');
                            // Fallback to manual execution
                            this.executeCellAndGetResults(cellId).then(executionResult => {
                                if (executionResult.success) {
                                    this.showSuccessStatus(`SQL generated and executed in ${result.iterations || 1} iterations. Returned ${executionResult.rowCount} rows.`);
                                } else {
                                    this.showWarning(`SQL generated successfully, but UI execution failed: ${executionResult.error}`);
                                }
                            });
                        }
                    }, 500); // Small delay to ensure cell is fully updated
                } else {
                    console.warn('No SQL generated by agent');
                    this.updateCellContent(cellId, '-- No SQL generated', 'No SQL Generated');
                    this.showError('Agent did not generate valid SQL');
                }
                
                // Show warning if any
                if (result.warning) {
                    this.showWarning(result.warning);
                }
                
            } else {
                console.error('Agent request failed:', result.error);
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

    /**
     * Create a clean cell name from user query
     * @param {string} query - The user's natural language query
     * @param {number} maxLength - Maximum length for the cell name (default 50)
     * @returns {string} - Clean cell name
     */
    createCellNameFromQuery(query, maxLength = 50) {
        if (!query || typeof query !== 'string') {
            return 'Agent Query';
        }
        
        // Clean up the query text
        let cleanQuery = query
            .trim()
            .replace(/\s+/g, ' ') // Replace multiple whitespace with single space
            .replace(/[^\w\s-_.,()?!]/g, '') // Remove special characters except common ones
            .replace(/^(describe|show|get|find|list|select|count|sum|avg|max|min)\s+/i, '') // Remove common SQL verbs
            .trim();
        
        // If the query is too long, truncate and add ellipsis
        if (cleanQuery.length > maxLength) {
            cleanQuery = cleanQuery.substring(0, maxLength - 3) + '...';
        }
        
        // Ensure we have some meaningful text
        if (cleanQuery.length < 3) {
            return 'Agent Query';
        }
        
        // Capitalize first letter
        return cleanQuery.charAt(0).toUpperCase() + cleanQuery.slice(1);
    }

    async createAgentCell(query) {
        try {
            const notebookUuid = this.getNotebookUuid();
            if (!notebookUuid) {
                console.error('No notebook UUID found');
                return null;
            }

            // Create cell name from query
            const cellName = this.createCellNameFromQuery(query);

            // Use the global addNewCell function if available
            if (typeof addNewCell === 'function') {
                // Get current cell count
                const currentCells = document.querySelectorAll('.sql-cell').length;
                
                // Call the existing function
                addNewCell();
                
                // Wait for the cell to be created
                let attempts = 0;
                let cellId = null;
                while (attempts < 20 && !cellId) {
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
                    await this.updateCellName(cellId, cellName);
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
                        name: cellName,
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
            // Update the CodeMirror editor directly if it exists
            if (typeof editors !== 'undefined' && editors[cellId]) {
                editors[cellId].setValue(sql);
            }

            // Update via existing function if available
            if (typeof updateCellContent === 'function' && updateCellContent !== this.updateCellContent) {
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
                    return;
                }
            }

            // Update cell name if provided
            if (name) {
                await this.updateCellName(cellId, name);
            }
        } catch (error) {
            // Silent error handling
        }
    }

    async updateCellName(cellId, name) {
        try {
            // Update the name in the UI first
            const nameElement = document.querySelector(`.cell-name[data-cell-id="${cellId}"]`);
            if (nameElement) {
                nameElement.textContent = name;
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
            return notebookContainer.dataset.notebookId;
        }

        // Try to get from global notebookId variable
        if (typeof notebookId !== 'undefined' && notebookId) {
            return notebookId;
        }

        // Try to extract from URL
        const urlParts = window.location.pathname.split('/');
        const workbenchIndex = urlParts.indexOf('workbench');
        if (workbenchIndex !== -1 && urlParts[workbenchIndex + 1]) {
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
            // Split content into explanation and SQL parts
            const sqlMatches = content.match(/```sql\s*([\s\S]*?)\s*```/gi);
            let formattedContent = content;
            
            if (sqlMatches) {
                // Process each SQL block
                sqlMatches.forEach((sqlBlock, index) => {
                    const sqlCode = sqlBlock.replace(/```sql\s*|\s*```/gi, '').trim();
                    const sqlDiv = `
                        <div class="agent-sql-block">
                            <div class="sql-header">
                                <i class="fas fa-database"></i>
                                <span>Generated SQL Query ${sqlMatches.length > 1 ? `#${index + 1}` : ''}</span>
                                <button class="copy-sql-btn" data-sql="${this.escapeHtml(sqlCode)}" title="Copy SQL">
                                    <i class="fas fa-copy"></i>
                                </button>
                            </div>
                            <div class="sql-code">
                                <pre><code>${this.highlightSQL(sqlCode)}</code></pre>
                            </div>
                        </div>
                    `;
                    formattedContent = formattedContent.replace(sqlBlock, sqlDiv);
                });
            }
            
            // Format the explanation text (everything outside SQL blocks)
            formattedContent = formattedContent.replace(/\n/g, '<br>');
            
            // Highlight key phrases in explanations
            formattedContent = formattedContent.replace(
                /(This query|The SQL|I've generated|Let me explain|Here's what this does|The result shows)/gi,
                '<strong>$1</strong>'
            );
            
            return formattedContent;
        } else if (role.toLowerCase() === 'tool_result') {
            // Enhanced tool result formatting
            if (content.includes('Query executed successfully')) {
                // Parse result information
                const rowMatch = content.match(/(\d+) rows/);
                const columnMatch = content.match(/(\d+) columns/);
                
                let resultHtml = '<div class="execution-result success">';
                resultHtml += '<div class="result-status"><i class="fas fa-check-circle"></i> Query executed successfully</div>';
                
                if (rowMatch || columnMatch) {
                    resultHtml += '<div class="result-stats">';
                    if (rowMatch) resultHtml += `<span class="stat-item"><i class="fas fa-table"></i> ${rowMatch[1]} rows</span>`;
                    if (columnMatch) resultHtml += `<span class="stat-item"><i class="fas fa-columns"></i> ${columnMatch[1]} columns</span>`;
                    resultHtml += '</div>';
                }
                
                // Show sample data if available
                const sampleMatch = content.match(/Sample results[\s\S]*?(?=\n\n|\n$|$)/);
                if (sampleMatch) {
                    resultHtml += '<div class="sample-data">';
                    resultHtml += '<div class="sample-header">Sample Results:</div>';
                    resultHtml += '<div class="sample-content">' + sampleMatch[0].replace(/\n/g, '<br>') + '</div>';
                    resultHtml += '</div>';
                }
                
                resultHtml += '</div>';
                return resultHtml;
            } else if (content.includes('failed') || content.includes('error')) {
                return `<div class="execution-result error">
                    <div class="result-status"><i class="fas fa-exclamation-circle"></i> Query execution failed</div>
                    <div class="error-details">${content.replace(/\n/g, '<br>')}</div>
                </div>`;
            }
        }
        
        return content.replace(/\n/g, '<br>');
    }

    highlightSQL(sqlCode) {
        // Basic SQL syntax highlighting
        return sqlCode
            .replace(/\b(SELECT|FROM|WHERE|JOIN|INNER|LEFT|RIGHT|OUTER|ON|GROUP BY|ORDER BY|HAVING|LIMIT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|INDEX|TABLE|DATABASE)\b/gi, '<span class="sql-keyword">$1</span>')
            .replace(/\b(AND|OR|NOT|IN|EXISTS|BETWEEN|LIKE|IS|NULL|AS|ASC|DESC|DISTINCT|COUNT|SUM|AVG|MAX|MIN)\b/gi, '<span class="sql-function">$1</span>')
            .replace(/'([^']*?)'/g, '<span class="sql-string">\'$1\'</span>')
            .replace(/--([^\n]*)/g, '<span class="sql-comment">--$1</span>');
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
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
        // Try to get notebook UUID from container first (this is what the API expects)
        const container = document.getElementById('notebook-container');
        if (container && container.dataset.notebookId) {
            return container.dataset.notebookId;
        }
        
        // Try to extract from URL (should be UUID)
        const urlParts = window.location.pathname.split('/');
        const workbenchIndex = urlParts.indexOf('workbench');
        if (workbenchIndex !== -1 && urlParts[workbenchIndex + 1]) {
            const notebookIdFromUrl = urlParts[workbenchIndex + 1];
            return notebookIdFromUrl;
        }
        
        // Try to get from global variables (this might be the database ID - use as fallback)
        if (typeof window.currentNotebookId !== 'undefined' && window.currentNotebookId) {
            return window.currentNotebookId;
        }
        
        console.warn('Could not find notebook ID');
        return null;
    }

    getActiveConnectionId() {
        // Try session storage first (set by Django view)
        const sessionConnectionId = sessionStorage.getItem('db_connection_id');
        if (sessionConnectionId && sessionConnectionId !== 'null' && sessionConnectionId !== '') {
            const id = parseInt(sessionConnectionId);
            if (!isNaN(id)) {
                return id;
            }
        }
        
        // Try global variable
        if (typeof window.activeConnectionId !== 'undefined' && window.activeConnectionId && window.activeConnectionId !== null) {
            const id = parseInt(window.activeConnectionId);
            if (!isNaN(id)) {
                return id;
            }
        }
        
        // Try connection select element
        const connectionSelect = document.querySelector('select[name="connection"], #connectionSelect');
        if (connectionSelect && connectionSelect.value && connectionSelect.value !== '') {
            const id = parseInt(connectionSelect.value);
            if (!isNaN(id)) {
                return id;
            }
        }
        
        // Try local storage
        const localConnectionId = localStorage.getItem('activeConnectionId');
        if (localConnectionId && localConnectionId !== 'null' && localConnectionId !== '') {
            const id = parseInt(localConnectionId);
            if (!isNaN(id)) {
                return id;
            }
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
    
    // Test function for debugging
    testAgentSubmit() {
        const nlInput = document.getElementById('nlQueryInput');
        if (nlInput) {
            nlInput.value = 'show all customers';
        }
        this.handleNlQuerySubmit();
    }
    

}

// Initialize the agent when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    try {
        window.textToSQLAgent = new TextToSQLAgent();
        
        // Add immediate fallback event listener to ensure button works
        const submitButton = document.getElementById('submitNlQuery');
        
        if (submitButton) {
            // Remove any existing listeners and add a direct one
            submitButton.onclick = function(e) {
                e.preventDefault();
                if (window.textToSQLAgent) {
                    window.textToSQLAgent.handleNlQuerySubmit();
                } else {
                    console.error('TextToSQLAgent not available');
                }
            };
        } else {
            console.error('Submit button not found!');
        }
        
    } catch (error) {
        console.error('Error initializing TextToSQLAgent:', error);
    }
});

// Register with app registry if available
if (typeof AppRegistry !== 'undefined') {
    AppRegistry.register('textToSQLAgent', () => window.textToSQLAgent);
} 