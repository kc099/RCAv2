/**
 * Knowledge Graph Visualization for Database Schema
 */

// Global variables
let knowledgeGraphNetwork = null;
let knowledgeGraphData = null;
let notebookUUID = null;

/**
 * Initialize the knowledge graph visualization
 */
function initKnowledgeGraph() {
    console.log('Initializing knowledge graph...');
    
    // Get notebook ID
    notebookUUID = getNotebookUUID();
    
    console.log('Knowledge graph notebook UUID:', notebookUUID);
    console.log('Current URL:', window.location.pathname);
    
    if (!notebookUUID) {
        console.error('Cannot determine notebook ID for knowledge graph');
        showGraphError("Cannot determine notebook ID");
        return;
    }
    
    // Get container element
    const container = document.getElementById('knowledge-graph-network');
    if (!container) {
        console.error("Knowledge graph container not found");
        return;
    }
    
    console.log('Knowledge graph container found, proceeding with initialization');
    
    // Create loading indicator
    showLoadingIndicator();
    
    // Check if there's an existing graph
    fetchExistingGraph();
    
    // Add generate graph button event listener
    const generateBtn = document.getElementById('generate-knowledge-graph');
    if (generateBtn) {
        generateBtn.addEventListener('click', generateNewGraph);
    }
}

/**
 * Show loading indicator
 */
function showLoadingIndicator() {
    const container = document.getElementById('knowledge-graph-network');
    if (container) {
        container.innerHTML = `
            <div class="knowledge-graph-loading">
                <div class="spinner"></div>
                <p>Loading knowledge graph...</p>
            </div>
        `;
    }
}

/**
 * Show error message
 */
function showGraphError(message) {
    const container = document.getElementById('knowledge-graph-network');
    if (container) {
        container.innerHTML = `
            <div class="knowledge-graph-error">
                <i class="fas fa-exclamation-triangle"></i>
                <p>${message}</p>
            </div>
        `;
    }
    
    // Enable generate button
    const generateBtn = document.getElementById('generate-knowledge-graph');
    if (generateBtn) {
        generateBtn.disabled = false;
    }
}

/**
 * Fetch existing knowledge graph
 */
function fetchExistingGraph() {
    fetch(`/api/notebooks/${notebookUUID}/knowledge-graph/`, {
        method: 'GET',
        headers: {
            'X-CSRFToken': getCsrfToken(),
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            // Parse graph data if it's a string
            let graphData = data.graph_data;
            if (typeof graphData === 'string') {
                graphData = JSON.parse(graphData);
            }
            
            // Render the graph
            renderKnowledgeGraph(graphData);
            
            // Update stats
            updateGraphStats(graphData.stats);
            
            // Render legend
            renderGraphLegend(graphData.legend);
            
            // Show success message with timestamp
            const timestamp = new Date(data.created_at).toLocaleString();
            showGraphMessage(`Knowledge graph loaded. Last generated: ${timestamp}`);
        } else {
            // No existing graph, show placeholder
            showGraphPlaceholder();
        }
    })
    .catch(error => {
        console.error('Error fetching knowledge graph:', error);
        showGraphPlaceholder();
    });
}

/**
 * Show graph placeholder for first-time users
 */
function showGraphPlaceholder() {
    const container = document.getElementById('knowledge-graph-network');
    if (container) {
        container.innerHTML = `
            <div class="knowledge-graph-placeholder">
                <i class="fas fa-project-diagram"></i>
                <h3>No Knowledge Graph Available</h3>
                <p>Generate a knowledge graph to visualize your database schema and relationships.</p>
                <p>The graph will show tables, columns, and detect potential relationships between tables.</p>
            </div>
        `;
    }
    
    // Enable generate button
    const generateBtn = document.getElementById('generate-knowledge-graph');
    if (generateBtn) {
        generateBtn.disabled = false;
    }
}

/**
 * Generate a new knowledge graph
 */
function generateNewGraph() {
    // Disable generate button
    const generateBtn = document.getElementById('generate-knowledge-graph');
    if (generateBtn) {
        generateBtn.disabled = true;
    }
    
    // Show loading indicator
    showLoadingIndicator();
    
    // Call API to generate new graph
    fetch(`/api/notebooks/${notebookUUID}/knowledge-graph/generate/`, {
        method: 'POST',
        headers: {
            'X-CSRFToken': getCsrfToken(),
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            // Render the graph
            renderKnowledgeGraph(data.graph_data);
            
            // Update stats
            updateGraphStats(data.graph_data.stats);
            
            // Render legend
            renderGraphLegend(data.graph_data.legend);
            
            // Show success message
            showGraphMessage('Knowledge graph generated successfully.');
        } else {
            showGraphError(data.error || 'Failed to generate knowledge graph');
        }
    })
    .catch(error => {
        console.error('Error generating knowledge graph:', error);
        showGraphError('Error generating knowledge graph. Please try again.');
    })
    .finally(() => {
        // Re-enable generate button
        const generateBtn = document.getElementById('generate-knowledge-graph');
        if (generateBtn) {
            generateBtn.disabled = false;
        }
    });
}

/**
 * Render knowledge graph visualization
 */
function renderKnowledgeGraph(graphData) {
    // Store graph data globally
    knowledgeGraphData = graphData;
    
    // Get container element
    const container = document.getElementById('knowledge-graph-network');
    if (!container) return;
    
    // Clear container
    container.innerHTML = '';
    
    // Create dataset for vis.js
    const nodes = new vis.DataSet(graphData.nodes);
    const edges = new vis.DataSet(graphData.edges);
    
    // Create vis.js network
    const data = { nodes, edges };
    
    // Network options
    const options = {
        layout: {
            hierarchical: {
                direction: 'UD',
                sortMethod: 'directed',
                nodeSpacing: 150,
                levelSeparation: 150
            }
        },
        physics: {
            hierarchicalRepulsion: {
                nodeDistance: 120,
                centralGravity: 0.0,
                springLength: 100,
                springConstant: 0.01,
                damping: 0.09
            },
            solver: 'hierarchicalRepulsion'
        },
        interaction: {
            navigationButtons: true,
            keyboard: true,
            multiselect: true,
            hover: true
        },
        nodes: {
            font: {
                size: 12,
                face: 'Roboto',
                color: '#333'
            },
            margin: 10
        },
        edges: {
            smooth: {
                type: 'cubicBezier',
                forceDirection: 'vertical',
                roundness: 0.4
            },
            font: {
                size: 10,
                align: 'middle'
            }
        },
        groups: {
            table: {
                shape: 'box',
                color: {
                    background: '#f8f8f8',
                    border: '#666'
                }
            },
            column: {
                shape: 'ellipse'
            }
        }
    };
    
    // Draw network
    knowledgeGraphNetwork = new vis.Network(container, data, options);
    
    // Add event listener for node clicks
    knowledgeGraphNetwork.on('click', function(params) {
        if (params.nodes.length > 0) {
            // Get clicked node
            const nodeId = params.nodes[0];
            const node = graphData.nodes.find(n => n.id === nodeId);
            
            if (node) {
                // Display node info
                const infoBox = document.getElementById('graph-node-info');
                if (infoBox) {
                    if (node.group === 'table') {
                        infoBox.innerHTML = `
                            <h4>${node.label}</h4>
                            <div class="graph-node-info-content">
                                <p><strong>Type:</strong> Table</p>
                                <p><strong>Rows:</strong> ${node.title.split('<br>')[1].split(': ')[1]}</p>
                            </div>
                        `;
                    } else {
                        infoBox.innerHTML = `
                            <h4>${node.label}</h4>
                            <div class="graph-node-info-content">
                                <p><strong>Type:</strong> Column</p>
                                <p><strong>Data Type:</strong> ${node.title.split('<br>')[1].split(': ')[1]}</p>
                            </div>
                        `;
                    }
                }
            }
        }
    });
    
    // Add search functionality
    setupGraphSearch();
}

/**
 * Setup search functionality for graph nodes
 */
function setupGraphSearch() {
    const searchInput = document.getElementById('graph-search-input');
    if (!searchInput) return;
    
    searchInput.addEventListener('input', function() {
        const query = this.value.toLowerCase();
        
        if (!knowledgeGraphData || !knowledgeGraphNetwork) return;
        
        if (query.length < 2) {
            // Reset all nodes if query is too short
            const allNodes = knowledgeGraphData.nodes.map(n => n.id);
            knowledgeGraphNetwork.selectNodes(allNodes, false);
            
            // Reset highlighting
            restoreGraphHighlighting();
            return;
        }
        
        // Find matching nodes
        const matchingNodes = knowledgeGraphData.nodes.filter(node => 
            node.label.toLowerCase().includes(query)
        ).map(n => n.id);
        
        if (matchingNodes.length > 0) {
            // Highlight matching nodes
            knowledgeGraphNetwork.selectNodes(matchingNodes);
            
            // Focus the network on these nodes
            knowledgeGraphNetwork.fit({
                nodes: matchingNodes,
                animation: true
            });
        }
    });
    
    // Add clear button functionality
    const clearButton = document.getElementById('graph-search-clear');
    if (clearButton) {
        clearButton.addEventListener('click', function() {
            searchInput.value = '';
            restoreGraphHighlighting();
        });
    }
}

/**
 * Restore graph to default highlighting
 */
function restoreGraphHighlighting() {
    if (!knowledgeGraphNetwork) return;
    
    // Deselect all nodes
    knowledgeGraphNetwork.unselectAll();
    
    // Fit all nodes
    knowledgeGraphNetwork.fit({
        animation: true
    });
}

/**
 * Update graph statistics
 */
function updateGraphStats(stats) {
    const statsElement = document.getElementById('graph-stats');
    if (statsElement) {
        statsElement.innerHTML = `
            <div class="stat-item">
                <div class="stat-value">${stats.tables}</div>
                <div class="stat-label">Tables</div>
            </div>
            <div class="stat-item">
                <div class="stat-value">${stats.columns}</div>
                <div class="stat-label">Columns</div>
            </div>
            <div class="stat-item">
                <div class="stat-value">${stats.relationships}</div>
                <div class="stat-label">Relationships</div>
            </div>
        `;
    }
}

/**
 * Render graph legend
 */
function renderGraphLegend(legend) {
    const typeElement = document.getElementById('graph-legend-types');
    if (typeElement && legend.types) {
        let typeHtml = '';
        legend.types.forEach(type => {
            typeHtml += `
                <div class="legend-item">
                    <span class="legend-color" style="background-color: ${type.color};"></span>
                    <span class="legend-label">${type.label}</span>
                </div>
            `;
        });
        typeElement.innerHTML = typeHtml;
    }
    
    const relationshipElement = document.getElementById('graph-legend-relationships');
    if (relationshipElement && legend.relationships) {
        let relHtml = '';
        legend.relationships.forEach(rel => {
            const lineStyle = rel.dashed ? 'dashed' : 'solid';
            relHtml += `
                <div class="legend-item">
                    <span class="legend-line" style="border-top-style: ${lineStyle}; border-top-color: ${rel.color};"></span>
                    <span class="legend-label">${rel.label}</span>
                </div>
            `;
        });
        relationshipElement.innerHTML = relHtml;
    }
}

/**
 * Show message in graph container
 */
function showGraphMessage(message) {
    const messageElement = document.getElementById('graph-message');
    if (messageElement) {
        messageElement.textContent = message;
        messageElement.style.display = 'block';
        
        // Hide after 5 seconds
        setTimeout(() => {
            messageElement.style.display = 'none';
        }, 5000);
    }
}

/**
 * Get notebook UUID from URL or DOM
 */
function getNotebookUUID() {
    // First try to get from the notebook container's data attribute (for workbench notebooks)
    const notebookContainer = document.getElementById('notebook-container');
    if (notebookContainer && notebookContainer.dataset.notebookId) {
        console.log('Knowledge graph: Found notebook UUID from container data attribute:', notebookContainer.dataset.notebookId);
        return notebookContainer.dataset.notebookId;
    }

    // Try to get from global notebookId variable
    if (typeof notebookId !== 'undefined' && notebookId) {
        console.log('Knowledge graph: Found notebook UUID from global variable:', notebookId);
        return notebookId;
    }

    // Try to extract from URL (for notebooks opened via /notebooks/<uuid>/)
    const path = window.location.pathname;
    const matches = path.match(/\/notebooks\/([a-f0-9-]+)\//);
    if (matches && matches[1]) {
        console.log('Knowledge graph: Found notebook UUID from URL:', matches[1]);
        return matches[1];
    }

    // Fallback: try to extract from workbench URL if it has UUID after workbench/
    const urlParts = window.location.pathname.split('/');
    const workbenchIndex = urlParts.indexOf('workbench');
    if (workbenchIndex !== -1 && urlParts[workbenchIndex + 1]) {
        console.log('Knowledge graph: Found notebook UUID from workbench URL:', urlParts[workbenchIndex + 1]);
        return urlParts[workbenchIndex + 1];
    }

    console.warn('Knowledge graph: Could not determine notebook UUID from any source');
    return null;
}

/**
 * Initialize graph visualization when tab is activated
 */
document.addEventListener('DOMContentLoaded', function() {
    // Add tab switching event listener for knowledge graph initialization
    const tabs = document.querySelectorAll('.workspace-tabs .tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', function() {
            if (this.dataset.tab === 'results' && !knowledgeGraphNetwork) {
                // Initialize knowledge graph when results tab is first activated
                setTimeout(initKnowledgeGraph, 100);
            }
        });
    });
    
    // Layout options
    const layoutSelector = document.getElementById('graph-layout-select');
    if (layoutSelector) {
        layoutSelector.addEventListener('change', function() {
            if (!knowledgeGraphNetwork) return;
            
            const layout = this.value;
            let options = {};
            
            if (layout === 'hierarchical') {
                options = {
                    layout: {
                        hierarchical: {
                            direction: 'UD',
                            sortMethod: 'directed',
                            nodeSpacing: 150,
                            levelSeparation: 150
                        }
                    },
                    physics: {
                        hierarchicalRepulsion: {
                            nodeDistance: 120,
                            centralGravity: 0.0,
                            springLength: 100,
                            springConstant: 0.01,
                            damping: 0.09
                        },
                        solver: 'hierarchicalRepulsion'
                    }
                };
            } else if (layout === 'force') {
                options = {
                    layout: { hierarchical: false },
                    physics: {
                        forceAtlas2Based: {
                            gravitationalConstant: -50,
                            centralGravity: 0.01,
                            springLength: 100,
                            springConstant: 0.08
                        },
                        maxVelocity: 50,
                        solver: 'forceAtlas2Based',
                        timestep: 0.35
                    }
                };
            } else if (layout === 'circular') {
                // Apply circular layout
                const nodeIds = knowledgeGraphData.nodes.map(n => n.id);
                const tableNodes = knowledgeGraphData.nodes
                    .filter(n => n.group === 'table')
                    .map(n => n.id);
                
                // Position tables in a circle
                const radius = 300;
                const numTables = tableNodes.length;
                
                tableNodes.forEach((tableId, index) => {
                    const angle = (2 * Math.PI * index) / numTables;
                    const x = radius * Math.cos(angle);
                    const y = radius * Math.sin(angle);
                    
                    knowledgeGraphNetwork.moveNode(tableId, x, y);
                });
                
                options = {
                    layout: { hierarchical: false },
                    physics: {
                        enabled: true,
                        barnesHut: {
                            gravitationalConstant: -2000,
                            centralGravity: 0.1,
                            springLength: 95,
                            springConstant: 0.04
                        }
                    }
                };
            }
            
            // Apply new layout
            knowledgeGraphNetwork.setOptions(options);
            
            // Fit to view
            knowledgeGraphNetwork.fit();
        });
    }
});
