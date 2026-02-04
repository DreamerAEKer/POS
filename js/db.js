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
        SETTINGS: 'store_settings'
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
                    stock: 48,
                    image: null
                },
                {
                    id: '8851987123456',
                    barcode: '8851987123456',
                    name: 'มาม่า หมูสับ (60g)',
                    price: 7.00,
                    stock: 12,
                    image: null
                },
                {
                    id: '8852987123456',
                    barcode: '8852987123456',
                    name: 'โค้ก (325ml)',
                    price: 15.00,
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
            phone: ''
        };
        const saved = DB.safeGet(DB.KEYS.SETTINGS, {});
        return { ...defaults, ...saved };
    },

    saveSettings: (newSettings) => {
        const current = DB.getSettings();
        const updated = { ...current, ...newSettings };
        localStorage.setItem(DB.KEYS.SETTINGS, JSON.stringify(updated));
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

    // --- Parked Carts ---
    getParkedCarts: () => {
        return DB.safeGet(DB.KEYS.PARKED_CARTS, []);
    },

    parkCart: (cartItems) => {
        const parked = DB.getParkedCarts();
        parked.push({
            id: Utils.generateId(),
            timestamp: Date.now(),
            items: cartItems
        });
        localStorage.setItem(DB.KEYS.PARKED_CARTS, JSON.stringify(parked));
    },

    retrieveParkedCart: (id) => {
        let parked = DB.getParkedCarts();
        const cart = parked.find(c => c.id === id);
        if (cart) {
            // Remove from parked
            parked = parked.filter(c => c.id !== id);
            localStorage.setItem(DB.KEYS.PARKED_CARTS, JSON.stringify(parked));
            return cart.items;
        }
        return null;
    },

    removeParkedCart: (id) => {
        let parked = DB.getParkedCarts();
        parked = parked.filter(c => c.id !== id);
        localStorage.setItem(DB.KEYS.PARKED_CARTS, JSON.stringify(parked));
    },

    // --- Sales ---
    recordSale: (saleData) => {
        const sales = DB.safeGet(DB.KEYS.SALES, []);
        // Snapshot Store Name for Historical Integrity
        saleData.storeName = DB.getSettings().storeName;
        sales.push(saleData);
        localStorage.setItem(DB.KEYS.SALES, JSON.stringify(sales));
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
        const data = {
            settings: DB.getSettings(), // Include Settings
            products: DB.getProducts(),
            suppliers: DB.getSuppliers(),
            supplierPrices: DB.getSupplierPrices(),
            parkedCarts: DB.getParkedCarts(),
            sales: DB.safeGet(DB.KEYS.SALES, []),
            meta: {
                exportDate: new Date().toISOString(),
                version: '1.0'
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
