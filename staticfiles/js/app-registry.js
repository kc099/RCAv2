/**
 * Global Application Registry for cross-script function sharing
 * This helps different modules communicate with each other
 */

// Create global namespace for the application if it doesn't exist
window.ORCA = window.ORCA || {};

// Initialize the registry
window.ORCA.registry = {
    // Function registry
    functions: {},
    
    // Register a function
    register: function(name, func) {
        console.log(`Registry: Registering function '${name}'`);
        this.functions[name] = func;
        return func;
    },
    
    // Get a registered function
    get: function(name) {
        const func = this.functions[name];
        if (!func) {
            console.error(`Registry: Function '${name}' not found`);
        }
        return func;
    },
    
    // Call a registered function
    call: function(name, ...args) {
        const func = this.get(name);
        if (func && typeof func === 'function') {
            try {
                return func(...args);
            } catch (error) {
                console.error(`Registry: Error calling function '${name}':`, error);
                return null;
            }
        }
        return null;
    },
    
    // List all registered functions
    list: function() {
        return Object.keys(this.functions);
    }
};

// Export for direct access
const Registry = window.ORCA.registry;
