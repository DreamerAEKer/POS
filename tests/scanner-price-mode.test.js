const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const db = fs.readFileSync(path.join(root, 'js', 'db.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css', 'styles.css'), 'utf8');

assert(html.includes('id="btn-price-check-mode"'), 'missing price-check mode button');
assert(db.includes('scannerPriceCheckMode: false'), 'missing persisted default setting');
assert(app.includes("navigator.wakeLock.request('screen')"), 'missing screen wake lock request');
assert(app.includes("document.addEventListener('visibilitychange'"), 'missing wake-lock reacquire listener');
assert(app.includes('showScannerPriceResult:'), 'missing found-product result');
assert(app.includes('showScannerPriceNotFound:'), 'missing not-found result');
assert(app.includes('priceCheckCart: []'), 'missing isolated quick price cart');
assert(app.includes('startPriceCheckCheckout:'), 'missing quick checkout handoff');
assert(app.includes("DB.getSettings().scannerPriceCheckMode === true"), 'missing price-mode search routing');
assert(!html.includes('id="btn-quick-print"'), 'print action should not be prominent on the sales screen');
assert(app.includes('printReceiptFromHistory:'), 'receipt printing must remain available from sales history');
assert(app.includes('voiceListening: false'), 'missing voice on/off state');
assert(app.includes('recognition.continuous = true'), 'missing continuous listening mode');
assert(app.includes('startVoiceRecognitionSession:'), 'missing voice session restart helper');
assert(css.includes('.price-check-mode-btn.active'), 'missing active mode styling');
assert(css.includes('.scanner-price-result'), 'missing result modal styling');
assert(css.includes('.scanner-price-quick-bill'), 'missing quick total styling');
assert(css.includes('.quick-search-products'), 'missing horizontal voice product choices');

const handlerStart = app.indexOf('handleBarcodeScan: async');
const handlerEnd = app.indexOf('// --- Product Flash Popup', handlerStart);
assert(handlerStart >= 0 && handlerEnd > handlerStart, 'could not isolate scanner handler');
const handler = app.slice(handlerStart, handlerEnd);
const kioskBranch = handler.indexOf('scannerPriceCheckMode === true');
const firstCartMutation = handler.indexOf('App.addToCart');
assert(kioskBranch >= 0, 'missing price-check branch in scanner handler');
assert(firstCartMutation >= 0, 'expected normal sale cart path');
assert(kioskBranch < firstCartMutation, 'price-check mode must exit before any cart mutation');
assert(handler.includes('return;'), 'price-check branch must terminate scan handling');

console.log('scanner price-check mode tests passed');
