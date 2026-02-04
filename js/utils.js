/**
 * Utility Functions
 * Global 'Utils' object to avoid namespace pollution
 */

const Utils = {
    // Format number to Thai Currency (e.g. 1,234.00)
    formatCurrency: (amount) => {
        return new Intl.NumberFormat('th-TH', {
            style: 'decimal',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(amount);
    },

    // Get current DateTime for UI
    getCurrentTime: () => {
        const now = new Date();
        return now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
    },

    // Generate simple ID
    generateId: () => {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    },

    // Convert File to Base64 (for images)
    fileToBase64: (file) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result);
            reader.onerror = error => reject(error);
        });
    },

    // Toggle hidden class
    toggle: (id) => {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('hidden');
    }
};
