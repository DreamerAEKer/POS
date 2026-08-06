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

// Firebase is loaded after the local POS has rendered. This keeps first paint
// independent from mobile network speed while preserving the same auth/session.
let firebaseApp, auth, dbFirestore;
const pendingAuthCallbacks = [];

const DB = {
    STOCK_COLLECTION: 'stock',
    STOCK_CATALOG_FIELDS: [
        'barcode', 'packBarcode', 'name', 'group', 'price', 'cost',
        'image', 'unitsPerBox', 'unitLabel', 'hasBarcode', 'internalCode',
        'parentId', 'packSize', 'wholesaleQty', 'wholesalePrice',
        'thaiChuaiThaiPrice', 'expiryDate', 'tags', 'location', 'entryDate'
    ],
    SHARED_SETTINGS_FIELDS: [
        'storeName', 'address', 'phone', 'printerWidth', 'printerFeedLines',
        'printLogo', 'printQr', 'logo', 'qrCode'
    ],
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
        const p = localforage.setItem(key, data);
        p.catch(e => console.error("Save error:", e));
        return p;
    },

    // --- Firebase Auth ---
    currentUser: null,
    initializeFirebase: () => {
        if (auth && dbFirestore) return true;
        if (typeof firebase === 'undefined') return false;
        try {
            firebaseApp = firebase.apps?.length ? firebase.app() : firebase.initializeApp(firebaseConfig);
            auth = firebase.auth();
            dbFirestore = firebase.firestore();
            dbFirestore.enablePersistence().catch((err) => {
                console.warn("Firestore Persistence Error:", err);
            });
            pendingAuthCallbacks.forEach(callback => DB.attachAuthStateListener(callback));
            return true;
        } catch (e) {
            console.error("Firebase Init Error", e);
            return false;
        }
    },
    attachAuthStateListener: (callback) => {
        if (!auth || callback._firebaseAttached) return;
        callback._firebaseAttached = true;
        auth.onAuthStateChanged(async (user) => {
            DB.currentUser = user;
            DB.userRole = 'staff';
            if (user && dbFirestore) {
                try {
                    const adminDoc = await dbFirestore.collection('admins').doc(user.email).get();
                    if (adminDoc.exists) DB.userRole = 'admin';
                } catch (e) {
                    console.error("Role fetch error:", e);
                }
            }
            callback(user);
        });
    },
    login: async (email, password) => {
        if (!auth) return { success: false, message: 'กำลังเชื่อมต่อระบบ กรุณารอสักครู่แล้วลองอีกครั้ง' };
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
        if (!pendingAuthCallbacks.includes(callback)) pendingAuthCallbacks.push(callback);
        if (auth) DB.attachAuthStateListener(callback);
    },

    // Initial Mock Data
    init: async () => {
        const isMigrated = localStorage.getItem('migrated_to_idb');
        if (!isMigrated) {
            console.log("Migrating data to IndexedDB...");
            const keysToMigrate = Object.values(DB.KEYS).concat(['store_parked_trash']);
            await Promise.all(keysToMigrate.map(async key => {
                const val = localStorage.getItem(key);
                if (!val) return;
                try { await localforage.setItem(key, JSON.parse(val)); } catch (e) {}
            }));
            localStorage.setItem('migrated_to_idb', 'true');
        }

        const keysToLoad = Object.values(DB.KEYS).concat(['store_parked_trash']);
        const loadedValues = await Promise.all(keysToLoad.map(key => localforage.getItem(key)));
        keysToLoad.forEach((key, index) => { DB.cache[key] = loadedValues[index]; });

        // Seed demo data only on a genuinely new database. An intentionally empty
        // product list must stay empty after the next reload.
        if (DB.cache[DB.KEYS.PRODUCTS] === null) {
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

    saveSettings: async (newSettings) => {
        const current = DB.getSettings();
        const updated = { ...current, ...newSettings };
        await DB.saveToLocalStorage(DB.KEYS.SETTINGS, updated);
        const touchesSharedSetting = DB.SHARED_SETTINGS_FIELDS.some(field =>
            Object.prototype.hasOwnProperty.call(newSettings, field)
        );
        if (touchesSharedSetting && DB.currentUser && DB.userRole === 'admin') {
            await DB.syncSharedSettingsToFirebase(updated);
        }
        return updated;
    },

    getSharedSettingsPayload: (settings = DB.getSettings()) => {
        const payload = {};
        DB.SHARED_SETTINGS_FIELDS.forEach(field => {
            if (settings[field] !== undefined) payload[field] = settings[field];
        });
        return payload;
    },

    syncSharedSettingsToFirebase: async (settings = DB.getSettings()) => {
        if (!dbFirestore || !DB.currentUser || DB.userRole !== 'admin') return false;
        const payload = DB.getSharedSettingsPayload(settings);
        await dbFirestore.collection('app_settings').doc('shared').set({
            ...payload,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedBy: DB.currentUser.email
        }, { merge: true });
        return true;
    },

    syncSharedSettingsFromFirebase: async () => {
        if (!dbFirestore || !DB.currentUser) return false;
        try {
            const snapshot = await dbFirestore.collection('app_settings').doc('shared').get();
            if (!snapshot.exists) return false;
            const remote = snapshot.data();
            const current = DB.getSettings();
            const shared = DB.getSharedSettingsPayload(remote);
            await DB.saveToLocalStorage(DB.KEYS.SETTINGS, { ...current, ...shared });
            return true;
        } catch (error) {
            console.error('Firebase settings download error:', error);
            return false;
        }
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
    syncStocksFromFirebase: async () => {
        if (!dbFirestore || !DB.currentUser) return { synced: 0, available: false };
        try {
            const snapshot = await dbFirestore.collection(DB.STOCK_COLLECTION).get();
            if (snapshot.empty) return { synced: 0, available: false };

            const products = DB.getProducts().map(product => ({ ...product }));
            const productsById = new Map(products.map(product => [String(product.id), product]));
            let synced = 0;
            let added = 0;
            const catalogBackfills = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                const productId = String(doc.id);
                let product = productsById.get(productId);
                const stock = Number(data.stock);
                const hasCatalog = typeof data.name === 'string' && data.name.trim() !== '';

                if (!product && hasCatalog) {
                    product = {
                        id: productId,
                        barcode: data.barcode || productId,
                        name: data.name,
                        price: Number(data.price) || 0,
                        stock: Number.isFinite(stock) ? stock : 0,
                        updatedAt: Number(data.catalogUpdatedAt) || Date.now()
                    };
                    Object.assign(product, DB.getStockCatalogPayload(data));
                    products.push(product);
                    productsById.set(productId, product);
                    added++;
                } else if (product && hasCatalog) {
                    const remoteUpdatedAt = Number(data.catalogUpdatedAt) || 0;
                    const localUpdatedAt = Number(product.updatedAt) || 0;
                    if (remoteUpdatedAt >= localUpdatedAt) {
                        Object.assign(product, DB.getStockCatalogPayload(data));
                        product.updatedAt = remoteUpdatedAt || localUpdatedAt;
                    }
                }

                if (product && Number.isFinite(stock)) {
                    product.stock = stock;
                    synced++;
                }

                // One-time migration for stock records created by versions that
                // stored only the quantity. Run only from an administrator's
                // device that already has the complete local catalog.
                if (product && !hasCatalog && DB.userRole === 'admin' && product.name) {
                    catalogBackfills.push(() => doc.ref.set({
                        ...DB.getStockCatalogPayload(product),
                        catalogUpdatedAt: Number(product.updatedAt) || Date.now()
                    }, { merge: true }));
                }
            });

            let backfilled = 0;
            for (let index = 0; index < catalogBackfills.length; index += 20) {
                const results = await Promise.allSettled(
                    catalogBackfills.slice(index, index + 20).map(write => write())
                );
                backfilled += results.filter(result => result.status === 'fulfilled').length;
            }
            if (synced > 0 || added > 0) {
                await DB.saveProducts(products);
                if (typeof App !== 'undefined' && App.state) {
                    App.state.products = products;
                }
            }
            return { synced, added, backfilled, available: true };
        } catch (e) {
            console.error("Error syncing stock from Firebase:", e);
            return { synced: 0, available: false, error: e };
        }
    },

    getProducts: () => {
        return DB.safeGet(DB.KEYS.PRODUCTS, []);
    },

    getStockCatalogPayload: (product) => {
        const payload = {};
        DB.STOCK_CATALOG_FIELDS.forEach(field => {
            if (product[field] !== undefined) payload[field] = product[field];
        });
        return payload;
    },

    saveProduct: (product) => {
        const products = DB.getProducts();
        const existingIndex = products.findIndex(p => p.id === product.id);

        if (existingIndex >= 0) {
            products[existingIndex] = product;
        } else {
            products.push(product);
        }

        // Keep each stock item usable on every signed-in device. Sales, bills,
        // supplier data and other POS records remain local to the device.
        if (typeof dbFirestore !== 'undefined' && dbFirestore && DB.currentUser) {
            const stock = Number(product.stock);
            if (Number.isFinite(stock)) {
                dbFirestore.collection(DB.STOCK_COLLECTION).doc(product.id.toString()).set({
                    ...DB.getStockCatalogPayload(product),
                    stock,
                    catalogUpdatedAt: Number(product.updatedAt) || Date.now(),
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                }, { merge: true }).catch(err => console.error("Firebase stock sync error:", err));
            }
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

        // Keep the cloud stock record as a recovery trail. It can be cleaned
        // up explicitly by an administrator after catalog deletion is verified.
        DB.saveToLocalStorage(DB.KEYS.PRODUCTS, products);
    },

    getProductByBarcode: (barcode) => {
        const products = DB.getProducts();
        // Return object indicating if it matched the main barcode or the pack barcode
        const mainMatch = products.find(p => p.hasBarcode !== false && p.barcode === barcode);
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
                return DB.saveToLocalStorage(DB.KEYS.SALES, sales);
            }
        } else {
            saleData.billId = DB.generateBillId();
        }

        // Snapshot Store Name for Historical Integrity
        saleData.storeName = DB.getSettings().storeName;
        sales.push(saleData);
        return DB.saveToLocalStorage(DB.KEYS.SALES, sales);
    },

    // Persist stock and sale before the UI clears the cart. When signed in,
    // stock changes are committed to Firestore with an idempotent operation
    // record so a retried checkout cannot deduct stock twice.
    commitSale: async (saleData, cartItems) => {
        const originalProducts = DB.getProducts();
        const nextProducts = originalProducts.map(product => ({ ...product }));
        for (const item of cartItems) {
            const productId = item.parentId && item.packSize ? item.parentId : item.id;
            const quantity = item.parentId && item.packSize ? item.qty * item.packSize : item.qty;
            const product = nextProducts.find(candidate => candidate.id === productId);
            if (product) product.stock -= quantity;
        }

        const originalSales = DB.safeGet(DB.KEYS.SALES, []);
        const nextSales = originalSales.map(sale => ({ ...sale }));
        const committedSale = { ...saleData };
        if (!committedSale.billId) committedSale.billId = DB.generateBillId();
        committedSale.storeName = committedSale.storeName || DB.getSettings().storeName;
        const existingIndex = nextSales.findIndex(sale => sale.billId === committedSale.billId);
        if (existingIndex >= 0) nextSales[existingIndex] = { ...nextSales[existingIndex], ...committedSale };
        else nextSales.push(committedSale);

        const stockChanges = new Map();
        for (const item of cartItems) {
            const productId = String(item.parentId && item.packSize ? item.parentId : item.id);
            const multiplier = item.parentId && item.packSize ? item.packSize : 1;
            const soldQty = item.qty * multiplier;
            const originalQty = item.originalQty === undefined ? 0 : item.originalQty * multiplier;
            stockChanges.set(productId, (stockChanges.get(productId) || 0) + soldQty - originalQty);
        }

        await DB.saveToLocalStorage(DB.KEYS.PRODUCTS, nextProducts);
        try {
            await DB.saveToLocalStorage(DB.KEYS.SALES, nextSales);

            if (dbFirestore && DB.currentUser) {
                const operationRef = dbFirestore.collection('stock_operations').doc(committedSale.billId);
                const cloudStocks = await dbFirestore.runTransaction(async transaction => {
                    const operationSnapshot = await transaction.get(operationRef);
                    if (operationSnapshot.exists) return operationSnapshot.data().stocks || {};

                    const entries = Array.from(stockChanges.entries()).filter(([, change]) => change !== 0);
                    const snapshots = await Promise.all(entries.map(([productId]) =>
                        transaction.get(dbFirestore.collection(DB.STOCK_COLLECTION).doc(productId))
                    ));
                    const stocks = {};
                    entries.forEach(([productId, change], index) => {
                        const snapshot = snapshots[index];
                        if (!snapshot.exists) throw new Error(`ไม่พบสินค้า ${productId} บน Firebase`);
                        const currentStock = Number(snapshot.data().stock || 0);
                        const nextStock = currentStock - change;
                        stocks[productId] = nextStock;
                        transaction.update(snapshot.ref, { stock: nextStock, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
                    });
                    transaction.set(operationRef, {
                        billId: committedSale.billId,
                        stocks,
                        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                        createdBy: DB.currentUser.email
                    });
                    return stocks;
                });

                Object.entries(cloudStocks).forEach(([productId, stock]) => {
                    const localProduct = nextProducts.find(product => String(product.id) === productId);
                    if (localProduct) localProduct.stock = stock;
                });
                await DB.saveToLocalStorage(DB.KEYS.PRODUCTS, nextProducts);
            }
        } catch (error) {
            try { await DB.saveToLocalStorage(DB.KEYS.PRODUCTS, originalProducts); } catch (_) {}
            try { await DB.saveToLocalStorage(DB.KEYS.SALES, originalSales); } catch (_) { DB.cache[DB.KEYS.SALES] = originalSales; }
            throw error;
        }
        return committedSale;
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
            settings: (() => {
                const { pin, ...safeSettings } = DB.getSettings();
                return safeSettings; // Never place the security PIN in a portable backup.
            })(),
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

    validateImportData: (data) => {
        if (!data || !Array.isArray(data.products)) throw new Error('Backup must contain a products array');
        if (data.products.length > 10000) throw new Error('Backup contains too many products');

        const ids = new Set();
        const barcodes = new Set();
        data.products.forEach((product, index) => {
            if (!product || typeof product !== 'object') throw new Error(`Invalid product at row ${index + 1}`);
            const id = String(product.id || '').trim();
            const name = String(product.name || '').trim();
            const barcode = String(product.barcode || '').trim();
            const stock = Number(product.stock);
            const price = Number(product.price);
            if (!id || !name || !barcode) throw new Error(`Missing required product data at row ${index + 1}`);
            if (!Number.isFinite(stock) || stock < 0) throw new Error(`Invalid stock for barcode ${barcode}`);
            if (!Number.isFinite(price) || price < 0) throw new Error(`Invalid price for barcode ${barcode}`);
            if (ids.has(id)) throw new Error(`Duplicate product ID ${id}`);
            if (barcodes.has(barcode)) throw new Error(`Duplicate barcode ${barcode}`);
            ids.add(id);
            barcodes.add(barcode);
        });
        return true;
    },

    importData: async (jsonString) => {
        try {
            const data = JSON.parse(jsonString);
            let correctedStocks = 0;
            let internalBarcodeProducts = 0;
            if (Array.isArray(data.products)) {
                data.products.forEach(product => {
                    const stock = Number(product && product.stock);
                    if (!product || product.stock === null || product.stock === undefined || product.stock === '' || !Number.isFinite(stock) || stock < 0) {
                        if (product) product.stock = 0;
                        correctedStocks++;
                    }
                    if (!product) return;
                    const barcode = String(product.barcode || '').trim();
                    const generatedManualCode = /^M\d{8}$/.test(barcode) && String(product.id) === barcode;
                    if (!barcode) {
                        product.barcode = `INTERNAL-${String(product.id || Utils.generateId())}`;
                        product.internalCode = product.barcode;
                        product.hasBarcode = false;
                        internalBarcodeProducts++;
                    } else if (generatedManualCode) {
                        product.internalCode = barcode;
                        product.hasBarcode = false;
                        internalBarcodeProducts++;
                    } else if (product.hasBarcode === undefined) {
                        product.hasBarcode = true;
                    }
                });
            }
            DB.validateImportData(data);
            await localforage.setItem('store_pre_import_recovery', JSON.parse(DB.exportData()));
            
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
                await DB.saveToLocalStorage(DB.KEYS.SETTINGS, { ...cur, ...data.settings });
            }
            
            // 2. Merge Group Images
            if (data.groupImages) {
                const cur = DB.getGroupImages() || {};
                await DB.saveToLocalStorage(DB.KEYS.GROUP_IMAGES, { ...cur, ...data.groupImages });
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
            await DB.saveToLocalStorage(DB.KEYS.PRODUCTS, mergeById(curProducts, data.products));
            
            const curSuppliers = DB.getSuppliers() || [];
            await DB.saveToLocalStorage(DB.KEYS.SUPPLIERS, mergeById(curSuppliers, data.suppliers));
            
            const curSupplierPrices = DB.safeGet(DB.KEYS.SUPPLIER_PRICES, []) || [];
            if (data.supplierPrices) {
                const spMap = new Map();
                curSupplierPrices.forEach(sp => spMap.set(`${sp.productId}_${sp.supplierId}`, sp));
                data.supplierPrices.forEach(sp => spMap.set(`${sp.productId}_${sp.supplierId}`, sp));
                await DB.saveToLocalStorage(DB.KEYS.SUPPLIER_PRICES, Array.from(spMap.values()));
            }

            const curParkedCarts = DB.getParkedCarts() || [];
            await DB.saveToLocalStorage(DB.KEYS.PARKED_CARTS, mergeById(curParkedCarts, data.parkedCarts));
            
            const curSales = DB.safeGet(DB.KEYS.SALES, []) || [];
            await DB.saveToLocalStorage(DB.KEYS.SALES, mergeById(curSales, data.sales));

            return { success: true, correctedStocks, internalBarcodeProducts };
        } catch (e) {
            console.error('Import Error:', e);
            return { success: false, message: e.message || 'ไฟล์ไม่ถูกต้องหรือระบบขัดข้อง' };
        }
    }
};

if (typeof module !== 'undefined' && module.exports) module.exports = DB;
