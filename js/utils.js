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

    // Convert File to Base64 (with Resize)
    // Aggressive Resize for Sunmi V3 (Low Memory)
    fileToBase64: (file, maxWidth = 300) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = (e) => {
                const img = new Image();
                img.src = e.target.result;
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let width = img.width;
                    let height = img.height;

                    if (width > maxWidth) {
                        height *= maxWidth / width;
                        width = maxWidth;
                    }

                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);

                    // Compress to JPEG 60% to save space (Critical for Thermal Printer Buffer)
                    resolve(canvas.toDataURL('image/jpeg', 0.6));
                };
                img.onerror = error => reject(error);
            };
            reader.onerror = error => reject(error);
        });
    },

    // Calculate Time Ago (e.g. "5 mins ago")
    timeAgo: (timestamp) => {
        const seconds = Math.floor((new Date() - new Date(timestamp)) / 1000);
        let interval = seconds / 31536000;
        if (interval > 1) return Math.floor(interval) + " ปีที่แล้ว";
        interval = seconds / 2592000;
        if (interval > 1) return Math.floor(interval) + " เดือนที่แล้ว";
        interval = seconds / 86400;
        if (interval > 1) return Math.floor(interval) + " วันที่แล้ว";
        interval = seconds / 3600;
        if (interval > 1) return Math.floor(interval) + " ชม. ที่แล้ว";
        interval = seconds / 60;
        if (interval > 1) return Math.floor(interval) + " นาทีที่แล้ว";
        return Math.floor(seconds) + " วินาทีที่แล้ว";
    },

    // Toggle hidden class
    toggle: (id) => {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('hidden');
    }
};
