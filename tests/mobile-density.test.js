const assert = require('assert');
const fs = require('fs');

const app = fs.readFileSync('js/app.js', 'utf8');
const css = fs.readFileSync('css/styles.css', 'utf8');

assert(app.includes('class="stock-mobile-list"'), 'stock mobile list must render');
assert(app.includes('class="stock-mobile-actions"'), 'mobile stock actions must stay visible');
assert(css.includes('@media screen and (max-width: 600px)'), 'phone breakpoint must exist');
assert(css.includes('.stock-desktop-table,'), 'desktop stock table must be hidden on phones');
assert(css.includes('grid-template-columns: 48px minmax(0, 1fr) auto'), 'mobile row must reserve compact action space');
assert(css.includes('min-height: 82px'), 'mobile row density contract changed unexpectedly');

console.log('mobile-density.test.js passed');
