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
        PAYMENT_PREFS: 'store_payment_prefs'
    },

    // Helper for safe parsing
    safeGet: (key, fallback) => {
        try {
            const val = localStorage.getItem(key);
            if (!val || val === 'undefined' || val === 'null') return fallback;
            return JSON.parse(val);
        } catch (e) {
            console.error(`Error parsing ${key}:`, e);
            // If data is corrupt, return fallback to prevent crash
            return fallback;
        }
    },

    // Initial Mock Data
    init: () => {
        // Safe check using new helper
        const products = DB.safeGet(DB.KEYS.PRODUCTS, null);

        if (!products || products.length === 0) {
            const mockProducts = [
                {
                    id: '8850987123456', // Mock Barcode
                    barcode: '8850987123456',
                    name: 'ไวไว ปรุงสำเร็จ (60g)',
                    price: 6.00,
                    cost: 4.50,
                    stock: 48,
                    image: null
                },
                {
                    id: '8851987123456',
                    barcode: '8851987123456',
                    name: 'มาม่า หมูสับ (60g)',
                    price: 7.00,
                    cost: 5.25,
                    stock: 12,
                    image: null
                },
                {
                    id: '8852987123456',
                    barcode: '8852987123456',
                    name: 'โค้ก (325ml)',
                    price: 15.00,
                    cost: 11.00,
                    stock: 24,
                    image: null
                },
                {
                    id: '8853987123456',
                    barcode: '8853987123456',
                    name: 'น้ำดื่ม คริสตัล (600ml)',
                    price: 7.00,
                    stock: 3,
                    image: null
                },
                {
                    id: '123456',
                    barcode: '123456',
                    name: 'ขนมปัง ฟาร์ม (แถว)',
                    price: 42.00,
                    stock: 5,
                    image: null
                }
            ];
            localStorage.setItem(DB.KEYS.PRODUCTS, JSON.stringify(mockProducts));
            console.log('Mock Data Re-Initialized');
        }
    },

    // --- Settings & Security ---
    getSettings: () => {
        const defaults = {
            storeName: 'ร้านชำ (Grocery POS)',
            pin: '0000',
            address: '',
            phone: '',
            printerWidth: '80mm', // New: 58mm or 80mm
            printLogo: true,      // New: Toggle Logo
            printQr: true,        // New: Toggle QR
            logo: null,           // New: Base64 Image
            qrCode: null          // New: Base64 Image
        };
        const saved = DB.safeGet(DB.KEYS.SETTINGS, {});
        return { ...defaults, ...saved };
    },

    saveSettings: (newSettings) => {
        const current = DB.getSettings();
        const updated = { ...current, ...newSettings };
        localStorage.setItem(DB.KEYS.SETTINGS, JSON.stringify(updated));
    },

    // --- Payment Preferences ---
    getPaymentPrefs: () => {
        const defaults = {
            printLogo: true,
            printName: true,
            printContact: true,
            printQr: true
        };
        const saved = DB.safeGet(DB.KEYS.PAYMENT_PREFS, {});
        // Fallback to global settings if prefs are empty (first time)
        if (Object.keys(saved).length === 0) {
            const settings = DB.getSettings();
            saved.printLogo = settings.printLogo;
            saved.printContact = !!settings.phone || !!settings.address;
            saved.printQr = settings.printQr;
        }
        return { ...defaults, ...saved };
    },

    savePaymentPrefs: (newPrefs) => {
        const current = DB.getPaymentPrefs();
        const updated = { ...current, ...newPrefs };
        localStorage.setItem(DB.KEYS.PAYMENT_PREFS, JSON.stringify(updated));
    },

    // --- Group Images ---
    getGroupImages: () => {
        return DB.safeGet(DB.KEYS.GROUP_IMAGES, {});
    },

    setGroupImage: (groupName, base64) => {
        const images = DB.getGroupImages();
        images[groupName] = base64;
        localStorage.setItem(DB.KEYS.GROUP_IMAGES, JSON.stringify(images));
    },

    removeGroupImage: (groupName) => {
        const images = DB.getGroupImages();
        delete images[groupName];
        localStorage.setItem(DB.KEYS.GROUP_IMAGES, JSON.stringify(images));
    },

    validatePin: (inputPin) => {
        const settings = DB.getSettings();
        return settings.pin === inputPin;
    },

    // --- Products ---
    getProducts: () => {
        return DB.safeGet(DB.KEYS.PRODUCTS, []);
    },

    saveProduct: (product) => {
        const products = DB.getProducts();
        const existingIndex = products.findIndex(p => p.id === product.id);

        if (existingIndex >= 0) {
            products[existingIndex] = product;
        } else {
            products.push(product);
        }
        localStorage.setItem(DB.KEYS.PRODUCTS, JSON.stringify(products));
    },

    saveProducts: (productsArray) => {
        localStorage.setItem(DB.KEYS.PRODUCTS, JSON.stringify(productsArray));
    },

    deleteProduct: (id) => {
        let products = DB.getProducts();
        products = products.filter(p => p.id !== id);
        localStorage.setItem(DB.KEYS.PRODUCTS, JSON.stringify(products));
    },

    getProductByBarcode: (barcode) => {
        const products = DB.getProducts();
        return products.find(p => p.barcode === barcode);
    },

    updateStock: (id, quantityChange) => {
        const products = DB.getProducts();
        const product = products.find(p => p.id === id);
        if (product) {
            product.stock -= quantityChange;
            localStorage.setItem(DB.KEYS.PRODUCTS, JSON.stringify(products));
        }
    },

    // --- Bill ID Generation ---
    generateBillId: () => {
        const today = new Date();
        const yy = today.getFullYear().toString().slice(-2);
        const mm = (today.getMonth() + 1).toString().padStart(2, '0');
        const dd = today.getDate().toString().padStart(2, '0');
        const prefix = `B${yy}${mm}${dd}`; // e.g., B260205

        const key = `counter_${prefix}`;
        let count = parseInt(localStorage.getItem(key)) || 0;
        count++;
        localStorage.setItem(key, count.toString());

        const runningNum = count.toString().padStart(3, '0');
        return `${prefix}-${runningNum}`;
    },

    // --- Parked Carts ---
    getParkedCarts: () => {
        // Sort by Timestamp ASC (First In - Top)
        return DB.safeGet(DB.KEYS.PARKED_CARTS, []).sort((a, b) => a.timestamp - b.timestamp);
    },

    getParkedTrash: () => {
        return DB.safeGet('store_parked_trash', []); // New Key
    },

    parkCart: (cartItems, note = '', customTimestamp = null) => {
        const parked = DB.getParkedCarts();

        // LIMIT CHECK: Maintain max 5 items
        // If we have 5 or more, remove the Oldest (index 0 because getParkedCarts sorts ASC)
        if (parked.length >= 5) {
            const oldest = parked.shift(); // Remove the oldest

            // Move to Trash (Safety Net) - Robust FIFO
            let trash = DB.getParkedTrash();
            trash.push(oldest);
            trash.sort((a, b) => b.timestamp - a.timestamp); // Newest First
            if (trash.length > 10) trash = trash.slice(0, 10);
            localStorage.setItem('store_parked_trash', JSON.stringify(trash));

            // Note: We don't save parked yet, we'll save after adding the new one
        }

        parked.push({
            id: DB.generateBillId(),
            timestamp: customTimestamp || Date.now(), // Allow persistent queue position
            note: note,
            items: cartItems
        });
        localStorage.setItem(DB.KEYS.PARKED_CARTS, JSON.stringify(parked));
    },

    updateParkedNote: (id, newNote) => {
        const parked = DB.getParkedCarts();
        const item = parked.find(c => c.id === id);
        if (item) {
            item.note = newNote;
            localStorage.setItem(DB.KEYS.PARKED_CARTS, JSON.stringify(parked));
        }
    },

    retrieveParkedCart: (id) => {
        const parked = DB.getParkedCarts();
        const cartIndex = parked.findIndex(c => c.id === id);
        if (cartIndex > -1) {
            const cart = parked[cartIndex];
            // Remove from parked
            parked.splice(cartIndex, 1);
            localStorage.setItem(DB.KEYS.PARKED_CARTS, JSON.stringify(parked));
            return cart; // Return full object to access timestamp/note
        }
        return null;
    },

    removeParkedCart: (id) => {
        // Soft Delete to Trash
        const parked = DB.getParkedCarts();
        const item = parked.find(c => c.id === id);

        if (item) {
            // Add to Trash - Robust FIFO
            let trash = DB.getParkedTrash();
            trash.push(item);
            trash.sort((a, b) => b.timestamp - a.timestamp); // Newest First
            if (trash.length > 10) trash = trash.slice(0, 10);
            localStorage.setItem('store_parked_trash', JSON.stringify(trash));

            // Remove from Active
            const newParked = parked.filter(c => c.id !== id);
            localStorage.setItem(DB.KEYS.PARKED_CARTS, JSON.stringify(newParked));
        }
    },

    restoreParkedFromTrash: (id) => {
        const trash = DB.getParkedTrash();
        const itemIndex = trash.findIndex(c => c.id === id);
        if (itemIndex > -1) {
            const item = trash[itemIndex];

            // Move back to Parked
            const parked = DB.getParkedCarts();
            parked.push(item);
            localStorage.setItem(DB.KEYS.PARKED_CARTS, JSON.stringify(parked));

            // Remove from Trash
            trash.splice(itemIndex, 1);
            localStorage.setItem('store_parked_trash', JSON.stringify(trash));
        }
    },

    deleteParkedTrashItem: (id) => {
        let trash = DB.getParkedTrash();
        trash = trash.filter(c => c.id !== id);
        localStorage.setItem('store_parked_trash', JSON.stringify(trash));
    },

    clearParkedTrash: () => {
        localStorage.removeItem('store_parked_trash');
    },

    // --- Sales ---
    // --- Sales ---
    recordSale: (saleData) => {
        const sales = DB.safeGet(DB.KEYS.SALES, []);

        // If ID exists, it might be an update
        if (saleData.billId) {
            const existingIndex = sales.findIndex(s => s.billId === saleData.billId);
            if (existingIndex >= 0) {
                // UPDATE existing sale
                // Merge but preserve original date if not provided
                sales[existingIndex] = { ...sales[existingIndex], ...saleData };
                localStorage.setItem(DB.KEYS.SALES, JSON.stringify(sales));
                return;
            }
        } else {
            saleData.billId = DB.generateBillId();
        }

        // Snapshot Store Name for Historical Integrity
        saleData.storeName = DB.getSettings().storeName;
        sales.push(saleData);
        localStorage.setItem(DB.KEYS.SALES, JSON.stringify(sales));
    },

    getSales: () => {
        const sales = DB.safeGet(DB.KEYS.SALES, []);
        let updated = false;
        sales.forEach(s => {
            if (!s.billId) {
                // Generate a retro-active ID based on date or random if not possible
                // Using timestamp part from date if available, else random
                const datePart = s.date ? new Date(s.date).getTime().toString().slice(-6) : Math.floor(Math.random() * 10000);
                s.billId = `B-${datePart}-${Math.floor(Math.random() * 1000)}`;
                updated = true;
            }
        });

        if (updated) {
            localStorage.setItem(DB.KEYS.SALES, JSON.stringify(sales));
        }

        return sales;
    },

    getSaleById: (id) => {
        return DB.safeGet(DB.KEYS.SALES, []).find(s => s.billId === id);
    },

    // --- Suppliers ---
    getSuppliers: () => {
        return DB.safeGet(DB.KEYS.SUPPLIERS, []);
    },
    saveSupplier: (supplier) => {
        const list = DB.getSuppliers();
        const index = list.findIndex(s => s.id === supplier.id);
        if (index >= 0) list[index] = supplier;
        else list.push(supplier);
        localStorage.setItem(DB.KEYS.SUPPLIERS, JSON.stringify(list));
    },
    deleteSupplier: (id) => {
        let list = DB.getSuppliers();
        list = list.filter(s => s.id !== id);
        localStorage.setItem(DB.KEYS.SUPPLIERS, JSON.stringify(list));

        // Cascade delete prices
        let prices = DB.getSupplierPrices();
        prices = prices.filter(p => p.supplierId !== id);
        localStorage.setItem(DB.KEYS.SUPPLIER_PRICES, JSON.stringify(prices));
    },

    // --- Supplier Prices ---
    getSupplierPrices: () => {
        return DB.safeGet(DB.KEYS.SUPPLIER_PRICES, []);
    },
    saveSupplierPrice: (priceData) => { // { supplierId, productId, cost, buyUnit, packSize, buyPrice }
        let list = DB.getSupplierPrices();
        // Remove existing price for this pair if any
        list = list.filter(p => !(p.supplierId === priceData.supplierId && p.productId === priceData.productId));

        // Auto-Calculate Cost Per Unit if Pack data is provided
        if (priceData.buyUnit && priceData.buyUnit !== 'piece') {
            // Ensure numbers
            const price = parseFloat(priceData.buyPrice) || 0;
            const size = parseFloat(priceData.packSize) || 1;
            priceData.cost = size > 0 ? (price / size) : 0;
        } else {
            // Fallback for direct piece cost or updates that pass cost directly
            priceData.cost = parseFloat(priceData.cost) || 0;
            priceData.buyUnit = 'piece';
            priceData.packSize = 1;
            priceData.buyPrice = priceData.cost;
        }

        list.push(priceData);
        localStorage.setItem(DB.KEYS.SUPPLIER_PRICES, JSON.stringify(list));
    },
    deleteSupplierPrice: (supplierId, productId) => {
        let list = DB.getSupplierPrices();
        list = list.filter(p => !(p.supplierId === supplierId && p.productId === productId));
        localStorage.setItem(DB.KEYS.SUPPLIER_PRICES, JSON.stringify(list));
    },
    getPricesBySupplier: (supplierId) => {
        return DB.getSupplierPrices().filter(p => p.supplierId === supplierId);
    },
    getPricesByProduct: (productId) => {
        return DB.getSupplierPrices().filter(p => p.productId === productId);
    },

    // --- Data Backup & Restore ---
    exportData: () => {
        // Collect all Counter Keys (Bill IDs)
        const counters = {};
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('counter_')) {
                counters[key] = localStorage.getItem(key);
            }
        }

        const data = {
            settings: DB.getSettings(), // Include Settings
            products: DB.getProducts(),
            suppliers: DB.getSuppliers(),
            supplierPrices: DB.getSupplierPrices(),
            parkedCarts: DB.getParkedCarts(),
            sales: DB.safeGet(DB.KEYS.SALES, []),
            groupImages: DB.getGroupImages(), // Include Group Images
            counters: counters, // Include Bill Counters
            meta: {
                exportDate: new Date().toISOString(),
                version: '1.1' // Bump internal data version
            }
        };
        return JSON.stringify(data, null, 2);
    },

    importData: (jsonString) => {
        try {
            const data = JSON.parse(jsonString);

            // Validate basic structure
            if (!data.products || !data.meta) {
                throw new Error('ไฟล์ข้อมูลไม่ถูกต้อง (Invalid Data Structure)');
            }

            // Restore Settings if available (Optional for backward compatibility)
            if (data.settings) {
                localStorage.setItem(DB.KEYS.SETTINGS, JSON.stringify(data.settings));
            }

            // Restore Group Images if available
            if (data.groupImages) {
                localStorage.setItem(DB.KEYS.GROUP_IMAGES, JSON.stringify(data.groupImages));
            }

            // Restore Counters if available
            if (data.counters) {
                Object.keys(data.counters).forEach(key => {
                    localStorage.setItem(key, data.counters[key]);
                });
            }

            // Save to LocalStorage
            localStorage.setItem(DB.KEYS.PRODUCTS, JSON.stringify(data.products || []));
            localStorage.setItem(DB.KEYS.SUPPLIERS, JSON.stringify(data.suppliers || []));
            localStorage.setItem(DB.KEYS.SUPPLIER_PRICES, JSON.stringify(data.supplierPrices || []));
            localStorage.setItem(DB.KEYS.PARKED_CARTS, JSON.stringify(data.parkedCarts || []));
            localStorage.setItem(DB.KEYS.SALES, JSON.stringify(data.sales || []));

            return { success: true };
        } catch (e) {
            console.error(e);
            let msg = 'ไฟล์ไม่ถูกต้อง';
            if (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
                msg = 'ความจุเต็ม! (รูปภาพเยอะเกินไป)';
            }
            return { success: false, message: msg };
        }
    }
};

// Initialize DB on load
DB.init();
