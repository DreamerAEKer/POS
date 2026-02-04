const fs = require('fs');
const path = require('path');

// 1. Mock LocalStorage
const store = {};
global.localStorage = {
    getItem: (key) => store[key] || null,
    setItem: (key, val) => store[key] = val,
    clear: () => { for (const k in store) delete store[k]; }
};

// 2. Mock Utils
global.Utils = {
    generateId: () => 'mock-id-' + Math.random().toString(36).substr(2, 9)
};

// 3. Load DB Code
const dbPath = path.join(__dirname, '../js/db.js');
const dbCode = fs.readFileSync(dbPath, 'utf8');

// Execute DB code (creates global 'DB' object)
eval(dbCode);

// 4. Test Script
console.log('\n--- STARTING BACKUP/RESTORE TEST ---\n');

// A. SETUP: Set Store Name
const mySettings = { storeName: 'KOKOJOY', pin: '1234' };
DB.saveSettings(mySettings);
console.log('1. [SETUP] Current Settings:', DB.getSettings());

// B. EXPORT
console.log('2. [ACTION] Exporting Data...');
const jsonBackup = DB.exportData();
const parsedBackup = JSON.parse(jsonBackup);

if (parsedBackup.settings && parsedBackup.settings.storeName === 'KOKOJOY') {
    console.log('   ✅ PASS: Backup contains settings (Store Name: KOKOJOY)');
} else {
    console.error('   ❌ FAIL: Backup missing settings!');
    process.exit(1);
}

// C. WIPEOUT
console.log('3. [ACTION] Wiping Data (Simulating new device)...');
localStorage.clear();
console.log('   Current Settings (should be default):', DB.getSettings());

// D. RESTORE
console.log('4. [ACTION] Restoring Data...');
const result = DB.importData(jsonBackup);
console.log('   Restore Result:', result);

// E. VERIFY
const restoredSettings = DB.getSettings();
console.log('5. [VERIFY] Restored Settings:', restoredSettings);

if (restoredSettings.storeName === 'KOKOJOY') {
    console.log('\n✅ TEST PASSED: Store Name was successfully restored!');
} else {
    console.log('\n❌ TEST FAILED: Store Name mismatch.');
}
