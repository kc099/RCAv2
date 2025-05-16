// Login page JavaScript
document.addEventListener('DOMContentLoaded', function() {
    // Toggle password visibility
    const setupPasswordToggle = () => {
        const passwordField = document.getElementById('id_password');
        if (!passwordField) return;
        
        // Create toggle button
        const toggleBtn = document.createElement('button');
        toggleBtn.type = 'button';
        toggleBtn.className = 'password-toggle';
        toggleBtn.innerHTML = '<i class="fas fa-eye"></i>';
        toggleBtn.setAttribute('aria-label', 'Toggle password visibility');
        
        // Insert after password field
        passwordField.parentNode.style.position = 'relative';
        passwordField.parentNode.appendChild(toggleBtn);
        
        // Style the button
        toggleBtn.style.position = 'absolute';
        toggleBtn.style.right = '10px';
        toggleBtn.style.top = '50%';
        toggleBtn.style.transform = 'translateY(-50%)';
        toggleBtn.style.border = 'none';
        toggleBtn.style.background = 'transparent';
        toggleBtn.style.color = '#6b7280';
        toggleBtn.style.cursor = 'pointer';
        
        // Toggle password visibility
        toggleBtn.addEventListener('click', function() {
            if (passwordField.type === 'password') {
                passwordField.type = 'text';
                toggleBtn.innerHTML = '<i class="fas fa-eye-slash"></i>';
            } else {
                passwordField.type = 'password';
                toggleBtn.innerHTML = '<i class="fas fa-eye"></i>';
            }
        });
    };
    
    // Form validation
    const setupFormValidation = () => {
        const loginForm = document.querySelector('.login-form');
        if (!loginForm) return;
        
        loginForm.addEventListener('submit', function(e) {
            const emailField = document.getElementById('id_login');
            const passwordField = document.getElementById('id_password');
            let valid = true;
            
            // Simple email validation
            if (emailField && !emailField.value.includes('@')) {
                createErrorMessage(emailField, 'Please enter a valid email address');
                valid = false;
            }
            
            // Password validation
            if (passwordField && passwordField.value.length < 1) {
                createErrorMessage(passwordField, 'Password is required');
                valid = false;
            }
            
            if (!valid) {
                e.preventDefault();
            }
        });
    };
    
    // Create error message under field
    const createErrorMessage = (field, message) => {
        // Remove existing error
        const existingError = field.parentNode.querySelector('.field-error');
        if (existingError) {
            existingError.remove();
        }
        
        // Add error styles to field
        field.style.borderColor = 'var(--error-color)';
        field.style.backgroundColor = 'rgba(239, 68, 68, 0.05)';
        
        // Create error message
        const errorDiv = document.createElement('div');
        errorDiv.className = 'field-error';
        errorDiv.textContent = message;
        errorDiv.style.color = 'var(--error-color)';
        errorDiv.style.fontSize = '0.75rem';
        errorDiv.style.marginTop = '0.25rem';
        
        // Insert after field
        field.parentNode.appendChild(errorDiv);
        
        // Clear error on input
        field.addEventListener('input', function() {
            field.style.borderColor = '';
            field.style.backgroundColor = '';
            const error = field.parentNode.querySelector('.field-error');
            if (error) {
                error.remove();
            }
        });
    };
    
    // Initialize
    setupPasswordToggle();
    setupFormValidation();
});
