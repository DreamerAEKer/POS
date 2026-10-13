const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const appCode = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const versionJson = JSON.parse(fs.readFileSync(path.join(root, 'version.json'), 'utf8'));
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

// 1. Version consistency checks
assert(appCode.includes(`VERSION: '${versionJson.version}`), `App.VERSION must match version.json (${versionJson.version})`);
assert(indexHtml.includes(`app.js?v=${versionJson.version}`), 'index.html app.js query string must match version.json');
assert(indexHtml.includes(`styles.css?v=${versionJson.version}`), 'index.html styles.css query string must match version.json');

// 2. Speech synthesis logic checks in source code
assert(appCode.includes('setupSpeechSynthesis:'), 'App must have setupSpeechSynthesis');
assert(!appCode.includes('if (isPosSellingView || isCartOpen || isPaymentOpen) return;'), 'POS selling view must NOT mute voice price reading');
assert(appCode.includes("App.speakPrice(10, true);"), 'setMediaAccess voicePrice must force test audio');

// 3. Behavioral test in simulated DOM/browser context
let spoken = [];
let cancelled = false;

class MockSpeechSynthesisUtterance {
    constructor(text) {
        this.text = text;
        this.lang = '';
        this.rate = 1;
        this.pitch = 1;
        this.volume = 1;
    }
}

const mockSynth = {
    paused: false,
    resume: () => { mockSynth.paused = false; },
    cancel: () => { cancelled = true; },
    getVoices: () => [{ lang: 'th-TH', name: 'Kanya' }],
    speak: (utterance) => {
        spoken.push(utterance.text);
    }
};

const domListeners = {};
const mockElements = {};

const mockDocument = {
    getElementById: (id) => mockElements[id] || null,
    querySelectorAll: () => [],
    addEventListener: (event, handler) => {
        domListeners[event] = domListeners[event] || [];
        domListeners[event].push(handler);
    },
    removeEventListener: () => {}
};

const mockSettings = {
    voicePriceSpeechEnabled: true,
    scannerPriceCheckMode: false
};

const mockDB = {
    getSettings: () => mockSettings,
    saveSettings: async (s) => Object.assign(mockSettings, s)
};

const context = {
    console,
    window: {
        speechSynthesis: mockSynth,
        SpeechSynthesisUtterance: MockSpeechSynthesisUtterance
    },
    document: mockDocument,
    SpeechSynthesisUtterance: MockSpeechSynthesisUtterance,
    Utils: {
        formatCurrency: (n) => String(n)
    },
    DB: mockDB,
    setTimeout: (fn, ms) => { fn(); return 1; },
    clearTimeout: () => {},
    App: null
};

vm.createContext(context);
vm.runInContext(appCode + '\n;globalThis.App = App;', context);
const App = context.App;

// Test POS view scanning speech
App.state = { currentView: 'pos', cart: [] };
spoken = [];
cancelled = false;
App.speakPrice(45);
assert.strictEqual(spoken.length, 1, 'speakPrice must speak in POS view');
assert.strictEqual(spoken[0], '45 บาท');
assert.strictEqual(cancelled, true, 'speechSynthesis.cancel must be called before speaking');

// Test muted setting
mockSettings.voicePriceSpeechEnabled = false;
spoken = [];
App.speakPrice(45);
assert.strictEqual(spoken.length, 0, 'speakPrice must not speak when voicePriceSpeechEnabled is false');

// Test payment modal suppression
mockSettings.voicePriceSpeechEnabled = true;
mockElements['payment-modal'] = { classList: { contains: (cls) => cls !== 'hidden' } }; // modal is visible
spoken = [];
App.speakPrice(45);
assert.strictEqual(spoken.length, 0, 'speakPrice must be suppressed during payment checkout unless forced');

// Test force parameter bypasses payment modal
App.speakPrice(10, true);
assert.strictEqual(spoken.length, 1, 'speakPrice with force=true must speak even during payment modal');
assert.strictEqual(spoken[0], '10 บาท');

console.log('speech-price.test.js passed');
