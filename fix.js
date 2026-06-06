const fs = require('fs');
let code = fs.readFileSync('C:/Users/Admin/.gemini/antigravity/scratch/db_backup.js', 'utf8');

// 1. Add DB.cache
code = code.replace('KEYS: {', `cache: {
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

    KEYS: {`);

// 2. Replace safeGet
code = code.replace(/safeGet: \(\w+, \w+\) => \{[\s\S]*?\},/, `safeGet: (key, fallback) => {
        const val = DB.cache[key];
        return val !== null && val !== undefined ? val : fallback;
    },`);

// 3. Replace saveToLocalStorage
code = code.replace(/saveToLocalStorage: \(\w+, \w+\) => \{[\s\S]*?return false;\n        \}\n    \},/, `saveToLocalStorage: (key, data) => {
        DB.cache[key] = data;
        localforage.setItem(key, data).catch(e => console.error("Save error:", e));
        return true;
    },`);

// 4. Replace init (first part of init)
let initStart = code.indexOf('init: () => {');
let initEnd = code.indexOf('},', initStart);
let newInit = `init: async () => {
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
                {id: '8850987123456', barcode: '8850987123456', name: 'ไวไว', price: 6, cost: 4.5, stock: 48},
                {id: '8851987123456', barcode: '8851987123456', name: 'มาม่า', price: 7, cost: 5.25, stock: 12}
            ];
            DB.cache[DB.KEYS.PRODUCTS] = mockProducts;
            await localforage.setItem(DB.KEYS.PRODUCTS, mockProducts);
        }
    `;
code = code.substring(0, initStart) + newInit + code.substring(initEnd);

// 5. Replace localStorage.setItem calls globally for basic sets
code = code.replace(/localStorage\.setItem\((DB\.KEYS\.[A-Z_]+), JSON\.stringify\((.*?)\)\);/g, 'DB.saveToLocalStorage($1, $2);');
code = code.replace(/localStorage\.setItem\('store_parked_trash', JSON\.stringify\((.*?)\)\);/g, "DB.saveToLocalStorage('store_parked_trash', $1);");

// 6. Fix removeItem
code = code.replace(/localStorage\.removeItem\((DB\.KEYS\.[A-Z_]+)\);/g, 'DB.cache[$1] = null; localforage.removeItem($1);');
code = code.replace(/localStorage\.removeItem\('store_parked_trash'\);/g, "DB.cache['store_parked_trash'] = null; localforage.removeItem('store_parked_trash');");

// 7. Fix DB.init() call at bottom
code = code.replace('DB.init();', '// DB.init() is now async and called from App.init()');

// 8. Fix importData
code = code.replace(/importData: async[\s\S]*?return \{ success: true \};\n        \} catch \(e\) \{[\s\S]*?return \{ success: false, message: msg \};\n        \}\n    \}/, `importData: async (jsonString) => {
        try {
            const data = JSON.parse(jsonString);
            if (!data.products) throw new Error('Invalid Data');
            if (data.settings) DB.saveToLocalStorage(DB.KEYS.SETTINGS, data.settings);
            if (data.groupImages) DB.saveToLocalStorage(DB.KEYS.GROUP_IMAGES, data.groupImages);
            if (data.counters) {
                Object.keys(data.counters).forEach(key => localStorage.setItem(key, data.counters[key]));
            }
            DB.saveToLocalStorage(DB.KEYS.PRODUCTS, data.products || []);
            DB.saveToLocalStorage(DB.KEYS.SUPPLIERS, data.suppliers || []);
            DB.saveToLocalStorage(DB.KEYS.SUPPLIER_PRICES, data.supplierPrices || []);
            DB.saveToLocalStorage(DB.KEYS.PARKED_CARTS, data.parkedCarts || []);
            DB.saveToLocalStorage(DB.KEYS.SALES, data.sales || []);
            return { success: true };
        } catch (e) {
            return { success: false, message: 'ไฟล์ไม่ถูกต้องหรือระบบขัดข้อง' };
        }
    }`);

fs.writeFileSync('C:/Users/Admin/.gemini/antigravity/scratch/POS/js/db.js', code);
