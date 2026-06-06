import re

with open('js/db.js', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add DB.cache and DB.init (async)
cache_code = """    cache: {
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

    init: async () => {
        // Migration check
        const isMigrated = localStorage.getItem('migrated_to_idb');
        if (!isMigrated) {
            console.log("Migrating data to IndexedDB...");
            const keysToMigrate = Object.values(DB.KEYS).concat(['store_parked_trash']);
            for (let key of keysToMigrate) {
                const val = localStorage.getItem(key);
                if (val) {
                    try {
                        const parsed = JSON.parse(val);
                        await localforage.setItem(key, parsed);
                    } catch (e) {
                        console.error("Migration error for", key, e);
                    }
                }
            }
            localStorage.setItem('migrated_to_idb', 'true');
            console.log("Migration complete.");
        }

        // Load all into cache
        const keysToLoad = Object.values(DB.KEYS).concat(['store_parked_trash']);
        for (let key of keysToLoad) {
            DB.cache[key] = await localforage.getItem(key);
        }

        // Initialize Mock Data if empty
        if (!DB.cache[DB.KEYS.PRODUCTS] || DB.cache[DB.KEYS.PRODUCTS].length === 0) {
            const mockProducts = [
                {
                    id: '8850987123456', barcode: '8850987123456', name: 'ไวไว ปรุงสำเร็จ (60g)', price: 6.00, cost: 4.50, stock: 48, image: null
                },
                {
                    id: '8851987123456', barcode: '8851987123456', name: 'มาม่า หมูสับ (60g)', price: 7.00, cost: 5.25, stock: 12, image: null
                },
                {
                    id: '8852987123456', barcode: '8852987123456', name: 'โค้ก (325ml)', price: 15.00, cost: 11.00, stock: 24, image: null
                },
                {
                    id: '8853987123456', barcode: '8853987123456', name: 'น้ำดื่ม คริสตัล (600ml)', price: 7.00, stock: 3, image: null
                },
                {
                    id: '123456', barcode: '123456', name: 'ขนมปัง ฟาร์ม (แถว)', price: 42.00, stock: 5, image: null
                }
            ];
            DB.cache[DB.KEYS.PRODUCTS] = mockProducts;
            await localforage.setItem(DB.KEYS.PRODUCTS, mockProducts);
        }
    },
"""

# Replace safeGet and saveToLocalStorage
content = re.sub(r'safeGet:.*?,\n\n    // New: Helper for safe saving with Quota Check', 
                 r'''safeGet: (key, fallback) => {
        const val = DB.cache[key];
        return val !== null && val !== undefined ? val : fallback;
    },

    saveToLocalStorage: (key, data) => {
        DB.cache[key] = data;
        localforage.setItem(key, data).catch(e => console.error("Save error:", e));
        return true;
    },
    // New: Helper for safe saving with Quota Check''', content, flags=re.DOTALL)


# Replace DB.init()
content = re.sub(r'init: \(\) => \{.*?\},', cache_code, content, flags=re.DOTALL)

# In importData, replace performSave logic and catch blocks.
content = re.sub(r'const performSave =.*?return \{ success: true \};', r'''
            const performSave = async (products, groupImages) => {
                if (data.settings) {
                    DB.cache[DB.KEYS.SETTINGS] = data.settings;
                    await localforage.setItem(DB.KEYS.SETTINGS, data.settings);
                }
                if (groupImages) {
                    DB.cache[DB.KEYS.GROUP_IMAGES] = groupImages;
                    await localforage.setItem(DB.KEYS.GROUP_IMAGES, groupImages);
                }
                if (data.counters) {
                    Object.keys(data.counters).forEach(key => {
                        localStorage.setItem(key, data.counters[key]);
                    });
                }
                
                const saveKey = async (key, val) => {
                    DB.cache[key] = val || [];
                    await localforage.setItem(key, val || []);
                };
                
                await saveKey(DB.KEYS.PRODUCTS, products);
                await saveKey(DB.KEYS.SUPPLIERS, data.suppliers);
                await saveKey(DB.KEYS.SUPPLIER_PRICES, data.supplierPrices);
                await saveKey(DB.KEYS.PARKED_CARTS, data.parkedCarts);
                await saveKey(DB.KEYS.SALES, data.sales);
            };

            await performSave(data.products, data.groupImages);
            return { success: true };
''', content, flags=re.DOTALL)

content = re.sub(r"catch \(e\) \{(?:(?!let msg = 'ไฟล์ไม่ถูกต้องหรือระบบขัดข้อง';).)*let msg = 'ไฟล์ไม่ถูกต้องหรือระบบขัดข้อง';", r'''catch (e) {
            console.error('Import Error:', e);
            let msg = 'ไฟล์ไม่ถูกต้องหรือระบบขัดข้อง';''', content, flags=re.DOTALL)


# Replace localStorage.setItem in other places:
# DB.getTables
content = content.replace("localStorage.setItem(DB.KEYS.TABLES, JSON.stringify(tables));", "DB.saveToLocalStorage(DB.KEYS.TABLES, tables);")
content = content.replace("localStorage.setItem(DB.KEYS.TABLES, JSON.stringify(updated));", "DB.saveToLocalStorage(DB.KEYS.TABLES, updated);")
content = content.replace("localStorage.setItem(DB.KEYS.SETTINGS, JSON.stringify(updated));", "DB.saveToLocalStorage(DB.KEYS.SETTINGS, updated);")
content = content.replace("localStorage.setItem(DB.KEYS.PAYMENT_PREFS, JSON.stringify(updated));", "DB.saveToLocalStorage(DB.KEYS.PAYMENT_PREFS, updated);")
content = content.replace("localStorage.setItem(DB.KEYS.GROUP_IMAGES, JSON.stringify(images));", "DB.saveToLocalStorage(DB.KEYS.GROUP_IMAGES, images);")
content = content.replace("localStorage.setItem(DB.KEYS.PRODUCTS, JSON.stringify(products));", "DB.saveToLocalStorage(DB.KEYS.PRODUCTS, products);")
content = content.replace("localStorage.setItem(DB.KEYS.PRODUCTS, JSON.stringify(mockProducts));", "DB.saveToLocalStorage(DB.KEYS.PRODUCTS, mockProducts);")
content = content.replace("localStorage.setItem(DB.KEYS.PARKED_CARTS, JSON.stringify(parked));", "DB.saveToLocalStorage(DB.KEYS.PARKED_CARTS, parked);")
content = content.replace("localStorage.setItem('store_parked_trash', JSON.stringify(trash));", "DB.saveToLocalStorage('store_parked_trash', trash);")
content = content.replace("localStorage.setItem(DB.KEYS.PARKED_CARTS, JSON.stringify(newParked));", "DB.saveToLocalStorage(DB.KEYS.PARKED_CARTS, newParked);")
content = content.replace("localStorage.setItem(DB.KEYS.SALES, JSON.stringify(sales));", "DB.saveToLocalStorage(DB.KEYS.SALES, sales);")
content = content.replace("localStorage.setItem(DB.KEYS.SUPPLIERS, JSON.stringify(list));", "DB.saveToLocalStorage(DB.KEYS.SUPPLIERS, list);")
content = content.replace("localStorage.setItem(DB.KEYS.SUPPLIER_PRICES, JSON.stringify(prices));", "DB.saveToLocalStorage(DB.KEYS.SUPPLIER_PRICES, prices);")

content = content.replace("localStorage.setItem(DB.KEYS.AUTO_CART, JSON.stringify(cartState));", "DB.saveToLocalStorage(DB.KEYS.AUTO_CART, cartState);")
content = content.replace("localStorage.removeItem(DB.KEYS.AUTO_CART);", "DB.cache[DB.KEYS.AUTO_CART]=null; localforage.removeItem(DB.KEYS.AUTO_CART);")
content = content.replace("localStorage.removeItem('store_parked_trash');", "DB.cache['store_parked_trash']=null; localforage.removeItem('store_parked_trash');")

# Remove DB.init() call at the end of db.js
content = content.replace("DB.init();", "// DB.init() is now async and called from App.init()")


with open('js/db_new.js', 'w', encoding='utf-8') as f:
    f.write(content)
