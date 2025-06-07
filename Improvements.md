# Cell Reference and Multi-Step Workflow Implementation Plan

## Overview

This document outlines a phased approach to implement cell referencing and multi-step workflow capabilities in the existing notebook system without disrupting current functionality.

## Current Architecture Analysis

### **Existing Components:**
- **SQLCell Model**: Stores query, results, execution state
- **Notebook UI**: Cell management, execution, display
- **Agent System**: Natural language to SQL conversion
- **Cell Reference Manager**: Already handles @ mentions (frontend only)

### **Current Limitations:**
- Cells execute independently
- Agent has no access to previous cell results
- No concept of data flow between cells
- Results are stored but not accessible for reuse

## Phase 1: Enhanced Cell Result Storage & Access

### **1.1 Backend Model Enhancements**

#### **SQLCell Model Extensions:**
```python
# In core/models.py

class SQLCell(models.Model):
    # ... existing fields ...
    
    # New fields for result management
    result_schema = models.JSONField(null=True, blank=True)  # Column info
    result_summary = models.JSONField(null=True, blank=True)  # Row count, data types
    referenced_by = models.ManyToManyField('self', blank=True, symmetrical=False, related_name='references')
    execution_order = models.IntegerField(default=0)  # For dependency tracking
    last_executed = models.DateTimeField(null=True, blank=True)
    
    def get_result_preview(self, max_rows=5):
        """Get a preview of results for agent context"""
        if not self.result or not self.is_executed:
            return None
            
        result_data = self.result
        if isinstance(result_data, dict) and 'rows' in result_data:
            rows = result_data['rows'][:max_rows]
            return {
                'cell_id': self.id,
                'cell_name': self.name,
                'columns': result_data.get('columns', []),
                'sample_rows': rows,
                'total_rows': len(result_data['rows']),
                'last_executed': self.last_executed.isoformat() if self.last_executed else None
            }
        return None
    
    def get_result_metadata(self):
        """Get metadata about results for dependency tracking"""
        if not self.result or not self.is_executed:
            return None
            
        return {
            'has_results': True,
            'row_count': len(self.result.get('rows', [])) if isinstance(self.result, dict) else 0,
            'columns': self.result.get('columns', []) if isinstance(self.result, dict) else [],
            'execution_time': self.last_executed.isoformat() if self.last_executed else None
        }
```

#### **New Result Access API:**
```python
# In core/views.py

@login_required
def api_get_cell_results(request, notebook_uuid, cell_id):
    """API to get cell results for referencing"""
    try:
        notebook = get_object_or_404(SQLNotebook, uuid=notebook_uuid, user=request.user)
        cell = get_object_or_404(SQLCell, id=cell_id, notebook=notebook)
        
        if not cell.is_executed or not cell.result:
            return JsonResponse({
                'success': False,
                'error': 'Cell has not been executed or has no results'
            })
        
        # Return different levels of detail based on request
        detail_level = request.GET.get('detail', 'preview')  # preview, full, metadata
        
        if detail_level == 'metadata':
            data = cell.get_result_metadata()
        elif detail_level == 'full':
            data = cell.result
        else:  # preview
            data = cell.get_result_preview()
            
        return JsonResponse({
            'success': True,
            'cell_id': cell.id,
            'cell_name': cell.name,
            'data': data
        })
        
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=500)

@login_required  
def api_get_notebook_cell_summaries(request, notebook_uuid):
    """Get summaries of all executed cells for referencing"""
    try:
        notebook = get_object_or_404(SQLNotebook, uuid=notebook_uuid, user=request.user)
        
        cells = notebook.cells.filter(
            is_executed=True,
            result__isnull=False
        ).order_by('order')
        
        summaries = []
        for cell in cells:
            metadata = cell.get_result_metadata()
            if metadata:
                summaries.append({
                    'id': cell.id,
                    'name': cell.name,
                    'order': cell.order,
                    'query_preview': cell.query[:100] + '...' if len(cell.query) > 100 else cell.query,
                    **metadata
                })
        
        return JsonResponse({
            'success': True,
            'cells': summaries
        })
        
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=500)
```

### **1.2 Frontend Cell Reference Enhancements**

#### **Enhanced Cell Reference Manager:**
```javascript
// In static/js/agent.js - Enhanced CellReferenceManager

class CellReferenceManager {
    constructor() {
        // ... existing code ...
        this.cellResults = new Map(); // Cache cell results
        this.resultsPreviews = new Map(); // Cache result previews
    }
    
    async loadCellResults(cellId) {
        """Load full results for a specific cell"""
        try {
            const notebookUuid = this.getNotebookUuid();
            const response = await fetch(`/api/notebooks/${notebookUuid}/cells/${cellId}/results/?detail=preview`);
            const result = await response.json();
            
            if (result.success) {
                this.resultsPreviews.set(cellId, result.data);
                return result.data;
            }
        } catch (error) {
            console.error('Error loading cell results:', error);
        }
        return null;
    }
    
    async getAvailableCellsWithResults() {
        """Get all cells that have been executed and have results"""
        try {
            const notebookUuid = this.getNotebookUuid();
            const response = await fetch(`/api/notebooks/${notebookUuid}/cell-summaries/`);
            const result = await response.json();
            
            if (result.success) {
                return result.cells;
            }
        } catch (error) {
            console.error('Error loading cell summaries:', error);
        }
        return [];
    }
    
    renderCellListWithResults() {
        """Enhanced cell list showing result information"""
        const listElement = document.getElementById('cellReferenceList');
        if (!listElement) return;

        this.getAvailableCellsWithResults().then(cellsWithResults => {
            if (cellsWithResults.length === 0) {
                listElement.innerHTML = '<div class="no-cells-message">No executed cells available for reference</div>';
                return;
            }

            const html = cellsWithResults.map(cell => {
                const isSelected = this.selectedCells.has(cell.id);
                
                return `
                    <div class="cell-reference-item ${isSelected ? 'selected' : ''}" data-cell-id="${cell.id}">
                        <div class="cell-name-ref">
                            <span class="cell-order-ref">[${cell.order}]</span>
                            ${cell.name}
                            <span class="result-indicator">📊 ${cell.row_count} rows</span>
                        </div>
                        <div class="cell-preview">${cell.query_preview}</div>
                        <div class="result-preview">
                            Columns: ${cell.columns.slice(0, 3).join(', ')}${cell.columns.length > 3 ? '...' : ''}
                        </div>
                    </div>
                `;
            }).join('');

            listElement.innerHTML = html;
        });
    }
    
    getReferencedCellsContext() {
        """Get referenced cells data for agent context"""
        if (this.selectedCells.size === 0) return '';

        let contextText = '\n\n--- REFERENCED CELL RESULTS ---\n';
        
        this.selectedCells.forEach(cell => {
            const preview = this.resultsPreviews.get(cell.id);
            if (preview) {
                contextText += `\n[${cell.order}] ${cell.name} (${preview.total_rows} rows):\n`;
                contextText += `Columns: ${preview.columns.join(', ')}\n`;
                if (preview.sample_rows && preview.sample_rows.length > 0) {
                    contextText += `Sample data:\n`;
                    preview.sample_rows.slice(0, 3).forEach((row, idx) => {
                        contextText += `  Row ${idx + 1}: ${JSON.stringify(row)}\n`;
                    });
                }
                contextText += '\n';
            }
        });
        
        contextText += '--- END REFERENCED CELL RESULTS ---\n';
        return contextText;
    }
}
```

### **1.3 Agent Integration for Cell References**

#### **Enhanced Agent Request Data:**
```javascript
// In static/js/agent.js - TextToSQLAgent class

async handleNlQuerySubmit() {
    // ... existing code ...
    
    // Get referenced cell context
    const referencedCellsContext = this.cellReferenceManager.getReferencedCellsContext();
    
    // Prepare request data with cell references
    const requestData = {
        query: query,
        connection_id: activeConnectionId,
        notebook_id: currentNotebookId,
        conversation_id: this.currentConversationId,
        referenced_cells: this.cellReferenceManager.getSelectedCellsData(), // New field
        cell_context: referencedCellsContext, // New field for agent prompt
        workflow_context: workflowManager ? workflowManager.getCurrentStepContext() : null // New field
    };
    
    // ... rest of existing code ...
}
```

#### **Backend Agent Enhancement:**
```python
# In mcp_agent/views.py

@login_required
@require_http_methods(["POST"])
def text_to_sql_agent_view(request):
    // ... existing code ...
    
    // Get referenced cells data
    referenced_cells_data = data.get('referenced_cells', [])
    cell_context = data.get('cell_context', '')
    
    // Enhanced agent state with cell references
    agent_state = AgentState(
        messages=message_history,
        current_sql_query=None,
        database_schema=database_schema,
        user_nl_query=user_nl_query,
        referenced_cells=referenced_cells_data,  // New field
        cell_context=cell_context,  // New field
        max_iterations=5,
        current_iteration=0,
        active_connection_id=connection_id,
        current_notebook_id=notebook_id,
        user_object=request.user,
        final_sql=None,
        should_continue=True,
        error_message=None
    )
    
    // ... rest of existing code ...
```

#### **Enhanced Agent System Prompt:**
```python
# In mcp_agent/agent_logic.py

def get_system_prompt(database_schema: str, user_nl_query: str, connection_type: str, 
                     iteration: int = 0, cell_context: str = "", workflow_context: dict = None):
    """Enhanced system prompt with cell reference and workflow context"""
    
    base_prompt = f"""You are an expert SQL generation assistant with access to previous cell results.

**Database Type:** {connection_type.upper()}

**Database Schema:**
{database_schema}

**User's Request:**
{user_nl_query}

{cell_context if cell_context else ""}

**Current Iteration:** {iteration}

{db_specific_instructions}

**Cell Reference Guidelines:**
- When user refers to previous results, use the referenced cell data as context
- You can build upon previous queries and results
- Reference columns and patterns from previous cells when relevant
- For multi-step analysis, explain how current query builds on previous results

**Your Workflow:**
1. Analyze the user's request and any referenced cell results
2. Consider how to build upon or relate to previous analysis
3. Generate SQL queries that work with the current database schema
4. When referencing previous results, explain the connection
5. Use appropriate {connection_type.upper()}-specific syntax

[... rest of existing prompt ...]
"""
    
    # Add cell reference context
    if cell_context:
        base_prompt += f"""

**REFERENCED CELL RESULTS:**
{cell_context}

**Cell Reference Guidelines:**
- Use the referenced cell data to inform your SQL generation
- Build upon previous analyses when relevant
- Reference columns and patterns from previous cells
- Explain how current query relates to previous results
"""

    # Add workflow context
    if workflow_context:
        base_prompt += f"""

**WORKFLOW CONTEXT:**
- Current Step: {workflow_context.get('step_name', 'N/A')}
- Step Type: {workflow_context.get('step_type', 'N/A')}
- Workflow Goal: {workflow_context.get('workflow_goal', 'Multi-step analysis')}
- Previous Steps: {len(workflow_context.get('completed_steps', []))} completed

**Workflow Guidelines:**
- This query is part of a structured analysis workflow
- Ensure this step builds logically on previous steps
- Provide insights that will be useful for subsequent steps
- If this is a summary step, synthesize findings from previous analyses
"""
    
    return base_prompt
```

## Phase 2: Multi-Step Workflow Management

### **2.1 Workflow Concept & UI**

#### **Workflow State Management:**
```javascript
// In static/js/workflow.js (new file)

class WorkflowManager {
    constructor() {
        this.currentWorkflow = null;
        this.workflowSteps = [];
        this.stepDependencies = new Map();
        this.init();
    }
    
    init() {
        this.createWorkflowUI();
        this.setupEventListeners();
    }
    
    createWorkflowUI() {
        // Add workflow control panel to notebook
        const workflowPanel = document.createElement('div');
        workflowPanel.className = 'workflow-panel';
        workflowPanel.innerHTML = `
            <div class="workflow-header">
                <h4>Analysis Workflow</h4>
                <div class="workflow-controls">
                    <button id="start-workflow" class="btn btn-primary">Start Workflow</button>
                    <button id="save-workflow" class="btn btn-secondary">Save Workflow</button>
                    <select id="workflow-templates">
                        <option value="">Select Template</option>
                        <option value="data-exploration">Data Exploration</option>
                        <option value="customer-analysis">Customer Analysis</option>
                        <option value="sales-funnel">Sales Funnel</option>
                    </select>
                </div>
            </div>
            <div class="workflow-steps" id="workflow-steps">
                <!-- Workflow steps will be populated here -->
            </div>
        `;
        
        // Insert after notebook header
        const notebookContainer = document.getElementById('notebook-container');
        const notebookHeader = notebookContainer.querySelector('.notebook-header');
        notebookContainer.insertBefore(workflowPanel, notebookHeader.nextSibling);
    }
    
    startWorkflow(template = null) {
        this.currentWorkflow = {
            id: Date.now(),
            name: template || 'Custom Analysis',
            steps: [],
            started: new Date(),
            status: 'active'
        };
        
        if (template) {
            this.loadWorkflowTemplate(template);
        }
        
        this.renderWorkflowSteps();
    }
    
    loadWorkflowTemplate(templateName) {
        const templates = {
            'data-exploration': [
                { name: 'Data Overview', prompt: 'Show me the structure and size of all tables' },
                { name: 'Sample Data', prompt: 'Show me sample data from the main tables' },
                { name: 'Data Quality', prompt: 'Check for missing values and data quality issues' },
                { name: 'Key Metrics', prompt: 'Calculate key business metrics' }
            ],
            'customer-analysis': [
                { name: 'Customer Count', prompt: 'How many customers do we have?' },
                { name: 'Customer Segments', prompt: 'Segment customers by behavior' },
                { name: 'Top Customers', prompt: 'Who are our top customers by value?' },
                { name: 'Customer Trends', prompt: 'Show customer acquisition trends over time' }
            ],
            'sales-funnel': [
                { name: 'Lead Generation', prompt: 'Show lead generation metrics' },
                { name: 'Conversion Rates', prompt: 'Calculate conversion rates at each stage' },
                { name: 'Revenue Analysis', prompt: 'Analyze revenue by source and time' },
                { name: 'Performance Summary', prompt: 'Summarize overall funnel performance' }
            ]
        };
        
        this.currentWorkflow.steps = templates[templateName] || [];
    }
    
    renderWorkflowSteps() {
        const stepsContainer = document.getElementById('workflow-steps');
        if (!this.currentWorkflow) {
            stepsContainer.innerHTML = '<p>No active workflow</p>';
            return;
        }
        
        const html = this.currentWorkflow.steps.map((step, index) => `
            <div class="workflow-step ${step.status || 'pending'}" data-step="${index}">
                <div class="step-header">
                    <span class="step-number">${index + 1}</span>
                    <span class="step-name">${step.name}</span>
                    <span class="step-status">${step.status || 'pending'}</span>
                </div>
                <div class="step-content">
                    <p class="step-prompt">${step.prompt}</p>
                    ${step.cellId ? `<p class="step-cell">Cell: ${step.cellId}</p>` : ''}
                </div>
                <div class="step-actions">
                    <button class="execute-step" onclick="workflowManager.executeStep(${index})">
                        Execute Step
                    </button>
                </div>
            </div>
        `).join('');
        
        stepsContainer.innerHTML = html;
    }
    
    async executeStep(stepIndex) {
        const step = this.currentWorkflow.steps[stepIndex];
        step.status = 'executing';
        this.renderWorkflowSteps();
        
        // Auto-populate the agent input with the step prompt
        const nlInput = document.getElementById('nlQueryInput');
        if (nlInput) {
            nlInput.value = step.prompt;
            
            // Trigger agent execution
            if (window.textToSQLAgent) {
                await window.textToSQLAgent.handleNlQuerySubmit();
                
                // Update step status
                step.status = 'completed';
                step.executedAt = new Date();
                
                // Get the created cell ID (you'd need to track this)
                step.cellId = this.getLastCreatedCellId();
                
                this.renderWorkflowSteps();
            }
        }
    }
    
    getLastCreatedCellId() {
        // Get the most recently created cell
        const cells = document.querySelectorAll('.sql-cell');
        if (cells.length > 0) {
            const lastCell = cells[cells.length - 1];
            return lastCell.dataset.cellId;
        }
        return null;
    }
}

// Initialize workflow manager
let workflowManager;
document.addEventListener('DOMContentLoaded', function() {
    workflowManager = new WorkflowManager();
});
```

### **2.2 Workflow Templates & Guided Analysis**

#### **Template Management:**
```python
# In core/models.py

class WorkflowTemplate(models.Model):
    name = models.CharField(max_length=255)
    description = models.TextField()
    category = models.CharField(max_length=100)  # data-exploration, business-analysis, etc.
    steps = models.JSONField()  # Array of step definitions
    created_by = models.ForeignKey(User, on_delete=models.CASCADE)
    is_public = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    
    def get_steps(self):
        return self.steps or []

class NotebookWorkflow(models.Model):
    notebook = models.ForeignKey(SQLNotebook, on_delete=models.CASCADE, related_name='workflows')
    template = models.ForeignKey(WorkflowTemplate, on_delete=models.SET_NULL, null=True, blank=True)
    name = models.CharField(max_length=255)
    current_step = models.IntegerField(default=0)
    status = models.CharField(max_length=50, default='active')  # active, completed, paused
    step_results = models.JSONField(default=dict)  # Track results of each step
    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)
```

#### **Guided Analysis Prompts:**
```python
# In mcp_agent/agent_logic.py

def get_workflow_enhanced_prompt(base_prompt: str, workflow_context: dict = None):
    """Enhance prompt with workflow context"""
    
    if not workflow_context:
        return base_prompt
    
    workflow_addition = f"""

**WORKFLOW CONTEXT:**
- Current Step: {workflow_context.get('current_step', 'N/A')}
- Step Name: {workflow_context.get('step_name', 'N/A')}
- Previous Steps: {len(workflow_context.get('completed_steps', []))} completed
- Workflow Goal: {workflow_context.get('workflow_goal', 'Multi-step analysis')}

**WORKFLOW GUIDANCE:**
- This query is part of a larger analysis workflow
- Build upon insights from previous steps when relevant
- Consider how this step connects to the overall analysis goal
- Provide clear, actionable insights that can inform next steps
- If this is a summary step, synthesize findings from previous analyses

"""
    
    return base_prompt + workflow_addition
```

## Phase 3: Advanced Features

### **3.1 Dependency Tracking & Auto-Execution**

#### **Cell Dependency Graph:**
```javascript
// In static/js/dependency-tracker.js (new file)

class DependencyTracker {
    constructor() {
        this.dependencies = new Map(); // cellId -> [dependent cellIds]
        this.reverseDependencies = new Map(); // cellId -> [dependency cellIds]
    }
    
    addDependency(fromCellId, toCellId) {
        if (!this.dependencies.has(fromCellId)) {
            this.dependencies.set(fromCellId, []);
        }
        this.dependencies.get(fromCellId).push(toCellId);
        
        if (!this.reverseDependencies.has(toCellId)) {
            this.reverseDependencies.set(toCellId, []);
        }
        this.reverseDependencies.get(toCellId).push(fromCellId);
    }
    
    getCellDependencies(cellId) {
        return this.reverseDependencies.get(cellId) || [];
    }
    
    getCellDependents(cellId) {
        return this.dependencies.get(cellId) || [];
    }
    
    async reExecuteDependentCells(cellId) {
        const dependents = this.getCellDependents(cellId);
        
        for (const dependentId of dependents) {
            // Re-execute dependent cell
            if (typeof executeCell === 'function') {
                await executeCell(dependentId);
            }
            
            // Recursively update dependents
            await this.reExecuteDependentCells(dependentId);
        }
    }
    
    visualizeDependencies() {
        // Create a visual representation of cell dependencies
        const dependencyGraph = document.createElement('div');
        dependencyGraph.className = 'dependency-graph';
        
        // Implementation would create a visual graph
        // Could use D3.js or similar library
    }
}
```

### **3.2 Result Caching & Performance**

#### **Smart Result Caching:**
```python
# In core/models.py

class CellResultCache(models.Model):
    cell = models.OneToOneField(SQLCell, on_delete=models.CASCADE, related_name='cache')
    result_hash = models.CharField(max_length=64)  # Hash of query + connection
    cached_result = models.JSONField()
    cached_at = models.DateTimeField(auto_now_add=True)
    access_count = models.IntegerField(default=0)
    last_accessed = models.DateTimeField(auto_now=True)
    
    @classmethod
    def get_cached_result(cls, cell):
        try:
            cache_entry = cls.objects.get(cell=cell)
            cache_entry.access_count += 1
            cache_entry.save()
            return cache_entry.cached_result
        except cls.DoesNotExist:
            return None
    
    @classmethod
    def cache_result(cls, cell, result):
        import hashlib
        
        # Create hash from query and connection
        content = f"{cell.query}:{cell.notebook.connection.id}"
        result_hash = hashlib.sha256(content.encode()).hexdigest()
        
        cls.objects.update_or_create(
            cell=cell,
            defaults={
                'result_hash': result_hash,
                'cached_result': result,
                'access_count': 1
            }
        )
```

## Phase 4: UI/UX Enhancements

### **4.1 Visual Workflow Designer**

#### **Drag & Drop Workflow Builder:**
```html
<!-- In templates/workbench.html -->
<div class="workflow-designer" id="workflow-designer" style="display: none;">
    <div class="workflow-canvas">
        <div class="workflow-toolbox">
            <h4>Analysis Steps</h4>
            <div class="step-templates">
                <div class="step-template" data-type="data-overview">Data Overview</div>
                <div class="step-template" data-type="filter">Filter Data</div>
                <div class="step-template" data-type="aggregate">Aggregate</div>
                <div class="step-template" data-type="join">Join Tables</div>
                <div class="step-template" data-type="visualize">Visualize</div>
            </div>
        </div>
        <div class="workflow-canvas-area">
            <!-- Steps will be dropped here -->
        </div>
    </div>
</div>
```

### **4.2 Enhanced Cell UI**

#### **Cell Reference Indicators:**
```css
/* In static/css/workflow.css (new file) */

.cell-with-references {
    border-left: 3px solid #007bff;
    position: relative;
}

.cell-reference-indicator {
    position: absolute;
    top: 5px;
    right: 5px;
    background: #007bff;
    color: white;
    border-radius: 12px;
    padding: 2px 8px;
    font-size: 12px;
}

.dependency-arrow {
    position: absolute;
    width: 2px;
    background: #007bff;
    z-index: 10;
}

.workflow-step {
    border: 1px solid #ddd;
    border-radius: 8px;
    margin: 10px 0;
    padding: 15px;
    background: #f8f9fa;
}

.workflow-step.executing {
    background: #fff3cd;
    border-color: #ffeaa7;
}

.workflow-step.completed {
    background: #d4edda;
    border-color: #c3e6cb;
}

.workflow-step.error {
    background: #f8d7da;
    border-color: #f5c6cb;
}
```

## Implementation Strategy

### **Phase 1 Implementation (Weeks 1-2):**
1. ✅ Backend model extensions for result storage
2. ✅ API endpoints for cell result access
3. ✅ Enhanced Cell Reference Manager
4. ✅ Basic agent integration with cell context

### **Phase 2 Implementation (Weeks 3-4):**
1. ✅ Workflow UI components
2. ✅ Workflow templates system
3. ✅ Guided analysis integration
4. ✅ Step execution automation

### **Phase 3 Implementation (Weeks 5-6):**
1. ✅ Dependency tracking system
2. ✅ Auto-execution of dependent cells
3. ✅ Result caching optimization
4. ✅ Performance monitoring

### **Phase 4 Implementation (Weeks 7-8):**
1. ✅ Visual workflow designer
2. ✅ Enhanced cell UI with indicators
3. ✅ Advanced workflow features
4. ✅ User testing and refinement

## Risk Mitigation

### **Backward Compatibility:**
- All new features are additive, not replacing existing functionality
- Existing cell execution continues to work unchanged
- Agent behavior without references remains identical
- Database migrations are non-destructive

### **Performance Considerations:**
- Result caching prevents repeated expensive queries
- Lazy loading of cell results
- Configurable limits on result set sizes
- Optional dependency tracking (can be disabled)

### **Error Handling:**
- Graceful degradation when referenced cells are unavailable
- Clear error messages for dependency failures
- Automatic retry mechanisms for transient failures
- Rollback capabilities for workflow failures

This plan provides a comprehensive roadmap for implementing advanced cell referencing and multi-step workflow capabilities while maintaining the robustness and simplicity of your existing notebook system. 