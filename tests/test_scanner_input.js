const assert = require('assert');
const Utils = require('../js/utils.js');

assert.strictEqual(Utils.isScannerTerminator('Enter'), true);
assert.strictEqual(Utils.isScannerTerminator('Tab'), true);
assert.strictEqual(Utils.isScannerTerminator('Space'), false);
assert.strictEqual(Utils.isLikelyScannerInput('8850250015161', 650), true);
assert.strictEqual(Utils.isLikelyScannerInput('123456', 500), true);
assert.strictEqual(Utils.isLikelyScannerInput('ABCD-1234', 700), true);
assert.strictEqual(Utils.isLikelyScannerInput('12345', 300), false);
assert.strictEqual(Utils.isLikelyScannerInput('8850250015161', 4000), false);

assert.deepStrictEqual(Utils.resolveProductBarcode('', 'product-1'), {
    barcode: 'INTERNAL-product-1', hasBarcode: false, internalCode: 'INTERNAL-product-1'
});
assert.deepStrictEqual(Utils.resolveProductBarcode(' 8850250015161 ', 'product-1'), {
    barcode: '8850250015161', hasBarcode: true, internalCode: null
});
assert.strictEqual(Utils.resolveProductBarcode('', 'product-1', 'INTERNAL-old').barcode, 'INTERNAL-old');

const bulkSource = [
    { id: 'a', name: 'A', group: 'เก่า', price: 10, stock: 4, barcode: '111111' },
    { id: 'b', name: 'B', group: 'เดิม', price: 20, stock: 7, barcode: '222222' }
];
const bulkResult = Utils.assignCategoryToProducts(bulkSource, ['a'], 'เครื่องดื่ม', 1234);
assert.strictEqual(bulkResult.changed, 1);
assert.deepStrictEqual(bulkResult.products[0], { id: 'a', name: 'A', group: 'เครื่องดื่ม', price: 10, stock: 4, barcode: '111111', updatedAt: 1234 });
assert.strictEqual(bulkResult.products[1], bulkSource[1]);
assert.strictEqual(bulkResult.products[0].price, bulkSource[0].price);
assert.strictEqual(bulkResult.products[0].stock, bulkSource[0].stock);
assert.strictEqual(bulkResult.products[0].barcode, bulkSource[0].barcode);

console.log('PASS: scanner, barcode-optional identity and safe bulk category changes');
