// dashboard.js - Handles dashboard visualization functionality

// Store current dataset
let dashboardData = null;
let dashboardColumns = [];
let currentChart = null;

// Initialize the dashboard
document.addEventListener('DOMContentLoaded', function() {
    initDashboard();
});

function initDashboard() {
    // Check if Plotly is available
    checkPlotlyAvailability();
    
    // Set up event listeners
    const generateBtn = document.getElementById('generate-chart');
    if (generateBtn) {
        generateBtn.addEventListener('click', generateChart);
    }
    
    // Check if we have data in the session
    checkForExistingData();
    
    // Set up plot type change handler
    const plotTypeSelect = document.getElementById('plot-type');
    if (plotTypeSelect) {
        plotTypeSelect.addEventListener('change', updateFormForPlotType);
    }
}

/**
 * Check if Plotly.js is available and show appropriate feedback
 */
function checkPlotlyAvailability() {
    if (typeof Plotly === 'undefined') {
        console.warn('Plotly.js is not immediately available. Listening for plotlyLoaded event...');
        
        // Listen for the plotlyLoaded event from the enhanced loading script
        document.addEventListener('plotlyLoaded', function() {
            console.log('Plotly.js loading confirmed via event in dashboard.js');
            // Remove any warning that was previously shown
            const existingWarning = document.querySelector('.plotly-warning');
            if (existingWarning) {
                existingWarning.remove();
            }
        });
        
        // Add a warning to the dashboard if there's a container
        const dashboardContainer = document.getElementById('dashboard-container');
        if (dashboardContainer) {
            const warningDiv = document.createElement('div');
            warningDiv.className = 'plotly-warning';
            warningDiv.style.cssText = 'background: #fff3cd; border: 1px solid #ffeaa7; color: #856404; padding: 10px; margin: 10px 0; border-radius: 4px; font-size: 14px;';
            warningDiv.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Loading chart functionality...';
            
            // Insert at the beginning of dashboard container
            dashboardContainer.insertBefore(warningDiv, dashboardContainer.firstChild);
            
            // Remove warning after 5 seconds if Plotly still hasn't loaded
            setTimeout(() => {
                if (typeof Plotly === 'undefined' && warningDiv.parentNode) {
                    warningDiv.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Chart functionality may require page refresh if Plotly.js fails to load.';
                } else if (typeof Plotly !== 'undefined' && warningDiv.parentNode) {
                    warningDiv.remove();
                }
            }, 5000);
        }
    } else {
        console.log('Plotly.js is available:', Plotly.BUILD || 'version info unavailable');
    }
}

/**
 * Check if there's existing data in the session
 */
function checkForExistingData() {
    fetch('/api/dashboard/data/', {
        method: 'GET',
        headers: {
            'X-CSRFToken': getCsrfToken(),
            'Content-Type': 'application/json'
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.success && data.data) {
            // We have data to display
            loadDashboardData(data.data);
        }
    })
    .catch(error => {
        console.error('Error checking for dashboard data:', error);
    });
}

/**
 * Load data into the dashboard
 */
function loadDashboardData(data) {
    console.log('Dashboard: Loading data:', data);
    
    // We don't need to activate the tab here as it's already handled by the click event 
    // in notebook.js -> exportToDashboard
    
    // Store the data
    dashboardData = data.rows;
    dashboardColumns = data.columns;
    
    console.log('Dashboard: Parsed data rows:', dashboardData.length, 'rows');
    console.log('Dashboard: Parsed columns:', dashboardColumns);
    
    // Show controls - ensure we find elements within the #dashboard container
    const controls = document.querySelector('#dashboard .dashboard-data-controls');
    console.log('Dashboard: Controls element found:', !!controls, controls);
    if (controls) {
        controls.style.display = 'block';
    } else {
        console.error('Dashboard: Controls element not found!');
    }
    
    // Hide empty state
    const emptyState = document.querySelector('#dashboard .dashboard-empty-state');
    console.log('Dashboard: Empty state element found:', !!emptyState, emptyState);
    if (emptyState) {
        emptyState.style.display = 'none';
    } else {
        console.error('Dashboard: Empty state element not found!');
    }
    
    // Populate column dropdowns
    populateColumnDropdowns();
    
    // Show data summary
    showDataSummary(data);
    
    console.log('Dashboard: Data loading complete');
}

/**
 * Populate column selection dropdowns
 */
function populateColumnDropdowns() {
    console.log('Dashboard: Populating column dropdowns');
    const xAxisSelect = document.getElementById('x-axis');
    const yAxisSelect = document.getElementById('y-axis');
    
    console.log('Dashboard: X-axis select element found:', !!xAxisSelect);
    console.log('Dashboard: Y-axis select element found:', !!yAxisSelect);
    
    if (!xAxisSelect || !yAxisSelect) {
        console.error('Dashboard: Column select elements not found');
        return;
    }
    
    console.log('Dashboard: Columns to populate:', dashboardColumns);
    
    // Clear existing options
    xAxisSelect.innerHTML = '';
    yAxisSelect.innerHTML = '';
    
    // Add new options
    dashboardColumns.forEach(column => {
        const xOption = document.createElement('option');
        xOption.value = column;
        xOption.textContent = column;
        xAxisSelect.appendChild(xOption);
        
        const yOption = document.createElement('option');
        yOption.value = column;
        yOption.textContent = column;
        yAxisSelect.appendChild(yOption);
    });
    
    console.log('Dashboard: Options populated for X-axis:', xAxisSelect.options.length);
    console.log('Dashboard: Options populated for Y-axis:', yAxisSelect.options.length);
    
    // Select numeric columns for y-axis by default if possible
    if (dashboardData && dashboardData.length > 0) {
        console.log('Dashboard: Checking for numeric columns');
        // Find first numeric column for y-axis
        const numericColumns = dashboardColumns.filter(column => {
            const isNumeric = typeof dashboardData[0][column] === 'number';
            console.log(`Dashboard: Column ${column} is numeric:`, isNumeric);
            return isNumeric;
        });
        
        console.log('Dashboard: Found numeric columns:', numericColumns);
        
        if (numericColumns.length > 0) {
            yAxisSelect.value = numericColumns[0];
            console.log('Dashboard: Selected Y-axis column:', numericColumns[0]);
        }
    }
    
    // Update form based on plot type
    updateFormForPlotType();
    console.log('Dashboard: Column dropdowns populated successfully');
}

/**
 * Update form fields based on selected plot type
 */
function updateFormForPlotType() {
    const plotType = document.getElementById('plot-type').value;
    const yAxisControl = document.querySelector('.y-axis-control');
    
    if (plotType === 'pie') {
        // Pie charts don't need y-axis
        if (yAxisControl) {
            yAxisControl.style.display = 'none';
        }
    } else {
        if (yAxisControl) {
            yAxisControl.style.display = 'block';
        }
    }
}

/**
 * Show a summary of the imported data
 */
function showDataSummary(data) {
    const container = document.getElementById('dashboard-container');
    
    // Create summary element if it doesn't exist
    let summary = document.getElementById('data-summary');
    if (!summary) {
        summary = document.createElement('div');
        summary.id = 'data-summary';
        summary.className = 'data-summary';
        container.insertBefore(summary, document.getElementById('chart-container'));
    }
    
    // Populate summary
    summary.innerHTML = `
        <h3>Imported Data Summary</h3>
        <p>${data.rows.length} rows, ${data.columns.length} columns</p>
        <p>Source: ${data.source || 'SQL Query'}</p>
        <button id="clear-dashboard-data" class="btn btn-sm btn-outline-danger">Clear Data</button>
    `;
    
    // Add clear data handler
    const clearBtn = document.getElementById('clear-dashboard-data');
    if (clearBtn) {
        clearBtn.addEventListener('click', clearDashboardData);
    }
}

/**
 * Clear dashboard data
 */
function clearDashboardData() {
    fetch('/api/dashboard/clear/', {
        method: 'POST',
        headers: {
            'X-CSRFToken': getCsrfToken(),
            'Content-Type': 'application/json'
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            // Reset dashboard
            dashboardData = null;
            dashboardColumns = [];
            
            // Hide controls
            const controls = document.querySelector('.dashboard-data-controls');
            if (controls) {
                controls.style.display = 'none';
            }
            
            // Show empty state
            const emptyState = document.querySelector('.dashboard-empty-state');
            if (emptyState) {
                emptyState.style.display = 'block';
            }
            
            // Clear chart
            const chartContainer = document.getElementById('chart-container');
            if (chartContainer) {
                chartContainer.innerHTML = '';
            }
            
            // Remove data summary
            const summary = document.getElementById('data-summary');
            if (summary) {
                summary.remove();
            }
            
            // Show success message
            showNotification('Dashboard data cleared');
        }
    })
    .catch(error => {
        console.error('Error clearing dashboard data:', error);
        showNotification('Error clearing data: ' + error.message, 'error');
    });
}

/**
 * Generate a chart based on selected options
 */
function generateChart() {
    if (!dashboardData || dashboardData.length === 0) {
        showNotification('No data available for charting', 'error');
        return;
    }
    
    // Check if Plotly is available
    if (typeof Plotly === 'undefined') {
        console.error('Plotly.js is not loaded. Checking if load is in progress...');
        
        // Check if loading is already in progress by looking for script tags
        const existingPlotlyScripts = Array.from(document.scripts).filter(script => 
            script.src && script.src.includes('plotly')
        );
        
        if (existingPlotlyScripts.length > 0) {
            console.log('Plotly.js loading detected, waiting for load completion...');
            showNotification('Chart library is loading, please wait...', 'info');
            
            // Wait for plotlyLoaded event or timeout after 10 seconds
            const plotlyLoadPromise = new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('Plotly loading timeout'));
                }, 10000);
                
                document.addEventListener('plotlyLoaded', function() {
                    clearTimeout(timeout);
                    resolve();
                }, { once: true });
                
                // Also check if Plotly becomes available via polling
                const pollInterval = setInterval(() => {
                    if (typeof Plotly !== 'undefined') {
                        clearTimeout(timeout);
                        clearInterval(pollInterval);
                        resolve();
                    }
                }, 100);
            });
            
            plotlyLoadPromise
                .then(() => {
                    console.log('Plotly.js loaded, retrying chart generation');
                    setTimeout(generateChart, 100);
                })
                .catch(() => {
                    showNotification('Chart library failed to load. Please refresh the page and try again.', 'error');
                });
            
            return;
        } else {
            // No loading in progress, try to load manually
            console.log('No Plotly loading detected, attempting manual load...');
            
            const script = document.createElement('script');
            script.src = 'https://cdn.plot.ly/plotly-3.0.1.min.js';
            script.onload = function() {
                console.log('Plotly.js loaded manually');
                setTimeout(generateChart, 100);
            };
            script.onerror = function() {
                // Try backup CDN
                const backupScript = document.createElement('script');
                backupScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/plotly.js/2.27.0/plotly.min.js';
                backupScript.onload = function() {
                    console.log('Plotly.js loaded from backup CDN');
                    setTimeout(generateChart, 100);
                };
                backupScript.onerror = function() {
                    showNotification('Failed to load chart library. Please refresh the page and try again.', 'error');
                };
                document.head.appendChild(backupScript);
            };
            document.head.appendChild(script);
            return;
        }
    }
    
    // Get chart options from form
    const plotType = document.getElementById('plot-type').value;
    const xAxis = document.getElementById('x-axis').value;
    const yAxis = document.getElementById('y-axis').value;
    const chartTitle = document.getElementById('chart-title').value || 'Data Visualization';
    
    // Get chart container
    const chartContainer = document.getElementById('chart-container');
    if (!chartContainer) {
        console.error('Chart container not found');
        showNotification('Chart container not found. Please refresh the page and try again.', 'error');
        return;
    }
    
    try {
        // Extract data for plotting
        const xValues = dashboardData.map(row => row[xAxis]);
        
        // Prepare the data and layout based on chart type
        let plotData, layout;
        
        switch (plotType) {
            case 'bar':
                plotData = [{
                    x: xValues,
                    y: dashboardData.map(row => row[yAxis]),
                    type: 'bar',
                    marker: {
                        color: 'rgba(0, 123, 255, 0.7)'
                    }
                }];
                
                layout = {
                    title: chartTitle,
                    xaxis: {
                        title: xAxis
                    },
                    yaxis: {
                        title: yAxis
                    }
                };
                break;
                
            case 'line':
                plotData = [{
                    x: xValues,
                    y: dashboardData.map(row => row[yAxis]),
                    type: 'scatter',
                    mode: 'lines+markers',
                    line: {
                        color: 'rgb(75, 192, 192)',
                        width: 2
                    },
                    marker: {
                        color: 'rgb(75, 192, 192)',
                        size: 8
                    }
                }];
                
                layout = {
                    title: chartTitle,
                    xaxis: {
                        title: xAxis
                    },
                    yaxis: {
                        title: yAxis
                    }
                };
                break;
                
            case 'scatter':
                plotData = [{
                    x: xValues,
                    y: dashboardData.map(row => row[yAxis]),
                    mode: 'markers',
                    type: 'scatter',
                    marker: {
                        color: 'rgba(52, 152, 219, 0.7)',
                        size: 10
                    }
                }];
                
                layout = {
                    title: chartTitle,
                    xaxis: {
                        title: xAxis
                    },
                    yaxis: {
                        title: yAxis
                    }
                };
                break;
                
            case 'pie':
                // For pie charts, we need to aggregate the data
                const pieData = {};
                xValues.forEach((label, index) => {
                    if (pieData[label]) {
                        pieData[label] += 1;
                    } else {
                        pieData[label] = 1;
                    }
                });
                
                plotData = [{
                    labels: Object.keys(pieData),
                    values: Object.values(pieData),
                    type: 'pie',
                    hole: 0.4,
                    marker: {
                        colors: [
                            'rgba(52, 152, 219, 0.7)',
                            'rgba(46, 204, 113, 0.7)',
                            'rgba(231, 76, 60, 0.7)',
                            'rgba(155, 89, 182, 0.7)',
                            'rgba(241, 196, 15, 0.7)'
                        ]
                    }
                }];
                
                layout = {
                    title: chartTitle
                };
                break;
                
            case 'histogram':
                plotData = [{
                    x: dashboardData.map(row => row[xAxis]),
                    type: 'histogram',
                    marker: {
                        color: 'rgba(52, 152, 219, 0.7)'
                    }
                }];
                
                layout = {
                    title: chartTitle,
                    xaxis: {
                        title: xAxis
                    },
                    yaxis: {
                        title: 'Frequency'
                    }
                };
                break;
                
            default:
                showNotification('Invalid chart type selected', 'error');
                return;
        }
        
        // Common layout settings
        layout.autosize = true;
        layout.margin = {
            l: 50,
            r: 50,
            b: 100,
            t: 100,
            pad: 4
        };
        
        // Render the plot with error handling
        try {
            Plotly.newPlot(chartContainer, plotData, layout, {responsive: true});
            
            // Show success message
            showNotification('Chart generated successfully');
        } catch (plotlyError) {
            console.error('Plotly rendering error:', plotlyError);
            showNotification('Error rendering chart: ' + plotlyError.message, 'error');
        }
        
    } catch (error) {
        console.error('Error generating chart:', error);
        showNotification('Error generating chart: ' + error.message, 'error');
    }
}

/**
 * Show a notification message
 */
function showNotification(message, type = 'success') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.textContent = message;
    
    // Set background color based on type
    if (type === 'error') {
        notification.style.backgroundColor = '#dc3545';
    } else if (type === 'info') {
        notification.style.backgroundColor = '#17a2b8';
    } else {
        notification.style.backgroundColor = '#28a745'; // success
    }
    
    // Base notification styles
    notification.style.cssText += `
        position: fixed;
        top: 20px;
        right: 20px;
        color: white;
        padding: 10px 20px;
        border-radius: 4px;
        z-index: 9999;
        opacity: 0;
        transition: opacity 0.3s ease;
        max-width: 300px;
        font-size: 14px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    `;
    
    // Add to body
    document.body.appendChild(notification);
    
    // Trigger animation
    setTimeout(() => {
        notification.style.opacity = '1';
        
        // Remove after 3 seconds
        setTimeout(() => {
            notification.style.opacity = '0';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.remove();
                }
            }, 300);
        }, 3000);
    }, 10);
}

/**
 * Get CSRF token from cookies
 */
function getCsrfToken() {
    const cookieValue = document.cookie.split('; ')
        .find(row => row.startsWith('csrftoken='))
        ?.split('=')[1];
    
    return cookieValue || '';
}

// Activate dashboard tab
function activateDashboardTab() {
    console.log('Dashboard: Activating dashboard tab');
    
    const tabs = document.querySelectorAll('.tab');
    const tabContents = document.querySelectorAll('.tab-pane');
    
    console.log('Dashboard: Found', tabs.length, 'tabs and', tabContents.length, 'tab contents');
    
    // Remove active class from all tabs
    tabs.forEach(tab => tab.classList.remove('active'));
    
    // Hide all tab contents by removing active class
    tabContents.forEach(content => {
        content.classList.remove('active');
    });
    
    // Activate dashboard tab
    const dashboardTab = document.querySelector('.tab[data-tab="dashboard"]');
    console.log('Dashboard: Tab element found:', !!dashboardTab);
    if (dashboardTab) {
        dashboardTab.classList.add('active');
    }
    
    // Show dashboard content
    const dashboardContent = document.getElementById('dashboard');
    console.log('Dashboard: Content element found:', !!dashboardContent);
    if (dashboardContent) {
        dashboardContent.classList.add('active');
    }
    
    console.log('Dashboard: Tab activation complete');
}

// Register functions with global Registry
if (window.ORCA && window.ORCA.registry) {
    console.log('Dashboard: Registering functions with Registry');
    window.ORCA.registry.register('activateDashboardTab', activateDashboardTab);
    window.ORCA.registry.register('loadDashboardData', loadDashboardData);
}

// Make functions available globally
window.activateDashboardTab = activateDashboardTab;
window.loadDashboardData = loadDashboardData;

console.log('Dashboard: Initialization complete, functions registered');

// Debug helper to check initialization status
window.debugDashboard = function() {
    console.log('Dashboard Debug:');
    console.log('- Dashboard data:', dashboardData);
    console.log('- Dashboard columns:', dashboardColumns);
    console.log('- Controls visible:', document.querySelector('.dashboard-data-controls')?.style.display);
    console.log('- Empty state visible:', document.querySelector('.dashboard-empty-state')?.style.display);
    console.log('- Chart container:', document.getElementById('chart-container'));
    console.log('- Registry functions:', window.ORCA?.registry?.list());
    return 'Dashboard debug complete';
};
