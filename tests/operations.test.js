const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const stored = new Map();
const context = {
    console,
    localStorage: { getItem: () => null, setItem: () => {} },
    localforage: {
        setItem: async (key, value) => { stored.set(key, value); return value; },
        getItem: async key => stored.get(key) ?? null,
        removeItem: async key => stored.delete(key)
    },
    setTimeout,
    clearTimeout
};
vm.createContext(context);
const source = fs.readFileSync('js/db.js', 'utf8') + '\n;globalThis.__DB = DB;';
vm.runInContext(source, context);
const DB = context.__DB;

(async () => {
    DB.cache[DB.KEYS.CUSTOMERS] = [];
    DB.cache[DB.KEYS.ORDERS] = [];
    DB.cache[DB.KEYS.PAYMENTS] = [];
    DB.cache[DB.KEYS.PARKED_CARTS] = [];
    DB.cache.store_parked_trash = [];

    const customer = await DB.saveCustomer({ name: ' ลูกค้าทดสอบ ', phone: '081-234-5678' });
    assert.equal(customer.name, 'ลูกค้าทดสอบ');
    assert.equal(customer.phone, '0812345678');

    await DB.saveOrder({
        id: 'B-TEST',
        items: [{ id: 'P1', name: 'สินค้า', price: 10, qty: 2, image: 'data:image/jpeg;base64,large' }],
        total: 20,
        paymentStatus: 'unpaid'
    });
    const order = DB.getOrders().find(item => item.id === 'B-TEST');
    assert.equal(order.items[0].name, 'สินค้า');
    assert.equal(Object.prototype.hasOwnProperty.call(order.items[0], 'image'), false);

    await DB.savePayment({ id: 'PAY-B-TEST', orderId: 'B-TEST', amount: 20, method: 'cash', status: 'paid' });
    assert.equal(DB.getPayments()[0].orderId, 'B-TEST');

    DB.cache[DB.KEYS.PARKED_CARTS] = [{ id: 'B-TEST', timestamp: 1, note: 'โต๊ะทดสอบ', items: [] }];
    DB.finalizeParkedCart('B-TEST');
    assert.equal(DB.getParkedCarts().length, 0);
    assert.equal(DB.getParkedTrash().length, 0);
    assert.equal(DB.getOrders().find(item => item.id === 'B-TEST').fulfillmentStatus, 'completed');

    DB.cache[DB.KEYS.PARKED_CARTS] = [{ id: 'B-CANCEL', timestamp: 2, note: 'ยกเลิก', items: [] }];
    await DB.saveOrder({ id: 'B-CANCEL', items: [], paymentStatus: 'unpaid' });
    DB.removeParkedCart('B-CANCEL');
    assert.equal(DB.getParkedCarts().length, 0);
    assert.equal(DB.getParkedTrash().some(item => item.id === 'B-CANCEL'), true);
    assert.equal(DB.getOrders().find(item => item.id === 'B-CANCEL').fulfillmentStatus, 'cancelled');
    console.log('operations.test.js passed');
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
