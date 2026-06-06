import sys

with open('js/db.js', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add DB.cache
content = content.replace("    KEYS: {", """    cache: {
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

    KEYS: {""")

# 2. safeGet
old_safeGet = """    safeGet: (key, fallback) => {
        try {
            const val = localStorage.getItem(key);
            if (!val || val === 'undefined' || val === 'null') return fallback;
            return JSON.parse(val);
        } catch (e) {
            console.error(`Error parsing ${key}:`, e);
            // If data is corrupt, return fallback to prevent crash
            return fallback;
        }
    },"""
new_safeGet = """    safeGet: (key, fallback) => {
        const val = DB.cache[key];
        return val !== null && val !== undefined ? val : fallback;
    },"""
content = content.replace(old_safeGet, new_safeGet)

# 3. saveToLocalStorage
old_save = """    saveToLocalStorage: (key, data) => {
        try {
            localStorage.setItem(key, JSON.stringify(data));
            return true;
        } catch (e) {
            console.error(`Error saving ${key} to LocalStorage:`, e);
            if (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
                if (typeof App !== 'undefined' && App.alert) {
                    App.alert('⚠️ พื้นที่เต็ม! ไม่สามารถบันทึกข้อมูลเพิ่มได้\\n\\nสาเหตุ: รูปภาพสินค้ามีขนาดใหญ่หรือจำนวนมากเกินไป\\nทางแก้: กรุณาไปที่หน้า "ตั้งค่า" แล้วกดปุ่ม "ขยายพื้นที่จัดเก็บ"');
                }
            }
            return false;
        }
    },"""
new_save = """    saveToLocalStorage: (key, data) => {
        DB.cache[key] = data;
        localforage.setItem(key, data).catch(e => console.error("Save error:", e));
        return true;
    },"""
content = content.replace(old_save, new_save)

# 4. init() start
old_init_start = """    init: () => {
        // Safe check using new helper
        const products = DB.safeGet(DB.KEYS.PRODUCTS, null);

        if (!products || products.length === 0) {"""
new_init_start = """    init: async () => {
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

        if (!DB.cache[DB.KEYS.PRODUCTS] || DB.cache[DB.KEYS.PRODUCTS].length === 0) {"""
content = content.replace(old_init_start, new_init_start)

# init end
content = content.replace("localStorage.setItem(DB.KEYS.PRODUCTS, JSON.stringify(mockProducts));", "DB.cache[DB.KEYS.PRODUCTS] = mockProducts;\n            await localforage.setItem(DB.KEYS.PRODUCTS, mockProducts);")

# 5. basic sets
content = content.replace("localStorage.setItem(DB.KEYS.TABLES, JSON.stringify(tables));", "DB.saveToLocalStorage(DB.KEYS.TABLES, tables);")
content = content.replace("localStorage.setItem(DB.KEYS.TABLES, JSON.stringify(updated));", "DB.saveToLocalStorage(DB.KEYS.TABLES, updated);")
content = content.replace("localStorage.setItem(DB.KEYS.SETTINGS, JSON.stringify(updated));", "DB.saveToLocalStorage(DB.KEYS.SETTINGS, updated);")
content = content.replace("localStorage.setItem(DB.KEYS.PAYMENT_PREFS, JSON.stringify(updated));", "DB.saveToLocalStorage(DB.KEYS.PAYMENT_PREFS, updated);")
content = content.replace("localStorage.setItem(DB.KEYS.GROUP_IMAGES, JSON.stringify(images));", "DB.saveToLocalStorage(DB.KEYS.GROUP_IMAGES, images);")
content = content.replace("localStorage.setItem(DB.KEYS.PRODUCTS, JSON.stringify(products));", "DB.saveToLocalStorage(DB.KEYS.PRODUCTS, products);")
content = content.replace("localStorage.setItem(DB.KEYS.PARKED_CARTS, JSON.stringify(parked));", "DB.saveToLocalStorage(DB.KEYS.PARKED_CARTS, parked);")
content = content.replace("localStorage.setItem('store_parked_trash', JSON.stringify(trash));", "DB.saveToLocalStorage('store_parked_trash', trash);")
content = content.replace("localStorage.setItem(DB.KEYS.PARKED_CARTS, JSON.stringify(newParked));", "DB.saveToLocalStorage(DB.KEYS.PARKED_CARTS, newParked);")
content = content.replace("localStorage.setItem(DB.KEYS.SALES, JSON.stringify(sales));", "DB.saveToLocalStorage(DB.KEYS.SALES, sales);")
content = content.replace("localStorage.setItem(DB.KEYS.SUPPLIERS, JSON.stringify(list));", "DB.saveToLocalStorage(DB.KEYS.SUPPLIERS, list);")
content = content.replace("localStorage.setItem(DB.KEYS.SUPPLIER_PRICES, JSON.stringify(prices));", "DB.saveToLocalStorage(DB.KEYS.SUPPLIER_PRICES, prices);")
content = content.replace("localStorage.setItem(DB.KEYS.AUTO_CART, JSON.stringify(cartState));", "DB.saveToLocalStorage(DB.KEYS.AUTO_CART, cartState);")

# 6. removeItems
content = content.replace("localStorage.removeItem(DB.KEYS.AUTO_CART);", "DB.cache[DB.KEYS.AUTO_CART] = null; localforage.removeItem(DB.KEYS.AUTO_CART);")
content = content.replace("localStorage.removeItem('store_parked_trash');", "DB.cache['store_parked_trash'] = null; localforage.removeItem('store_parked_trash');")

# 7. init call
content = content.replace("DB.init();", "// DB.init() is now async and called from App.init()")

# 8. importData block replacement
# find importData index
idx = content.find("    importData: async")
if idx != -1:
    content = content[:idx] + """    importData: async (jsonString) => {
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
};
"""

with open('js/db.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("db.js rewritten")
