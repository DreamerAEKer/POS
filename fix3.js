const fs = require('fs');
let code = fs.readFileSync('C:/Users/Admin/.gemini/antigravity/scratch/POS/js/db.js', 'utf8');

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

// 2. Replace safeGet explicitly
const safeGetOld = `    safeGet: (key, fallback) => {
        try {
            const val = localStorage.getItem(key);
            if (!val || val === 'undefined' || val === 'null') return fallback;
            return JSON.parse(val);
        } catch (e) {
            console.error(\`Error parsing \${key}:\`, e);
            // If data is corrupt, return fallback to prevent crash
            return fallback;
        }
    },`;
const safeGetNew = `    safeGet: (key, fallback) => {
        const val = DB.cache[key];
        return val !== null && val !== undefined ? val : fallback;
    },`;
code = code.replace(safeGetOld, safeGetNew);

// 3. Replace saveToLocalStorage explicitly
const saveOld = `    saveToLocalStorage: (key, data) => {
        try {
            localStorage.setItem(key, JSON.stringify(data));
            return true;
        } catch (e) {
            console.error(\`Error saving \${key} to LocalStorage:\`, e);
            if (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
                if (typeof App !== 'undefined' && App.alert) {
                    App.alert('⚠️ พื้นที่เต็ม! ไม่สามารถบันทึกข้อมูลเพิ่มได้\\n\\nสาเหตุ: รูปภาพสินค้ามีขนาดใหญ่หรือจำนวนมากเกินไป\\nทางแก้: กรุณาไปที่หน้า "ตั้งค่า" แล้วกดปุ่ม "ขยายพื้นที่จัดเก็บ"');
                }
            }
            return false;
        }
    },`;
const saveNew = `    saveToLocalStorage: (key, data) => {
        DB.cache[key] = data;
        localforage.setItem(key, data).catch(e => console.error("Save error:", e));
        return true;
    },`;
code = code.replace(saveOld, saveNew);

// 4. Replace init start explicitly
const initOldStart = `    init: () => {
        // Safe check using new helper
        const products = DB.safeGet(DB.KEYS.PRODUCTS, null);

        if (!products || products.length === 0) {`;

const initNewStart = `    init: async () => {
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

        if (!DB.cache[DB.KEYS.PRODUCTS] || DB.cache[DB.KEYS.PRODUCTS].length === 0) {`;
code = code.replace(initOldStart, initNewStart);

// At the end of init(), replace localStorage.setItem
code = code.replace("localStorage.setItem(DB.KEYS.PRODUCTS, JSON.stringify(mockProducts));", "DB.cache[DB.KEYS.PRODUCTS] = mockProducts; await localforage.setItem(DB.KEYS.PRODUCTS, mockProducts);");

// 5. Replace other localStorage.setItems
code = code.replace(/localStorage\.setItem\((DB\.KEYS\.[A-Z_]+), JSON\.stringify\((.*?)\)\);/g, 'DB.saveToLocalStorage($1, $2);');
code = code.replace(/localStorage\.setItem\('store_parked_trash', JSON\.stringify\((.*?)\)\);/g, "DB.saveToLocalStorage('store_parked_trash', $1);");

// 6. Fix removeItem
code = code.replace(/localStorage\.removeItem\((DB\.KEYS\.[A-Z_]+)\);/g, 'DB.cache[$1] = null; localforage.removeItem($1);');
code = code.replace(/localStorage\.removeItem\('store_parked_trash'\);/g, "DB.cache['store_parked_trash'] = null; localforage.removeItem('store_parked_trash');");

// 7. Fix DB.init() call at bottom
code = code.replace('DB.init();', '// DB.init() is now async and called from App.init()');

// 8. Fix importData
let importStartIdx = code.indexOf('    importData: async');
let importEndIdx = code.lastIndexOf('}'); // End of module
let importCodeOld = code.substring(importStartIdx, importEndIdx);

let importCodeNew = `    importData: async (jsonString, onProgress) => {
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
    }
`;

code = code.substring(0, importStartIdx) + importCodeNew + '\n};';

fs.writeFileSync('C:/Users/Admin/.gemini/antigravity/scratch/POS/js/db.js', code);
