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

console.log('PASS: scanner input and barcode-optional product identity');
