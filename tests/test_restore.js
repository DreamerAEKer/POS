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
    const sharedSettings = DB.getSharedSettingsPayload(DB.getSettings());
    assert.equal(sharedSettings.storeName, 'KOKOJOY');
    assert.equal(Object.hasOwn(sharedSettings, 'pin'), false, 'security PIN must never enter shared Firebase settings');
    const stockCatalog = DB.getStockCatalogPayload({
        barcode: '8850250015161', name: 'ผงชูรส', group: 'เครื่องปรุง',
        price: 20, stock: 12, pin: 'must-not-sync'
    });
    assert.equal(stockCatalog.barcode, '8850250015161');
    assert.equal(stockCatalog.name, 'ผงชูรส');
    assert.equal(stockCatalog.group, 'เครื่องปรุง');
    assert.equal(Object.hasOwn(stockCatalog, 'stock'), false, 'stock is synchronized separately');
    assert.equal(Object.hasOwn(stockCatalog, 'pin'), false, 'PIN must never enter a stock catalog document');
    const backup = DB.exportData();
    await DB.saveSettings({ storeName: 'CHANGED' });
    const restored = await DB.importData(backup);
    assert.equal(restored.success, true);
    assert.equal(DB.getSettings().storeName, 'KOKOJOY');

    const invalidBackup = JSON.stringify({ products: [
        { id: 'bad-1', barcode: 'bad', name: 'Bad stock', price: 10, stock: -1 }
    ] });
    const normalized = await DB.importData(invalidBackup);
    assert.equal(normalized.success, true, 'negative stock should be normalized during import');
    assert.equal(normalized.correctedStocks, 1);
    assert.equal(DB.getProducts().find(product => product.id === 'bad-1').stock, 0);

    const malformed = await DB.importData(JSON.stringify({ products: [
        { id: '', barcode: '', name: '', price: 10, stock: 1 }
    ] }));
    assert.equal(malformed.success, false, 'missing identity fields must still be rejected');

    const noBarcodeBackup = JSON.stringify({ products: [
        { id: 'no-barcode-1', barcode: '', name: 'No barcode', price: 5, stock: 2 },
        { id: 'M12345678', barcode: 'M12345678', name: 'Manual item', price: 10, stock: 3 }
    ] });
    const noBarcodeResult = await DB.importData(noBarcodeBackup);
    assert.equal(noBarcodeResult.success, true);
    assert.equal(noBarcodeResult.internalBarcodeProducts, 2);
    assert.equal(DB.getProducts().find(product => product.id === 'no-barcode-1').hasBarcode, false);
    assert.equal(DB.getProducts().find(product => product.id === 'M12345678').hasBarcode, false);

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
