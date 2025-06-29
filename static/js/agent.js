/**
 * Schema Reference Manager - Handles @ functionality for schema selection
 */
class SchemaReferenceManager {
    constructor() {
        this.isDropdownOpen = false;
        this.selectedSchemas = new Map(); // schemaName -> schemaData
        this.availableSchemas = [];
        this.cachedSchemas = new Map(); // Cache for schema data
        this.init();
    }

    init() {
        this.setupEventListeners();
        // Don't load schemas immediately - wait for sidebar to be populated
        this.setupSchemaWatchers();
    }

    setupEventListeners() {
        // Reference button click
        document.addEventListener('click', (e) => {
            if (e.target.id === 'schemaReferenceBtn' || e.target.closest('#schemaReferenceBtn')) {
                e.preventDefault();
                this.toggleDropdown();
            }
        });

        // Search input
        document.addEventListener('input', (e) => {
            if (e.target.id === 'schemaSearchInput') {
                this.filterSchemas(e.target.value);
            }
        });

        // Schema selection
        document.addEventListener('click', (e) => {
            if (e.target.closest('.schema-reference-item')) {
                const item = e.target.closest('.schema-reference-item');
                const schemaName = item.dataset.schemaName;
                this.toggleSchemaSelection(schemaName);
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
                const tag = e.target.closest('.schema-reference-tag');
                const schemaName = tag.dataset.schemaName;
                this.deselectSchema(schemaName);
            }
        });

        // Listen for schema panel updates
        document.addEventListener('schemaUpdated', () => {
            this.loadAvailableSchemas();
        });
    }

    setupSchemaWatchers() {
        // Watch for schemas to be loaded in the sidebar
        this.watchForSchemaLoad();
        
        // Also set up mutation observer to detect when schemas are added to DOM
        this.setupSchemaMutationObserver();
        
        // Periodically check for schemas (fallback)
        this.startSchemaPolling();
    }

    watchForSchemaLoad() {
        // Check if schemas are already loaded
        if (this.checkForLoadedSchemas()) {
            this.loadAvailableSchemas();
            return;
        }

        // Listen for common events that indicate schema loading
        const events = ['schemasLoaded', 'sidebarUpdated', 'databaseConnected', 'workbenchReady'];
        events.forEach(eventName => {
            document.addEventListener(eventName, () => {
                setTimeout(() => this.loadAvailableSchemas(), 100);
            });
        });
    }

    setupSchemaMutationObserver() {
        // Watch specifically for changes in the database-schemas container
        const targetElement = document.getElementById('database-schemas');
        
        if (!targetElement) {
            return;
        }

                const observer = new MutationObserver((mutations) => {
            let schemaChanged = false;
            
            mutations.forEach((mutation) => {
                // Check if any added nodes contain schema elements
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        const element = node;
                        if (element.classList.contains('schema') ||
                            element.querySelector('.schema')) {
                            schemaChanged = true;
                        }
                    }
                });
            });

            if (schemaChanged) {
                // Debounce the reload to avoid multiple rapid calls
                clearTimeout(this.schemaReloadTimeout);
                this.schemaReloadTimeout = setTimeout(() => {
                    this.loadAvailableSchemas();
                }, 500);
            }
        });

        observer.observe(targetElement, {
            childList: true,
            subtree: true,
            attributes: false
        });

        this.schemaMutationObserver = observer;
    }

    startSchemaPolling() {
        // Poll for schemas every 2 seconds for the first 30 seconds
        let attempts = 0;
        const maxAttempts = 15;
        
        this.schemaPollingInterval = setInterval(() => {
            attempts++;
            
            if (this.checkForLoadedSchemas()) {
                this.loadAvailableSchemas();
                this.stopSchemaPolling();
            } else if (attempts >= maxAttempts) {
                this.stopSchemaPolling();
                // Try loading anyway in case schemas are there but not detected
                this.loadAvailableSchemas();
            }
        }, 2000);
    }

    stopSchemaPolling() {
        if (this.schemaPollingInterval) {
            clearInterval(this.schemaPollingInterval);
            this.schemaPollingInterval = null;
        }
    }

    checkForLoadedSchemas() {
        // Check if schemas are loaded in the sidebar
        const sidebarContainer = document.getElementById('database-schemas');
        if (!sidebarContainer) {
            return false;
        }
        
        const schemaElements = sidebarContainer.querySelectorAll('.schema');
        const hasSchemaElements = schemaElements.length > 0;
        
        const hasGlobalSchema = typeof window.databaseSchemas !== 'undefined' && 
                               Array.isArray(window.databaseSchemas) && 
                               window.databaseSchemas.length > 0;
        
        return hasSchemaElements || hasGlobalSchema;
    }

    loadAvailableSchemas() {
        this.availableSchemas = [];
        
        // Target only the actual database schemas sidebar section
        const sidebarContainer = document.getElementById('database-schemas');
        if (!sidebarContainer) {
            this.loadSchemasFromGlobalData();
            return;
        }
        
        // Look for schema elements within the sidebar only
        const schemaElements = sidebarContainer.querySelectorAll('.schema');
        
        schemaElements.forEach(schemaElement => {
            const schemaName = this.extractSchemaName(schemaElement);
            if (schemaName) {
                const tables = this.extractTablesFromSchema(schemaElement);
                this.availableSchemas.push({
                    name: schemaName,
                    tables: tables,
                    tableCount: tables.length
                });
            }
        });

        // Fallback: try to extract from global schema data if available
        if (this.availableSchemas.length === 0) {
            this.loadSchemasFromGlobalData();
        }

        this.renderSchemaList();
    }

    extractSchemaName(schemaElement) {
        // Extract schema name from .schema-header span element
        const schemaHeader = schemaElement.querySelector('.schema-header span');
        if (schemaHeader) {
            return schemaHeader.textContent.trim();
        }
        
        // Fallback: try dataset attributes
        if (schemaElement.dataset.schemaName) {
            return schemaElement.dataset.schemaName;
        }
        
        return null;
    }

    extractTablesFromSchema(schemaElement) {
        const tables = [];
        
        // Look for table items within the schema tables container
        const tableElements = schemaElement.querySelectorAll('.schema-tables .table-item');
        
        tableElements.forEach(tableElement => {
            // Get table name from data attribute or span text
            let tableName = tableElement.dataset.tableName;
            
            if (!tableName) {
                // Extract from span element (excluding the icon and row count)
                const tableSpan = tableElement.querySelector('span:not(.row-count)');
                if (tableSpan) {
                    tableName = tableSpan.textContent.trim();
                }
            }
            
            if (tableName && !tables.includes(tableName)) {
                tables.push(tableName);
            }
        });
        
        return tables;
    }

    loadSchemasFromGlobalData() {
        // Extract schemas from global database schema data
        try {
            // Try the schema_explorer.js global variable first
            if (window.databaseSchemas && Array.isArray(window.databaseSchemas)) {
                window.databaseSchemas.forEach(schema => {
                    const tables = schema.tables ? schema.tables.map(table => table.name) : [];
                    this.availableSchemas.push({
                        name: schema.name,
                        tables: tables,
                        tableCount: tables.length
                    });
                });
            }
            // Fallback to other possible global variables
            else if (window.databaseSchema && typeof window.databaseSchema === 'object') {
                Object.keys(window.databaseSchema).forEach(schemaName => {
                    const schema = window.databaseSchema[schemaName];
                    const tables = Object.keys(schema.tables || {});
                    this.availableSchemas.push({
                        name: schemaName,
                        tables: tables,
                        tableCount: tables.length
                    });
                });
            }
        } catch (error) {
            // Silent fallback
        }
    }

    renderSchemaList() {
        const listElement = document.getElementById('schemaReferenceList');
        if (!listElement) return;

        if (this.availableSchemas.length === 0) {
            listElement.innerHTML = '<div class="no-schemas-message">No schemas available</div>';
            return;
        }

        const html = this.availableSchemas.map(schema => {
            const isSelected = this.selectedSchemas.has(schema.name);
            const preview = schema.tables.length > 0 ? 
                `${schema.tableCount} tables: ${schema.tables.slice(0, 3).join(', ')}${schema.tables.length > 3 ? '...' : ''}` : 
                'No tables';

            return `
                <div class="schema-reference-item ${isSelected ? 'selected' : ''}" data-schema-name="${schema.name}">
                    <div class="schema-name-ref">
                        <i class="fas fa-database"></i>
                        ${schema.name}
                    </div>
                    <div class="schema-preview">${preview}</div>
                </div>
            `;
        }).join('');

        listElement.innerHTML = html;
    }

    filterSchemas(searchTerm) {
        const filteredSchemas = this.availableSchemas.filter(schema => {
            const searchLower = searchTerm.toLowerCase();
            return schema.name.toLowerCase().includes(searchLower) ||
                   schema.tables.some(table => table.toLowerCase().includes(searchLower));
        });

        const listElement = document.getElementById('schemaReferenceList');
        if (!listElement) return;

        if (filteredSchemas.length === 0) {
            listElement.innerHTML = '<div class="no-schemas-message">No schemas match your search</div>';
            return;
        }

        const html = filteredSchemas.map(schema => {
            const isSelected = this.selectedSchemas.has(schema.name);
            const preview = schema.tables.length > 0 ? 
                `${schema.tableCount} tables: ${schema.tables.slice(0, 3).join(', ')}${schema.tables.length > 3 ? '...' : ''}` : 
                'No tables';

            return `
                <div class="schema-reference-item ${isSelected ? 'selected' : ''}" data-schema-name="${schema.name}">
                    <div class="schema-name-ref">
                        <i class="fas fa-database"></i>
                        ${schema.name}
                    </div>
                    <div class="schema-preview">${preview}</div>
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
        const dropdown = document.getElementById('schemaReferenceDropdown');
        const button = document.getElementById('schemaReferenceBtn');
        
        if (dropdown && button) {
            // Always refresh schemas when opening dropdown in case they've been loaded
            this.loadAvailableSchemas();
            
            dropdown.style.display = 'block';
            button.classList.add('active');
            this.isDropdownOpen = true;
            
            // Focus search input
            const searchInput = document.getElementById('schemaSearchInput');
            if (searchInput) {
                setTimeout(() => searchInput.focus(), 100);
            }
        }
    }

    closeDropdown() {
        const dropdown = document.getElementById('schemaReferenceDropdown');
        const button = document.getElementById('schemaReferenceBtn');
        
        if (dropdown && button) {
            dropdown.style.display = 'none';
            button.classList.remove('active');
            this.isDropdownOpen = false;
            
            // Clear search
            const searchInput = document.getElementById('schemaSearchInput');
            if (searchInput) {
                searchInput.value = '';
            }
        }
    }

    toggleSchemaSelection(schemaName) {
        if (this.selectedSchemas.has(schemaName)) {
            this.deselectSchema(schemaName);
        } else {
            this.selectSchema(schemaName);
        }
    }

    selectSchema(schemaName) {
        const schema = this.availableSchemas.find(s => s.name === schemaName);
        if (schema) {
            this.selectedSchemas.set(schemaName, schema);
            this.renderSelectedSchemas();
            this.renderSchemaList(); // Update selection state in dropdown
        }
    }

    deselectSchema(schemaName) {
        this.selectedSchemas.delete(schemaName);
        this.renderSelectedSchemas();
        this.renderSchemaList(); // Update selection state in dropdown
    }

    renderSelectedSchemas() {
        const container = document.querySelector('.nl-input-container');
        if (!container) return;

        // Remove existing tags
        const existingTags = container.querySelector('.schema-reference-tags');
        if (existingTags) {
            existingTags.remove();
        }

        if (this.selectedSchemas.size === 0) return;

        // Create tags container
        const tagsContainer = document.createElement('div');
        tagsContainer.className = 'schema-reference-tags';

        this.selectedSchemas.forEach(schema => {
            const tag = document.createElement('div');
            tag.className = 'schema-reference-tag';
            tag.dataset.schemaName = schema.name;
            tag.innerHTML = `
                <span><i class="fas fa-database"></i> ${schema.name} (${schema.tableCount} tables)</span>
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

    getSelectedSchemasData() {
        const schemasData = [];
        this.selectedSchemas.forEach(schema => {
            schemasData.push({
                name: schema.name,
                tables: schema.tables,
                tableCount: schema.tableCount
            });
        });
        return schemasData;
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

    clearSelectedSchemas() {
        this.selectedSchemas.clear();
        this.renderSelectedSchemas();
        this.renderSchemaList();
    }

    getSelectedSchemasForAgent() {
        const schemasData = [];
        this.selectedSchemas.forEach(schema => {
            const schemaInfo = {
                name: schema.name,
                tables: schema.tables,
                tableCount: schema.tableCount
            };
            schemasData.push(schemaInfo);
        });
        return schemasData;
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
        this.schemaReferenceManager = new SchemaReferenceManager();
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
            // Get selected schemas for context
            const selectedSchemas = this.schemaReferenceManager.getSelectedSchemasForAgent();
            
            // Clear input
            nlInput.value = '';
            
            // Add user message to conversation immediately
            let displayQuery = query;
            if (selectedSchemas.length > 0) {
                displayQuery += ` (focusing on ${selectedSchemas.length} schema${selectedSchemas.length > 1 ? 's' : ''})`;
            }
            this.addMessageToConversation('user', displayQuery);
            
            // Prepare request data
            const requestData = {
                query: query,
                connection_id: activeConnectionId,
                notebook_id: currentNotebookId,
                conversation_id: this.currentConversationId,
                selected_schemas: selectedSchemas
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
                
                // If there's a final_sql despite the error (e.g., due to timeout), use it
                if (result.final_sql && result.final_sql.trim()) {
                    console.log('Using final_sql despite error:', result.final_sql.substring(0, 50) + '...');
                    await this.updateCellContent(cellId, result.final_sql);
                    this.showWarning(`SQL generated but with timeout/warning: ${result.error}`);
                    
                    // Execute the cell to show results
                    setTimeout(() => {
                        if (typeof executeCell === 'function') {
                            executeCell(cellId);
                        } else {
                            this.executeCellAndGetResults(cellId).then(executionResult => {
                                if (executionResult.success) {
                                    this.showSuccessStatus(`SQL executed successfully despite timeout. Returned ${executionResult.rowCount} rows.`);
                                }
                            });
                        }
                    }, 500);
                } else {
                    // No SQL to fall back to, show error
                    this.updateCellContent(cellId, `-- Error: ${result.error}`, 'Error');
                    this.showError(result.error || 'Agent request failed');
                }
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