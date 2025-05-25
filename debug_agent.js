// Agent Debug Script
// Copy and paste this into your browser console on the workbench page

console.log("=== Agent Debug Information ===");

// Check global variables
console.log("Global Variables:");
console.log("- currentNotebookId:", window.currentNotebookId);
console.log("- activeConnectionId:", window.activeConnectionId);
console.log("- cellsData:", window.cellsData ? `${window.cellsData.length} cells` : "not found");

// Check if agent is initialized
console.log("\nAgent Status:");
console.log("- textToSQLAgent exists:", typeof window.textToSQLAgent !== 'undefined');
if (window.textToSQLAgent) {
    console.log("- Agent instance:", window.textToSQLAgent);
    console.log("- Current conversation ID:", window.textToSQLAgent.currentConversationId);
    console.log("- Is processing:", window.textToSQLAgent.isProcessing);
}

// Check UI elements
console.log("\nUI Elements:");
const nlInput = document.getElementById('nlQueryInput');
const submitBtn = document.getElementById('submitNlQuery');
const agentArea = document.getElementById('agentResponseArea');

console.log("- Natural language input:", nlInput ? "found" : "NOT FOUND");
console.log("- Submit button:", submitBtn ? "found" : "NOT FOUND");
console.log("- Agent response area:", agentArea ? "found" : "NOT FOUND");

if (nlInput) {
    console.log("  - Input ID:", nlInput.id);
    console.log("  - Input placeholder:", nlInput.placeholder);
    console.log("  - Input value:", nlInput.value);
}

if (submitBtn) {
    console.log("  - Button ID:", submitBtn.id);
    console.log("  - Button text:", submitBtn.textContent);
    console.log("  - Button classes:", submitBtn.className);
}

// Check for CSRF token
console.log("\nCSRF Token:");
const csrfToken = document.querySelector('[name=csrfmiddlewaretoken]');
console.log("- CSRF token element:", csrfToken ? "found" : "NOT FOUND");
if (csrfToken) {
    console.log("  - Token value:", csrfToken.value.substring(0, 10) + "...");
}

// Test agent methods if available
if (window.textToSQLAgent) {
    console.log("\nTesting Agent Methods:");
    try {
        const notebookId = window.textToSQLAgent.getCurrentNotebookId();
        const connectionId = window.textToSQLAgent.getActiveConnectionId();
        console.log("- getCurrentNotebookId():", notebookId);
        console.log("- getActiveConnectionId():", connectionId);
    } catch (error) {
        console.error("- Error testing methods:", error);
    }
}

console.log("\n=== Debug Complete ===");

// Test button click if everything looks good
if (window.textToSQLAgent && nlInput && submitBtn) {
    console.log("\n🧪 Ready to test! Try typing a query and clicking the button.");
    console.log("Or run: document.getElementById('nlQueryInput').value = 'test query'; document.getElementById('submitNlQuery').click();");
} else {
    console.log("\n❌ Missing components - check the errors above.");
} 