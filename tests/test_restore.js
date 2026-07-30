const assert = require('node:assert/strict');

const syncStore = new Map();
global.localStorage = {
    get length() { return syncStore.size; },
    key: index => Array.from(syncStore.keys())[index] ?? null,
    getItem: key => syncStore.has(key) ? syncStore.get(key) : null,
    setItem: (key, value) => syncStore.set(key, String(value)),
    removeItem: key => syncStore.delete(key),
    clear: () => syncStore.clear()
};

const asyncStore = new Map();
global.localforage = {
    getItem: async key => asyncStore.has(key) ? structuredClone(asyncStore.get(key)) : null,
    setItem: async (key, value) => { asyncStore.set(key, structuredClone(value)); return value; },
    removeItem: async key => asyncStore.delete(key)
};
global.Utils = { generateId: () => 'mock-id' };

const DB = require('../js/db.js');

async function reset() {
    syncStore.clear();
    asyncStore.clear();
    Object.keys(DB.cache).forEach(key => { DB.cache[key] = null; });
}

(async () => {
    console.log('Starting database safety tests...');
    await reset();
    await DB.init();
    assert.ok(DB.getProducts().length > 0, 'new database should receive starter products');

    await DB.saveProducts([]);
    Object.keys(DB.cache).forEach(key => { DB.cache[key] = null; });
    await DB.init();
    assert.equal(DB.getProducts().length, 0, 'an intentionally empty catalog must remain empty');

    await DB.saveSettings({ storeName: 'KOKOJOY', pin: '1234' });
    const backup = DB.exportData();
    await DB.saveSettings({ storeName: 'CHANGED' });
    const restored = await DB.importData(backup);
    assert.equal(restored.success, true);
    assert.equal(DB.getSettings().storeName, 'KOKOJOY');

    const invalidBackup = JSON.stringify({ products: [
        { id: 'bad-1', barcode: 'bad', name: 'Bad stock', price: 10, stock: -1 }
    ] });
    const rejected = await DB.importData(invalidBackup);
    assert.equal(rejected.success, false, 'negative stock must be rejected before import');

    await DB.saveProducts([{ id: 'p1', barcode: '1', name: 'Test', price: 10, stock: 5 }]);
    await DB.saveToLocalStorage(DB.KEYS.SALES, []);
    const sale = await DB.commitSale({ date: new Date(), items: [{ id: 'p1', qty: 2, price: 10 }], total: 20 }, [{ id: 'p1', qty: 2 }]);
    assert.ok(sale.billId);
    assert.equal(DB.getProducts()[0].stock, 3);
    assert.equal(DB.getSales().length, 1);

    console.log('PASS: backup, empty catalog, and atomic checkout behavior');
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
