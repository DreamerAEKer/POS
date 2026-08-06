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

console.log('PASS: Bluetooth/USB scanner terminators, formats and timing');
