/**
 * Database Manager (LocalStorage)
 * Global 'DB' object
 */

const DB = {
    KEYS: {
        PRODUCTS: 'store_products',
        PARKED_CARTS: 'store_parked_carts',
        SALES: 'store_sales',
        SUPPLIERS: 'store_suppliers',
        SUPPLIER_PRICES: 'store_suppliers_prices',
        SETTINGS: 'store_settings',
        GROUP_IMAGES: 'store_group_images',
        PAYMENT_PREFS: 'store_payment_prefs',
        TABLES: 'store_tables',
        AUTO_CART: 'store_auto_cart'
    },

    // Helper for safe parsing
    safeGet: (key, fallback) => {
        const val = DB.cache[key];
        return val !== null && val !== undefined ? val : fallback;
    },

    saveToLocalStorage: (key, data) => {
        DB.cache[key] = data;
        localforage.setItem(key, data).catch(e => console.error("Save error:", e));
        return true;
    },
    // New: Helper for safe saving with Quota Check
    saveToLocalStorage: (key, data) => {
        try {
            localStorage.setItem(key, JSON.stringify(data));
            return true;
        } catch (e) {
            console.error('Import Error:', e);
            let msg = 'ไฟล์ไม่ถูกต้องหรือระบบขัดข้อง';
            if (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
                msg = 'ความจุเต็ม! (บีบอัดจนสุดแล้วก็ยังไม่พอ กรุณาลบไฟล์ที่ไม่จำเป็น)';
            } else if (e.message) {
                msg = e.message;
            }
            return { success: false, message: msg };
        }
    }
};

// Initialize DB on load
// DB.init() is now async and called from App.init()
