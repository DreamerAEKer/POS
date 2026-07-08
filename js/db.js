/**
 * Database Manager (LocalStorage)
 * Global 'DB' object
 */

// ==========================================
// FIREBASE CONFIGURATION (REPLACE WITH YOURS)
// ==========================================
const firebaseConfig = {
    apiKey: "AIzaSyD3Oj1vPVMtxuf8A5BLtZqJEMkHqSDq-hE",
    authDomain: "posgoldheng.firebaseapp.com",
    projectId: "posgoldheng",
    storageBucket: "posgoldheng.firebasestorage.app",
    messagingSenderId: "667752406777",
    appId: "1:667752406777:web:1eba014d1222082e3e0c28",
    measurementId: "G-P1FF8V2L3C"
};

// Initialize Firebase
let firebaseApp, auth, dbFirestore;
try {
    if (typeof firebase !== 'undefined') {
        firebaseApp = firebase.initializeApp(firebaseConfig);
        auth = firebase.auth();
        dbFirestore = firebase.firestore();
        // Enable offline persistence
        dbFirestore.enablePersistence().catch((err) => {
            console.warn("Firestore Persistence Error:", err);
        });
    }
} catch (e) {
    console.error("Firebase Init Error", e);
}

const DB = {
    cache: {
        store_products: null,
        store_parked_carts: null,
        store_sales: null,
        store_suppliers: null,
        store_suppliers_prices: null,
        store_settings: null,
        store_group_images: null,
        store_payment_prefs: null,
        store_tables: null,
        store_auto_cart: null,
        store_parked_trash: null
    },

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

    // New: Helper for safe saving with Quota Check
    saveToLocalStorage: (key, data) => {
        DB.cache[key] = data;
        localforage.setItem(key, data).catch(e => console.error("Save error:", e));
        return true;
    },

    // --- Firebase Auth ---
    currentUser: null,
    login: async (email, password) => {
        try {
            const userCredential = await auth.signInWithEmailAndPassword(email, password);
            DB.currentUser = userCredential.user;
            return { success: true, user: userCredential.user };
        } catch (error) {
            return { success: false, message: error.message };
        }
    },
    logout: async () => {
        if(auth) await auth.signOut();
        DB.currentUser = null;
    },
    onAuthStateChanged: (callback) => {
        if (auth) {
            auth.onAuthStateChanged(async (user) => {
                DB.currentUser = user;
                DB.userRole = 'staff'; // Default role
                if (user && dbFirestore) {
                    try {
                        // Check if user is in 'admins' collection
                        const adminDoc = await dbFirestore.collection('admins').doc(user.email).get();
                        if (adminDoc.exists) {
                            DB.userRole = 'admin';
                        }
                    } catch (e) {
                        console.error("Role fetch error:", e);
                    }
                }
                callback(user);
            });
        }
    },

    // Initial Mock Data
    init: async () => {
        const isMigrated = localStorage.getItem('migrated_to_idb');
        if (!isMigrated) {
            console.log("Migrating data to IndexedDB...");
            const keysToMigrate = Object.values(DB.KEYS).concat(['store_parked_trash']);
            for (let key of keysToMigrate) {
                const val = localStorage.getItem(key);
                if (val) {
                    try { await localforage.setItem(key, JSON.parse(val)); } catch (e) {}
                }
            }
            localStorage.setItem('migrated_to_idb', 'true');
        }

        const keysToLoad = Object.values(DB.KEYS).concat(['store_parked_trash']);
        for (let key of keysToLoad) {
            DB.cache[key] = await localforage.getItem(key);
        }

        if (!DB.cache[DB.KEYS.PRODUCTS] || DB.cache[DB.KEYS.PRODUCTS].length === 0) {
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
            DB.cache[DB.KEYS.PRODUCTS] = mockProducts;
            await localforage.setItem(DB.KEYS.PRODUCTS, mockProducts);
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
            printerFeedLines: 5,  // New: Paper feed length
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
        DB.saveToLocalStorage(DB.KEYS.SETTINGS, updated);
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
        DB.saveToLocalStorage(DB.KEYS.PAYMENT_PREFS, updated);
    },

    // --- Tables ---
    getTables: () => {
        let tables = DB.safeGet(DB.KEYS.TABLES, null);
        if (!tables || tables.length === 0) {
            tables = [
                { id: 1, name: 'โต๊ะ 1', billId: null },
                { id: 2, name: 'โต๊ะ 2', billId: null },
                { id: 3, name: 'โต๊ะ 3', billId: null },
                { id: 4, name: 'โต๊ะ 4', billId: null }
            ];
            DB.saveToLocalStorage(DB.KEYS.TABLES, tables);
        }
        return tables;
    },

    saveTables: (tables) => {
        DB.saveToLocalStorage(DB.KEYS.TABLES, tables);
    },

    addTable: (name) => {
        const tables = DB.getTables();
        const maxId = tables.reduce((max, t) => Math.max(max, t.id), 0);
        tables.push({ id: maxId + 1, name: name, billId: null });
        DB.saveTables(tables);
    },

    deleteTable: (id) => {
        let tables = DB.getTables();
        const tIndex = tables.findIndex(t => t.id === id);
        if (tIndex > -1 && tables[tIndex].billId === null) {
            tables.splice(tIndex, 1);
            DB.saveTables(tables);
            return true;
        }
        return false; // Cannot delete if occupied or not found
    },

    // --- APPROVAL SYSTEM ---
    addPendingApproval: async (type, data) => {
        if (typeof dbFirestore === 'undefined' || !dbFirestore || !DB.currentUser) return false;
        try {
            const id = Date.now().toString();
            await dbFirestore.collection('pending_approvals').doc(id).set({
                id: id,
                type: type, // e.g. 'EDIT_PRICE', 'ADD_PRODUCT'
                data: data,
                requestedBy: DB.currentUser.email,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
            return true;
        } catch (e) {
            console.error("Error sending approval:", e);
            return false;
        }
    },

    // --- Group Images ---
    getGroupImages: () => {
        return DB.safeGet(DB.KEYS.GROUP_IMAGES, {});
    },

    setGroupImage: (groupName, base64) => {
        const images = DB.getGroupImages();
        images[groupName] = base64;
        DB.saveToLocalStorage(DB.KEYS.GROUP_IMAGES, images);
    },

    removeGroupImage: (groupName) => {
        const images = DB.getGroupImages();
        delete images[groupName];
        DB.saveToLocalStorage(DB.KEYS.GROUP_IMAGES, images);
    },

    validatePin: (inputPin) => {
        const settings = DB.getSettings();
        return settings.pin === inputPin;
    },

    // --- Products ---
    syncProductsFromFirebase: async () => {
        if (!dbFirestore) return;
        try {
            const snapshot = await dbFirestore.collection('products').get();
            const products = [];
            snapshot.forEach(doc => {
                products.push({ id: doc.id, ...doc.data() });
            });
            if (products.length > 0) {
                DB.saveProducts(products);
                // Automatically update App state if loaded
                if (typeof App !== 'undefined' && App.state) {
                    App.state.products = products;
                }
            }
        } catch (e) {
            console.error("Error syncing products from Firebase:", e);
        }
    },

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

        // --- FIREBASE AUTO-SYNC ---
        if (typeof dbFirestore !== 'undefined' && dbFirestore && DB.currentUser) {
            dbFirestore.collection('products').doc(product.id.toString()).set(product)
                .catch(err => console.error("Firebase sync error:", err));
        }

        return DB.saveToLocalStorage(DB.KEYS.PRODUCTS, products);
    },

    saveProducts: (productsArray) => {
        return DB.saveToLocalStorage(DB.KEYS.PRODUCTS, productsArray);
    },

    // New: Batch recompress all images to free up space
    recompressAllProducts: async (progressCallback) => {
        const products = DB.getProducts();
        let changedCount = 0;
        
        for (let i = 0; i < products.length; i++) {
            if (products[i].image && products[i].image.startsWith('data:image')) {
                try {
                    const originalSize = products[i].image.length;
                    // Shrink to 200px width, 0.5 quality
                    const newImage = await Utils.compressImage(products[i].image, 200, 0.5);
                    
                    if (newImage.length < originalSize) {
                        products[i].image = newImage;
                        changedCount++;
                    }
                } catch (err) {
                    console.warn(`Failed to compress image for product ${products[i].id}`, err);
                }
            }
            if (progressCallback) progressCallback(i + 1, products.length);
        }
        
        if (changedCount > 0) {
            DB.saveProducts(products);
        }
        return changedCount;
    },

    deleteProduct: (id) => {
        let products = DB.getProducts();
        products = products.filter(p => p.id !== id);

        // --- FIREBASE AUTO-SYNC ---
        if (typeof dbFirestore !== 'undefined' && dbFirestore && DB.currentUser) {
            dbFirestore.collection('products').doc(id.toString()).delete()
                .catch(err => console.error("Firebase sync error:", err));
        }

        DB.saveToLocalStorage(DB.KEYS.PRODUCTS, products);
    },

    getProductByBarcode: (barcode) => {
        const products = DB.getProducts();
        // Return object indicating if it matched the main barcode or the pack barcode
        const mainMatch = products.find(p => p.barcode === barcode);
        if (mainMatch) return { product: mainMatch, isPack: false };

        const packMatch = products.find(p => p.packBarcode === barcode);
        if (packMatch) return { product: packMatch, isPack: true };

        return null;
    },

    updateStock: (id, quantityChange) => {
        const products = DB.getProducts();
        const product = products.find(p => p.id === id);
        if (product) {
            product.stock -= quantityChange;
            DB.saveToLocalStorage(DB.KEYS.PRODUCTS, products);
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

    // --- Auto-Save Cart ---
    saveAutoCart: (cartState) => {
        DB.saveToLocalStorage(DB.KEYS.AUTO_CART, cartState);
    },
    getAutoCart: () => {
        return DB.safeGet(DB.KEYS.AUTO_CART, null);
    },
    clearAutoCart: () => {
        DB.cache[DB.KEYS.AUTO_CART] = null; localforage.removeItem(DB.KEYS.AUTO_CART);
    },

    // --- Parked Carts ---
    getParkedCarts: () => {
        // Sort by Timestamp ASC (First In - Top)
        return DB.safeGet(DB.KEYS.PARKED_CARTS, []).sort((a, b) => a.timestamp - b.timestamp);
    },

    getParkedTrash: () => {
        return DB.safeGet('store_parked_trash', []); // New Key
    },

    parkCart: (cartItems, note = '', customTimestamp = null, customId = null, deliveryTime = null, deliveryDetails = null) => {
        const parked = DB.getParkedCarts();

        const existingIndex = customId ? parked.findIndex(p => p.id === customId) : -1;

        if (existingIndex > -1) {
            // Update existing parked cart instead of pushing a duplicate
            parked[existingIndex] = {
                ...parked[existingIndex],
                timestamp: customTimestamp || parked[existingIndex].timestamp,
                note: note || parked[existingIndex].note,
                deliveryTime: deliveryTime || parked[existingIndex].deliveryTime,
                deliveryDetails: deliveryDetails || parked[existingIndex].deliveryDetails,
                items: cartItems
            };
        } else {
            // LIMIT CHECK: Maintain max 20 items
            if (parked.length >= 20) {
                const oldest = parked.shift(); // Remove oldest cart

                let trash = DB.getParkedTrash();
                trash.push(oldest);
                // Sort Newest First (Descending)
                trash.sort((a, b) => b.timestamp - a.timestamp);
                
                // Keep max 20 items in trash
                if (trash.length > 20) {
                    // Alert user if App is loaded (Since DB doesn't have UI context directly)
                    if (typeof App !== 'undefined' && App.alert) {
                        App.alert('ถังขยะเต็ม! รายการที่เก่าที่สุดจะถูกลบถาวร');
                    }
                    trash = trash.slice(0, 20); // Keep top 20 newest
                }
                DB.saveToLocalStorage('store_parked_trash', trash);
            }

            parked.push({
                id: customId || DB.generateBillId(),
                timestamp: customTimestamp || Date.now(),
                note: note,
                deliveryTime: deliveryTime,
                deliveryDetails: deliveryDetails,
                items: cartItems
            });
        }
        DB.saveToLocalStorage(DB.KEYS.PARKED_CARTS, parked);
    },

    updateParkedNote: (id, newNote) => {
        const parked = DB.getParkedCarts();
        const item = parked.find(c => c.id === id);
        if (item) {
            item.note = newNote;
            DB.saveToLocalStorage(DB.KEYS.PARKED_CARTS, parked);
        }
    },

    retrieveParkedCart: (id) => {
        const parked = DB.getParkedCarts();
        const cartIndex = parked.findIndex(c => c.id === id);
        if (cartIndex > -1) {
            const cart = parked[cartIndex];
            // Remove from parked
            parked.splice(cartIndex, 1);
            DB.saveToLocalStorage(DB.KEYS.PARKED_CARTS, parked);
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
            
            // Limit to 20
            if (trash.length > 20) {
                 if (typeof App !== 'undefined' && App.alert) {
                     App.alert('ถังขยะเต็ม! รายการที่เก่าที่สุดจะถูกลบถาวร');
                 }
                 trash = trash.slice(0, 20);
            }
            DB.saveToLocalStorage('store_parked_trash', trash);

            // Remove from Active
            const newParked = parked.filter(c => c.id !== id);
            DB.saveToLocalStorage(DB.KEYS.PARKED_CARTS, newParked);
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
            DB.saveToLocalStorage(DB.KEYS.PARKED_CARTS, parked);

            // Remove from Trash
            trash.splice(itemIndex, 1);
            DB.saveToLocalStorage('store_parked_trash', trash);
        }
    },

    deleteParkedTrashItem: (id) => {
        let trash = DB.getParkedTrash();
        trash = trash.filter(c => c.id !== id);
        DB.saveToLocalStorage('store_parked_trash', trash);
    },

    clearParkedTrash: () => {
        DB.cache['store_parked_trash'] = null; localforage.removeItem('store_parked_trash');
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
                DB.saveToLocalStorage(DB.KEYS.SALES, sales);
                return;
            }
        } else {
            saleData.billId = DB.generateBillId();
        }

        // Snapshot Store Name for Historical Integrity
        saleData.storeName = DB.getSettings().storeName;
        sales.push(saleData);
        DB.saveToLocalStorage(DB.KEYS.SALES, sales);
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
            DB.saveToLocalStorage(DB.KEYS.SALES, sales);
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
        DB.saveToLocalStorage(DB.KEYS.SUPPLIERS, list);
    },
    deleteSupplier: (id) => {
        let list = DB.getSuppliers();
        list = list.filter(s => s.id !== id);
        DB.saveToLocalStorage(DB.KEYS.SUPPLIERS, list);

        // Cascade delete prices
        let prices = DB.getSupplierPrices();
        prices = prices.filter(p => p.supplierId !== id);
        DB.saveToLocalStorage(DB.KEYS.SUPPLIER_PRICES, prices);
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

    importData: async (jsonString) => {
        try {
            const data = JSON.parse(jsonString);
            if (!data.products) throw new Error('Invalid Data');
            
            // --- Helper: Smart Merge Array of Objects by ID ---
            const mergeById = (existingArr, importedArr) => {
                if (!existingArr) existingArr = [];
                if (!importedArr || importedArr.length === 0) return existingArr;
                
                const map = new Map();
                // 1. Put all existing items into map
                existingArr.forEach(item => {
                    if(item && item.id) map.set(item.id, item);
                });
                // 2. Put all imported items into map (Overwrite existing if IDs match, but KEEP ones that don't match)
                importedArr.forEach(item => {
                    if(item && item.id) map.set(item.id, item);
                });
                return Array.from(map.values());
            };

            // 1. Merge Settings
            if (data.settings) {
                const cur = DB.getSettings() || {};
                DB.saveToLocalStorage(DB.KEYS.SETTINGS, { ...cur, ...data.settings });
            }
            
            // 2. Merge Group Images
            if (data.groupImages) {
                const cur = DB.getGroupImages() || {};
                DB.saveToLocalStorage(DB.KEYS.GROUP_IMAGES, { ...cur, ...data.groupImages });
            }
            
            // 3. Merge Counters (Keep highest value to prevent ID conflicts)
            if (data.counters) {
                Object.keys(data.counters).forEach(key => {
                    const currentVal = parseInt(localStorage.getItem(key) || '0');
                    const importedVal = parseInt(data.counters[key] || '0');
                    localStorage.setItem(key, Math.max(currentVal, importedVal).toString());
                });
            }
            
            // 4. Merge Arrays
            const curProducts = DB.getProducts() || [];
            DB.saveToLocalStorage(DB.KEYS.PRODUCTS, mergeById(curProducts, data.products));
            
            const curSuppliers = DB.getSuppliers() || [];
            DB.saveToLocalStorage(DB.KEYS.SUPPLIERS, mergeById(curSuppliers, data.suppliers));
            
            const curSupplierPrices = DB.safeGet(DB.KEYS.SUPPLIER_PRICES, []) || [];
            if (data.supplierPrices) {
                const spMap = new Map();
                curSupplierPrices.forEach(sp => spMap.set(`${sp.productId}_${sp.supplierId}`, sp));
                data.supplierPrices.forEach(sp => spMap.set(`${sp.productId}_${sp.supplierId}`, sp));
                DB.saveToLocalStorage(DB.KEYS.SUPPLIER_PRICES, Array.from(spMap.values()));
            }

            const curParkedCarts = DB.getParkedCarts() || [];
            DB.saveToLocalStorage(DB.KEYS.PARKED_CARTS, mergeById(curParkedCarts, data.parkedCarts));
            
            const curSales = DB.safeGet(DB.KEYS.SALES, []) || [];
            DB.saveToLocalStorage(DB.KEYS.SALES, mergeById(curSales, data.sales));

            return { success: true };
        } catch (e) {
            console.error('Import Error:', e);
            return { success: false, message: 'ไฟล์ไม่ถูกต้องหรือระบบขัดข้อง' };
        }
    }
};
