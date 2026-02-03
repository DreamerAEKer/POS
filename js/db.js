/**
 * Database Manager (LocalStorage)
 * Global 'DB' object
 */

const DB = {
    KEYS: {
        PRODUCTS: 'store_products',
        PARKED_CARTS: 'store_parked_carts',
        SALES: 'store_sales'
    },

    // Initial Mock Data
    init: () => {
        if (!localStorage.getItem(DB.KEYS.PRODUCTS)) {
            const mockProducts = [
                {
                    id: '8850987123456', // Mock Barcode
                    barcode: '8850987123456',
                    name: 'ไวไว ปรุงสำเร็จ (60g)',
                    price: 6.00,
                    stock: 48,
                    image: null // Placeholder handled in UI
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
                    stock: 3, // Low stock test
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
            console.log('Mock Data Initialized');
        }
    },

    // --- Products ---
    getProducts: () => {
        return JSON.parse(localStorage.getItem(DB.KEYS.PRODUCTS) || '[]');
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

    getProductByBarcode: (barcode) => {
        const products = DB.getProducts();
        return products.find(p => p.barcode === barcode);
    },

    deleteProduct: (id) => {
        let products = DB.getProducts();
        products = products.filter(p => p.id !== id);
        localStorage.setItem(DB.KEYS.PRODUCTS, JSON.stringify(products));
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
        return JSON.parse(localStorage.getItem(DB.KEYS.PARKED_CARTS) || '[]');
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
        const sales = JSON.parse(localStorage.getItem(DB.KEYS.SALES) || '[]');
        sales.push(saleData);
        localStorage.setItem(DB.KEYS.SALES, JSON.stringify(sales));
    },
    // --- Data Backup & Restore ---
    exportData: () => {
        const data = {
            products: DB.getProducts(),
            suppliers: DB.getSuppliers(),
            supplierPrices: DB.getSupplierPrices(),
            parkedCarts: DB.getParkedCarts(),
            sales: JSON.parse(localStorage.getItem(DB.KEYS.SALES) || '[]'),
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

            // Save to LocalStorage
            localStorage.setItem(DB.KEYS.PRODUCTS, JSON.stringify(data.products || []));
            localStorage.setItem(DB.KEYS.SUPPLIERS, JSON.stringify(data.suppliers || []));
            localStorage.setItem(DB.KEYS.SUPPLIER_PRICES, JSON.stringify(data.supplierPrices || []));
            localStorage.setItem(DB.KEYS.PARKED_CARTS, JSON.stringify(data.parkedCarts || []));
            localStorage.setItem(DB.KEYS.SALES, JSON.stringify(data.sales || []));

            return true;
        } catch (e) {
            console.error(e);
            return false;
        }
    }
};

// Initialize DB on load
DB.init();
