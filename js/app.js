/**
 * Main Application Logic
 */

const App = {
    state: {
        cart: [],
        activeBill: null, // Track currently active restored bill
        currentView: 'pos', // 'pos', 'stock', 'suppliers', 'settings'
        products: [],
        searchQuery: '',
        cartCloseTimer: null, // For auto-closing mobile cart
        salesFilter: 'today', // 'today', '7days', '30days', 'all'
        salesTab: 'bills', // 'bills', 'top', 'categories'
        stockTab: 'all', // 'all', 'low', 'new', 'groups'
        stockBulkMode: false,
        selectedStockProductIds: [],
        stockSort: { column: 'name', direction: 'asc' }, // New Sorting State
        salesReport: {
            startDate: new Date().toISOString().split('T')[0], // Default Today
            endDate: new Date().toISOString().split('T')[0]
        },
        cameraScanner: { stream: null, detector: null, reader: null, active: false, detecting: false, detectingNow: false, detectionTimer: null, lastDetectionAt: 0, facingEnvironment: true, torchOn: false, lastCode: null, lastAt: 0 },
        priceCheckWakeLock: null,
        priceCheckCart: [],
        voiceListening: false,
        voiceTranscript: ''
    },

    elements: {
        viewContainer: document.getElementById('view-container'),
        cartItemsContainer: document.getElementById('cart-items-container'),
        cartTotal: document.getElementById('cart-total'),
        parkedCount: document.getElementById('parked-count'),
        globalSearch: document.getElementById('global-search'),
        clock: document.getElementById('clock'),
        receiptArea: document.getElementById('receipt-print-area')
    },

    init: async () => {
        try {
            App.checkForAppUpdate();
            // Initialize DB (load from localforage to cache)
            await DB.init();

            // Firebase Auth Setup
            DB.onAuthStateChanged(async (user) => {
                const overlay = document.getElementById('modal-overlay');
                const loginModal = document.getElementById('login-modal');
                if (user) {
                    console.log("User logged in:", user.email);
                    App.renderUserSession(user, 'syncing');
                    if (loginModal && !loginModal.classList.contains('hidden')) {
                        overlay.classList.add('hidden');
                        loginModal.classList.add('hidden');
                    }
                    
                    // Role Enforcement
                    const navApprovals = document.getElementById('nav-approvals');
                    const navApprovalsMobile = document.getElementById('nav-approvals-mobile');
                    const navSettings = document.getElementById('nav-settings');
                    const navSettingsMobile = document.getElementById('nav-settings-mobile');
                    const navSales = document.querySelector('.nav-item[data-view="sales"]');
                    
                    if (DB.userRole === 'admin') {
                        if (navApprovals) navApprovals.style.display = 'flex';
                        if (navApprovalsMobile) navApprovalsMobile.style.display = 'flex';
                        if (navSettings) navSettings.style.display = 'flex';
                        if (navSettingsMobile) navSettingsMobile.style.display = 'flex';
                        if (navSales) navSales.style.display = 'flex';
                    } else {
                        if (navApprovals) navApprovals.style.display = 'none';
                        if (navApprovalsMobile) navApprovalsMobile.style.display = 'none';
                        if (navSettings) navSettings.style.display = 'none';
                        if (navSettingsMobile) navSettingsMobile.style.display = 'none';
                        if (navSales) navSales.style.display = 'none';
                        
                        // If staff is on a restricted view, boot them to pos
                        if (['settings', 'sales', 'approvals'].includes(App.state.currentView)) {
                            document.querySelector('.nav-item[data-view="pos"]').click();
                        }
                    }
                    
                    // Optional: Update User display in main app if we add it later
                    
                    await DB.syncSharedSettingsFromFirebase();
                    await DB.syncStocksFromFirebase();
                    await DB.migrateLegacyOperations();
                    DB.startOperationsRealtimeSync(() => {
                        if (['customers', 'tables'].includes(App.state.currentView)) {
                            App.renderView(App.state.currentView);
                        }
                    });
                    App.state.products = DB.getProducts();
                    App.renderUserSession(user, 'synced');
                    App.renderView(App.state.currentView); // Refresh view based on role and cloud stock
                } else {
                    console.log("User logged out");
                    App.renderUserSession(null);
                    DB.stopOperationsRealtimeSync();
                    if (overlay && loginModal) {
                        overlay.classList.remove('hidden');
                        loginModal.classList.remove('hidden');
                    }
                }
            });

            const btnLogin = document.getElementById('btn-login-submit');
            if (btnLogin) {
                btnLogin.addEventListener('click', async () => {
                    const email = document.getElementById('login-email').value;
                    const pass = document.getElementById('login-password').value;
                    const errDiv = document.getElementById('login-error');
                    errDiv.style.display = 'none';
                    
                    const res = await DB.login(email, pass);
                    if (!res.success) {
                        errDiv.textContent = 'ล็อกอินล้มเหลว: ' + res.message;
                        errDiv.style.display = 'block';
                    }
                });
            }
            document.getElementById('btn-forgot-password')?.addEventListener('click', App.requestPasswordReset);

            // Load Data
            App.state.products = DB.getProducts();

            // Restore Auto-cart if exists
            const autoCartState = DB.getAutoCart();
            if (autoCartState && autoCartState.cart && autoCartState.cart.length > 0) {
                App.state.cart = autoCartState.cart;
                App.state.activeBill = autoCartState.activeBill || null;
                App.state.editingBillId = autoCartState.editingBillId || null;
                App.state.editingSaleDate = autoCartState.editingSaleDate || null;
            }

            App.updateParkedBadge();

            // Setup Event Listeners
            App.setupNavigation();
            App.setupGlobalInput();
            App.setupCartActions();
            App.setupCameraScanner();
            App.setupScannerPriceCheckMode();

            // Initial Render
            App.renderView('pos');
            App.startClock();

            // Set Global Version Display
            const versionEl = document.getElementById('app-version-display');
            if (versionEl) versionEl.textContent = 'v' + App.VERSION;

            // The local sales screen is ready. Network services start afterwards
            // so a slow mobile connection cannot delay first use of the POS.
            App.loadFirebaseSdkInBackground();
            App.preloadScannerFallback();

            console.log('App Initialized Successfully');
        } catch (e) {
            console.error('App Init Error:', e);
            await App.alert('ระบบเกิดข้อผิดพลาด: ' + e.message);
        }
    },

    startClock: () => {
        const update = () => {
            App.elements.clock.textContent = Utils.getCurrentTime();
        };
        update();
        setInterval(update, 1000);

        setInterval(() => {
            if (App.checkDeliveryAlerts) App.checkDeliveryAlerts();
        }, 30000); // Check deliveries every 30 seconds
    },

    // --- Navigation & Views ---
    setupNavigation: () => {
        const allNavItems = document.querySelectorAll('.nav-item');
        allNavItems.forEach(item => {
            item.addEventListener('click', (e) => {
                const view = item.dataset.view;

                // 1. Settings View (Protected)
                if (view === 'settings') {
                    App.checkPin(() => {
                        App.setActiveNav(view);
                        App.renderView(view);
                    });
                }
                // 2. Normal Views
                else if (view) {
                    App.closeModals(); // Fix: Close any open popups (like Stock Add/Edit) when changing views
                    App.setActiveNav(view);
                    App.renderView(view);
                }
                // 3. Special Buttons
                else if (item.id === 'btn-check-price') {
                    App.showPriceCheckModal();
                } else if (item.id === 'btn-parked-mobile') {
                    App.showParkedCartsModal();
                }
            });
        });


    },

    openParkedModalFromNav: (e) => {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        // 1. Close ALL Overlays/Drawers
        App.closeModals();
        if (App.toggleMobileCart) App.toggleMobileCart(false);

        // 2. Open Target Modal
        setTimeout(() => {
            App.showParkedCartsModal();
        }, 50);
    },

    setActiveNav: (viewName) => {
        document.querySelectorAll('.nav-item').forEach(n => {
            n.classList.remove('active');
            if (n.dataset.view === viewName) n.classList.add('active');
        });
    },

    // --- Security Logic ---
    // --- Security Logic ---
    // --- Security Logic ---
    checkPin: (onSuccess) => {
        // Force close other modals first to prevent overlap
        App.closeModals();

        const modal = document.getElementById('security-modal');
        const overlay = document.getElementById('modal-overlay');
        const input = document.getElementById('security-pin-input');
        const confirmBtn = document.getElementById('btn-security-confirm');

        // Reset UI
        input.value = '';
        overlay.classList.remove('hidden');
        modal.classList.remove('hidden');

        // Slight delay to ensure focus works after transition
        setTimeout(() => input.focus(), 100);

        // Core Logic
        const submitPin = async () => {
            if (DB.validatePin(input.value)) {
                App.closeModals();

                // Cleanup to prevent memory leaks/double-firing
                confirmBtn.onclick = null;
                input.onkeydown = null;

                onSuccess();
            } else {
                await App.alert('รหัสผ่านไม่ถูกต้อง!');
                input.value = '';
                input.focus();
            }
        };

        // Bind Events (Direct assignment is safer here than adding/removing listeners)
        confirmBtn.onclick = submitPin;

        // Enter Key Support
        input.onkeydown = (e) => {
            if (e.key === 'Enter') submitPin();
        };
    },

    renderView: (viewName) => {
        App.state.currentView = viewName;
        App.state.products = DB.getProducts(); // Refresh data
        const container = App.elements.viewContainer;
        container.innerHTML = '';

        if (viewName === 'pos') {
            App.renderPOSView(container);
        } else if (viewName === 'stock') {
            App.renderStockView(container);
        } else if (viewName === 'suppliers') {
            App.renderSupplierView(container);
        } else if (viewName === 'settings') {
            if (DB.userRole !== 'admin') { App.alert('คุณไม่มีสิทธิ์เข้าถึงเมนูนี้'); return; }
            App.renderSettingsView(container);
        } else if (viewName === 'sales') {
            if (DB.userRole !== 'admin') { App.alert('คุณไม่มีสิทธิ์เข้าถึงเมนูนี้'); return; }
            App.renderSalesView(container);
        } else if (viewName === 'approvals') {
            if (DB.userRole !== 'admin') { App.alert('คุณไม่มีสิทธิ์เข้าถึงเมนูนี้'); return; }
            App.renderApprovalsView(container);
        } else if (viewName === 'tables') {
            App.renderTablesView(container);
        } else if (viewName === 'customers') {
            App.renderCustomersView(container);
        }
    },

    escapeHtml: (value = '') => String(value).replace(/[&<>'"]/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    })[char]),

    renderCustomersView: (container) => {
        const customers = DB.getCustomers();
        const orders = DB.getOrders();
        const query = String(App.state.customerSearch || '').trim().toLowerCase();
        const filtered = customers.filter(customer => {
            const haystack = [customer.name, customer.phone, customer.alias, customer.route, customer.address]
                .join(' ').toLowerCase();
            return !query || haystack.includes(query);
        });
        const unpaidOrders = orders.filter(order => !['paid', 'cancelled'].includes(order.paymentStatus)).length;
        container.innerHTML = `
            <div style="display:flex; flex-wrap:wrap; justify-content:space-between; align-items:center; gap:10px; margin-bottom:15px;">
                <div>
                    <h2 style="margin:0;">ลูกค้าและประวัติออเดอร์</h2>
                    <div style="font-size:13px; color:#666;">${customers.length} ราย · รอชำระ ${unpaidOrders} ออเดอร์ · ซิงค์ผ่าน Firebase</div>
                </div>
                <div style="display:flex; gap:8px;">
                    <button class="secondary-btn" onclick="App.renderView('tables')">กลับหน้าโต๊ะ/ส่ง</button>
                    <button class="primary-btn" onclick="App.openCustomerEditor()">+ เพิ่มลูกค้า</button>
                </div>
            </div>
            <input type="search" value="${App.escapeHtml(App.state.customerSearch || '')}" placeholder="ค้นหาชื่อ เบอร์โทร ชื่อเรียก หรือเส้นทาง..."
                oninput="App.state.customerSearch=this.value; App.renderCustomersView(App.elements.viewContainer)"
                style="width:100%; padding:12px 14px; font-size:17px; border:1px solid #ccc; border-radius:12px; margin-bottom:12px;">
            <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:10px;">
                ${filtered.map(customer => {
                    const history = orders.filter(order => order.customerId === customer.id ||
                        (customer.phone && order.customerSnapshot && DB.normalizePhone(order.customerSnapshot.phone) === customer.phone));
                    const spent = history.filter(order => order.paymentStatus === 'paid').reduce((sum, order) => sum + Number(order.total || 0), 0);
                    const due = history.filter(order => !['paid', 'cancelled'].includes(order.paymentStatus)).reduce((sum, order) => sum + Number(order.total || 0), 0);
                    return `<button type="button" onclick="App.showCustomerHistory('${App.escapeHtml(customer.id)}')" style="text-align:left; background:white; border:1px solid #ddd; border-radius:12px; padding:14px; cursor:pointer;">
                        <div style="font-size:18px; font-weight:bold;">${App.escapeHtml(customer.name || 'ไม่ระบุชื่อ')}</div>
                        <div style="color:#555; margin-top:3px;">${App.escapeHtml(customer.phone || 'ไม่มีเบอร์โทร')}</div>
                        <div style="font-size:13px; color:#777; margin-top:5px;">${App.escapeHtml(customer.route || customer.alias || customer.address || '')}</div>
                        <div style="display:flex; justify-content:space-between; margin-top:10px; font-size:13px;"><span>${history.length} ออเดอร์ · ซื้อแล้ว ฿${Utils.formatCurrency(spent)}</span><span style="color:${due ? '#d32f2f' : '#2e7d32'};">ค้าง ฿${Utils.formatCurrency(due)}</span></div>
                    </button>`;
                }).join('') || '<div style="padding:30px; text-align:center; color:#888;">ยังไม่พบข้อมูลลูกค้า</div>'}
            </div>`;
    },

    openCustomerEditor: (customerId = null) => {
        const customer = customerId ? DB.getCustomers().find(item => item.id === customerId) : null;
        App.closeModals();
        const modal = document.getElementById('price-check-modal');
        modal.innerHTML = `<h3>${customer ? 'แก้ไขลูกค้า' : 'เพิ่มลูกค้า'}</h3>
            <label>ชื่อลูกค้า *</label><input id="customer-name" value="${App.escapeHtml(customer?.name || '')}" style="width:100%;padding:10px;margin:5px 0 10px;">
            <label>เบอร์โทร</label><input id="customer-phone" inputmode="tel" value="${App.escapeHtml(customer?.phone || '')}" style="width:100%;padding:10px;margin:5px 0 10px;">
            <label>ชื่อเรียก / จุดสังเกต</label><input id="customer-alias" value="${App.escapeHtml(customer?.alias || '')}" style="width:100%;padding:10px;margin:5px 0 10px;">
            <label>เส้นทางจัดส่ง</label><input id="customer-route" value="${App.escapeHtml(customer?.route || '')}" placeholder="เช่น สายตลาด-วัด" style="width:100%;padding:10px;margin:5px 0 10px;">
            <label>ที่อยู่ / หมายเหตุ</label><textarea id="customer-address" style="width:100%;padding:10px;margin:5px 0 10px;min-height:70px;">${App.escapeHtml(customer?.address || '')}</textarea>
            <label style="display:flex;align-items:center;gap:8px;margin:5px 0 15px;"><input id="customer-credit" type="checkbox" ${customer?.allowCredit ? 'checked' : ''}> อนุญาตให้ค้างชำระ</label>
            <div style="display:flex;gap:8px;"><button class="secondary-btn" onclick="App.closeModals()" style="flex:1;">ยกเลิก</button><button class="primary-btn" onclick="App.saveCustomerEditor('${App.escapeHtml(customer?.id || '')}')" style="flex:2;">บันทึกและซิงค์</button></div>`;
        document.getElementById('modal-overlay').classList.remove('hidden');
        modal.classList.remove('hidden');
        setTimeout(() => document.getElementById('customer-name')?.focus(), 50);
    },

    saveCustomerEditor: async (customerId) => {
        const name = document.getElementById('customer-name').value.trim();
        if (!name) return App.alert('กรุณาระบุชื่อลูกค้า');
        await DB.saveCustomer({
            id: customerId || undefined,
            name,
            phone: document.getElementById('customer-phone').value,
            alias: document.getElementById('customer-alias').value.trim(),
            route: document.getElementById('customer-route').value.trim(),
            address: document.getElementById('customer-address').value.trim(),
            allowCredit: document.getElementById('customer-credit').checked,
            createdAt: customerId ? (DB.getCustomers().find(item => item.id === customerId)?.createdAt || Date.now()) : Date.now()
        });
        App.closeModals();
        App.renderView('customers');
    },

    showCustomerHistory: (customerId) => {
        const customer = DB.getCustomers().find(item => item.id === customerId);
        if (!customer) return;
        const orders = DB.getOrders().filter(order => order.customerId === customerId ||
            (customer.phone && order.customerSnapshot && DB.normalizePhone(order.customerSnapshot.phone) === customer.phone));
        App.closeModals();
        const modal = document.getElementById('price-check-modal');
        modal.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:start;gap:8px;"><div><h3 style="margin:0;">${App.escapeHtml(customer.name)}</h3><div>${App.escapeHtml(customer.phone || '')}</div></div><button class="icon-btn" onclick="App.closeModals()"><span class="material-symbols-rounded">close</span></button></div>
            <button class="secondary-btn" onclick="App.openCustomerEditor('${App.escapeHtml(customer.id)}')" style="margin:12px 0;">แก้ไขข้อมูลลูกค้า</button>
            <div style="max-height:55vh;overflow:auto;">${orders.map(order => `<div style="border-top:1px solid #eee;padding:10px 0;"><b>${App.escapeHtml(order.orderType || 'order')} · ฿${Utils.formatCurrency(order.total || 0)}</b><div style="font-size:13px;color:#666;">${new Date(order.createdAt || order.updatedAt).toLocaleString('th-TH')} · งาน: ${App.escapeHtml(order.fulfillmentStatus || '-')} · ชำระ: ${App.escapeHtml(order.paymentStatus || '-')} ${order.paymentMethod ? '· ' + App.escapeHtml(order.paymentMethod) : ''}</div></div>`).join('') || '<p style="color:#888;">ยังไม่มีประวัติออเดอร์ที่ผูกกับลูกค้ารายนี้</p>'}</div>`;
        document.getElementById('modal-overlay').classList.remove('hidden');
        modal.classList.remove('hidden');
    },

    // --- Sales History View ---
    renderSalesView: (container) => {
        // 1. Get Filtered Data
        const { sales, periodLabel } = App.getFilteredSales();
        const totalRevenue = sales.reduce((sum, s) => sum + s.total, 0);
        const billCount = sales.length;

        // Calculate Max Profit Bill
        let maxProfitBill = 0;
        let maxProfitBillId = null;
        const allProducts = DB.getProducts(); // For cost fallback

        sales.forEach(sale => {
            let billProfit = 0;
            sale.items.forEach(item => {
                // Try to get cost from item (snapshot) -> fallback to current product cost -> 0
                let cost = item.cost;
                if (cost === undefined || cost === null) {
                    const product = allProducts.find(p => p.id === item.id);
                    cost = product ? (product.cost || 0) : 0;
                }
                billProfit += App.getLineTotal(item) - (cost * item.qty);
            });
            if (billProfit > maxProfitBill) {
                maxProfitBill = billProfit;
                maxProfitBillId = sale.billId;
            }
        });

        // 2. Render UI
        container.innerHTML = `
            <h2>ยอดขาย <small style="font-size:14px; color:#666; font-weight:normal;">(${periodLabel})</small></h2>
            
            <!-- Filters -->
            <div class="filter-bar">
                <button class="filter-btn ${App.state.salesFilter === 'today' ? 'active' : ''}" onclick="App.setSalesFilter('today')">วันนี้</button>
                <button class="filter-btn ${App.state.salesFilter === '7days' ? 'active' : ''}" onclick="App.setSalesFilter('7days')">7 วันล่าสุด</button>
                <button class="filter-btn ${App.state.salesFilter === '30days' ? 'active' : ''}" onclick="App.setSalesFilter('30days')">30 วันล่าสุด</button>
                <button class="filter-btn ${App.state.salesFilter === 'all' ? 'active' : ''}" onclick="App.setSalesFilter('all')">ทั้งหมด</button>
            </div>

            <!-- Dashboard -->
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(150px, 1fr)); gap:15px; margin-bottom:20px;">
                <div style="background:var(--primary-color); color:white; padding:20px; border-radius:12px; box-shadow:var(--shadow-md);">
                    <div style="font-size:14px; opacity:0.9;">ยอดขายรวม</div>
                    <div style="font-size:28px; font-weight:bold;">฿${Utils.formatCurrency(totalRevenue)}</div>
                </div>
                <div style="background:white; padding:20px; border-radius:12px; box-shadow:var(--shadow-sm);">
                    <div style="font-size:14px; color:#666;">จำนวนบิล</div>
                    <div style="font-size:28px; font-weight:bold; color:var(--neutral-900);">${billCount}</div>
                </div>
                <div onclick="${maxProfitBillId ? `App.showBillDetailByID('${maxProfitBillId}')` : ''}" style="background:white; padding:20px; border-radius:12px; box-shadow:var(--shadow-sm); cursor:${maxProfitBillId ? 'pointer' : 'default'};">
                    <div style="font-size:14px; color:#666;">กำไรสูงสุด/บิล</div>
                    <div style="font-size:28px; font-weight:bold; color:var(--success-color);">฿${Utils.formatCurrency(maxProfitBill)}</div>
                </div>
            </div>

            <!-- Tabs -->
            <div class="segmented-control" style="overflow-x:auto; padding-bottom:5px;">
                <div class="segment-btn ${App.state.salesTab === 'bills' ? 'active' : ''}" onclick="App.setSalesTab('bills')">บิล</div>
                <div class="segment-btn ${App.state.salesTab === 'top' ? 'active' : ''}" onclick="App.setSalesTab('top')">ขายดี (จำนวน)</div>
                <div class="segment-btn ${App.state.salesTab === 'top_profit' ? 'active' : ''}" onclick="App.setSalesTab('top_profit')">กำไร (สินค้า)</div>
                <div class="segment-btn ${App.state.salesTab === 'profit_categories' ? 'active' : ''}" onclick="App.setSalesTab('profit_categories')">กำไร (หมวด)</div>
                <div class="segment-btn ${App.state.salesTab === 'report' ? 'active' : ''}" onclick="App.setSalesTab('report')">รายงาน</div>
            </div>

            <!-- Content Area -->
            <div id="sales-content-area" style="background:white; border-radius:12px; overflow:hidden; box-shadow:var(--shadow-sm); min-height:300px;">
                ${App.renderSalesContent(sales)}
            </div>
        `;
    },

    setSalesFilter: (filter) => {
        App.state.salesFilter = filter;
        App.renderView('sales');
    },

    setSalesTab: (tab) => {
        App.state.salesTab = tab;
        App.renderView('sales');
    },

    getFilteredSales: () => {
        const allSales = DB.getSales().sort((a, b) => new Date(b.date) - new Date(a.date));
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

        let filtered = [];
        let label = '';

        switch (App.state.salesFilter) {
            case 'today':
                filtered = allSales.filter(s => new Date(s.date).getTime() >= todayStart);
                label = 'Today';
                break;
            case '7days':
                const sevenDaysAgo = todayStart - (6 * 24 * 60 * 60 * 1000);
                filtered = allSales.filter(s => new Date(s.date).getTime() >= sevenDaysAgo);
                label = 'Last 7 Days';
                break;
            case '30days':
                const thirtyDaysAgo = todayStart - (29 * 24 * 60 * 60 * 1000);
                filtered = allSales.filter(s => new Date(s.date).getTime() >= thirtyDaysAgo);
                label = 'Last 30 Days';
                break;
            case 'all':
                filtered = allSales;
                label = 'All Time';
                break;
            default: // fallback to today
                filtered = allSales.filter(s => new Date(s.date).getTime() >= todayStart);
                label = 'Today';
        }

        return { sales: filtered, periodLabel: label };
    },

    renderSalesContent: (sales) => {
        // Special Case: Report Tab doesn't use the main 'sales' filter in the same way, 
        // it uses its own Date Range. BUT to keep it consistent, if user selects 'report',
        // we show the report UI.
        if (App.state.salesTab === 'report') return App.renderSalesReport();

        if (sales.length === 0) return '<div style="padding:40px; text-align:center; color:#999;">ไม่มีข้อมูลในช่วงเวลานี้</div>';

        switch (App.state.salesTab) {
            case 'bills': return App.renderBillList(sales);
            case 'top': return App.renderBestSellers(sales);
            case 'top_profit': return App.renderTopProfit(sales);
            case 'profit_categories': return App.renderProfitByCategory(sales);
            case 'categories': return App.renderCategoryBreakdown(sales);
            default: return App.renderBillList(sales);
        }
    },

    renderSalesReport: () => {
        // 1. Date Controls
        const controlHtml = `
            <div style="position:sticky; top:0; z-index:10; padding:15px; border-bottom:1px solid #eee; background:var(--neutral-100); box-shadow:0 2px 5px rgba(0,0,0,0.05);">
                <div style="font-weight:bold; margin-bottom:10px; color:var(--primary-color);">รายงานสรุปยอดขาย (รายวัน)</div>
                <div style="display:flex; flex-wrap:wrap; gap:10px; align-items:flex-end;">
                    <div>
                        <label style="font-size:12px; display:block;">จากวันที่</label>
                        <input type="date" id="report-start" value="${App.state.salesReport.startDate}" 
                            onchange="App.state.salesReport.startDate = this.value"
                            style="padding:8px; border:1px solid #ddd; border-radius:4px;">
                    </div>
                    <div>
                        <label style="font-size:12px; display:block;">ถึงวันที่</label>
                        <input type="date" id="report-end" value="${App.state.salesReport.endDate}" 
                            onchange="App.state.salesReport.endDate = this.value"
                            style="padding:8px; border:1px solid #ddd; border-radius:4px;">
                    </div>
                    <button class="primary-btn" onclick="App.renderView('sales')" style="padding:8px 20px;">
                        ค้นหา
                    </button>
                    <button class="secondary-btn" onclick="App.exportSalesReport()" style="padding:8px 20px; display:flex; align-items:center; gap:5px;">
                        <span class="material-symbols-rounded">download</span> CSV
                    </button>
                </div>
            </div>
        `;

        // 2. Filter Data by Range
        const start = new Date(App.state.salesReport.startDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(App.state.salesReport.endDate);
        end.setHours(23, 59, 59, 999);

        const allSales = DB.getSales().sort((a, b) => new Date(a.date) - new Date(b.date)); // Sort ASC by Date
        const rangeSales = allSales.filter(s => {
            const d = new Date(s.date);
            return d >= start && d <= end;
        });

        if (rangeSales.length === 0) {
            return controlHtml + '<div style="padding:40px; text-align:center; color:#999;">ไม่พบข้อมูลในช่วงวันที่เลือก</div>';
        }

        // 3. Aggregate Data (Date -> Product)
        const allProducts = DB.getProducts();
        const reportRows = [];
        // Structure: { dateStr, productId, productName, qty, total, profit }

        rangeSales.forEach(sale => {
            const dateStr = new Date(sale.date).toLocaleDateString('th-TH');

            sale.items.forEach(item => {
                // Find existing row
                let row = reportRows.find(r => r.dateStr === dateStr && r.productId === item.id);

                // Profit Calc
                let cost = item.cost;
                if (cost === undefined || cost === null) {
                    const product = allProducts.find(p => p.id === item.id);
                    cost = product ? (product.cost || 0) : 0;
                }
                const profit = App.getLineTotal(item) - (cost * item.qty);

                if (!row) {
                    row = {
                        dateStr,
                        productId: item.id,
                        productName: item.name,
                        qty: 0,
                        total: 0,
                        profit: 0
                    };
                    reportRows.push(row);
                }

                row.qty += item.qty;
                row.total += App.getLineTotal(item);
                row.profit += profit;
            });
        });

        // 4. Summaries
        const grandTotal = reportRows.reduce((sum, r) => sum + r.total, 0);
        const grandProfit = reportRows.reduce((sum, r) => sum + r.profit, 0);

        // 5. Render Table
        const tableHtml = `
            <div style="overflow-x:auto;">
                <table style="width:100%; border-collapse:collapse; min-width:600px;">
                    <thead style="background:var(--neutral-100); color:#666; font-size:13px;">
                        <tr>
                            <th style="padding:10px; text-align:left;">วันที่</th>
                            <th style="padding:10px; text-align:left;">สินค้า</th>
                            <th style="padding:10px; text-align:center;">จำนวน</th>
                            <th style="padding:10px; text-align:right;">ยอดขาย</th>
                            <th style="padding:10px; text-align:right;">กำไร</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${reportRows.map(row => `
                            <tr style="border-bottom:1px solid #eee; font-size:13px;">
                                <td style="padding:10px;">${row.dateStr}</td>
                                <td style="padding:10px;">${row.productName}</td>
                                <td style="padding:10px; text-align:center;">${row.qty}</td>
                                <td style="padding:10px; text-align:right;">${Utils.formatCurrency(row.total)}</td>
                                <td style="padding:10px; text-align:right; color:var(--success-color);">+${Utils.formatCurrency(row.profit)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                    <tfoot style="background:#f9f9f9; font-weight:bold;">
                        <tr>
                            <td colspan="3" style="padding:15px; text-align:right;">รวม (Total)</td>
                            <td style="padding:15px; text-align:right;">${Utils.formatCurrency(grandTotal)}</td>
                            <td style="padding:15px; text-align:right; color:var(--success-color);">+${Utils.formatCurrency(grandProfit)}</td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        `;

        return controlHtml + tableHtml;
    },

    exportSalesReport: () => {
        // Re-calculate data (or store it in global temp, but re-calc is safer for now)
        const start = new Date(App.state.salesReport.startDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(App.state.salesReport.endDate);
        end.setHours(23, 59, 59, 999);

        const allSales = DB.getSales().sort((a, b) => new Date(a.date) - new Date(b.date));
        const rangeSales = allSales.filter(s => {
            const d = new Date(s.date);
            return d >= start && d <= end;
        });

        if (rangeSales.length === 0) {
            App.alert('ไม่พบข้อมูลที่จะ Export');
            return;
        }

        const allProducts = DB.getProducts();
        const reportRows = [];

        rangeSales.forEach(sale => {
            const dateStr = new Date(sale.date).toLocaleDateString('th-TH');
            sale.items.forEach(item => {
                let row = reportRows.find(r => r.dateStr === dateStr && r.productId === item.id);
                let cost = item.cost;
                if (cost === undefined || cost === null) {
                    const product = allProducts.find(p => p.id === item.id);
                    cost = product ? (product.cost || 0) : 0;
                }
                const profit = App.getLineTotal(item) - (cost * item.qty);

                if (!row) {
                    row = {
                        dateStr,
                        productId: item.id,
                        productName: item.name,
                        qty: 0,
                        total: 0,
                        profit: 0
                    };
                    reportRows.push(row);
                }
                row.qty += item.qty;
                row.total += App.getLineTotal(item);
                row.profit += profit;
            });
        });

        // Generate CSV
        let csvContent = "data:text/csv;charset=utf-8,\uFEFF"; // Add BOM for Thai support
        csvContent += "วันที่,สินค้า,จำนวน,ยอดขาย,กำไร\n";

        reportRows.forEach(row => {
            // Escape commas in product name
            const safeName = `"${row.productName.replace(/"/g, '""')}"`;
            csvContent += `${row.dateStr},${safeName},${row.qty},${row.total.toFixed(2)},${row.profit.toFixed(2)}\n`;
        });

        // Summary Row
        const grandTotal = reportRows.reduce((sum, r) => sum + r.total, 0);
        const grandProfit = reportRows.reduce((sum, r) => sum + r.profit, 0);
        csvContent += `,,รวม (Total),${grandTotal.toFixed(2)},${grandProfit.toFixed(2)}\n`;

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `sales_report_${App.state.salesReport.startDate}_${App.state.salesReport.endDate}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    },

    renderBillList: (sales) => {
        return `
            <table style="width:100%; border-collapse:collapse;">
                <thead style="background:var(--neutral-100);">
                    <tr style="text-align:left; color:#666; font-size:14px;">
                        <th style="padding:15px;">เวลา</th>
                        <th style="padding:15px;">สินค้า</th>
                        <th style="padding:15px; text-align:right;">ยอดเงิน</th>
                        <th style="padding:15px; width:50px;"></th>
                    </tr>
                </thead>
                <tbody>
                    ${sales.map((sale, index) => {
            return `
                        <tr style="border-bottom:1px solid #eee; cursor:pointer;" onclick="App.showBillDetailByID('${sale.billId}')">
                            <td style="padding:15px; font-size:14px; color:#666;">
                                ${new Date(sale.date).toLocaleString('th-TH', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}
                            </td>
                            <td style="padding:15px;">
                                ${sale.items.length} รายการ ${sale.note ? `<span style="font-size:11px; font-weight:bold; padding:2px 6px; border-radius:4px; background:#e0f7fa; color:#006064; margin-left:5px;">${sale.note}</span>` : ''}
                                <div style="font-size:12px; color:#999;">${sale.items[0].name} ${sale.items.length > 1 ? `และอีก ${sale.items.length - 1} รายการ` : ''}</div>
                            </td>
                            <td style="padding:15px; text-align:right; font-weight:bold; color:var(--primary-color);">
                                ฿${Utils.formatCurrency(sale.total)}
                            </td>
                            <td style="padding:15px; text-align:center; color:#ccc;">
                                <span class="material-symbols-rounded">chevron_right</span>
                            </td>
                        </tr>
                    `}).join('')}
                </tbody>
            </table>
        `;
    },

    renderBestSellers: (sales) => {
        // Aggregate
        const productStats = {};
        sales.forEach(sale => {
            sale.items.forEach(item => {
                if (!productStats[item.id]) {
                    productStats[item.id] = {
                        name: item.name,
                        qty: 0,
                        total: 0,
                        id: item.id
                    };
                }
                productStats[item.id].qty += item.qty;
                productStats[item.id].total += App.getLineTotal(item);
            });
        });

        const sorted = Object.values(productStats).sort((a, b) => b.qty - a.qty);
        const maxQty = sorted.length > 0 ? sorted[0].qty : 1;

        return `
            <div style="padding:20px;">
                <h3 style="margin-bottom:15px; font-size:16px;">สินค้าขายดี (ตามจำนวนชิ้น)</h3>
                ${sorted.map((p, i) => `
                    <div class="chart-row">
                        <div class="rank-badge ${i < 3 ? 'top-' + (i + 1) : ''}">${i + 1}</div>
                        <div style="flex:1;">
                            <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                                <span style="font-weight:bold; font-size:14px;">${p.name}</span>
                                <span style="font-size:14px; color:#666;">${p.qty} ชิ้น</span>
                            </div>
                            <div style="width:100%; background:#f0f0f0; height:8px; border-radius:4px; overflow:hidden;">
                                <div style="width:${(p.qty / maxQty) * 100}%; background:var(--primary-color); height:100%;"></div>
                            </div>
                            <div style="text-align:right; font-size:12px; color:#999; margin-top:2px;">฿${Utils.formatCurrency(p.total)}</div>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    },

    renderTopProfit: (sales) => {
        // Aggregate Profit
        const productStats = {};
        const allProducts = DB.getProducts();

        sales.forEach(sale => {
            sale.items.forEach(item => {
                if (!productStats[item.id]) {
                    productStats[item.id] = {
                        name: item.name,
                        profit: 0
                    };
                }
                // Profit Calculation
                let cost = item.cost;
                if (cost === undefined || cost === null) {
                    const product = allProducts.find(p => p.id === item.id);
                    cost = product ? (product.cost || 0) : 0;
                }
                const profit = App.getLineTotal(item) - (cost * item.qty);
                productStats[item.id].profit += profit;
            });
        });

        const sorted = Object.values(productStats).sort((a, b) => b.profit - a.profit);
        const maxProfit = sorted.length > 0 ? sorted[0].profit : 1;

        return `
            <div style="padding:20px;">
                <h3 style="margin-bottom:15px; font-size:16px;">สินค้าทำกำไรสูงสุด</h3>
                ${sorted.map((p, i) => `
                    <div class="chart-row">
                        <div class="rank-badge ${i < 3 ? 'top-' + (i + 1) : ''}">${i + 1}</div>
                        <div style="flex:1;">
                            <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                                <span style="font-weight:bold; font-size:14px;">${p.name}</span>
                                <span style="font-size:14px; color:var(--success-color);">+฿${Utils.formatCurrency(p.profit)}</span>
                            </div>
                            <div style="width:100%; background:#f0f0f0; height:8px; border-radius:4px; overflow:hidden;">
                                <div style="width:${Math.max(0, (p.profit / maxProfit) * 100)}%; background:var(--success-color); height:100%;"></div>
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    },

    renderProfitByCategory: (sales) => {
        const groupStats = {};
        const allProducts = DB.getProducts();

        sales.forEach(sale => {
            sale.items.forEach(item => {
                // Try to find group
                let group = 'Uncategorized';
                if (item.group) group = item.group;
                else {
                    const fresh = allProducts.find(p => p.id === item.id);
                    if (fresh && fresh.group) group = fresh.group;
                }

                // Profit
                let cost = item.cost;
                if (cost === undefined || cost === null) {
                    const product = allProducts.find(p => p.id === item.id);
                    cost = product ? (product.cost || 0) : 0;
                }
                const profit = App.getLineTotal(item) - (cost * item.qty);

                if (!groupStats[group]) groupStats[group] = 0;
                groupStats[group] += profit;
            });
        });

        const sorted = Object.entries(groupStats)
            .map(([name, total]) => ({ name, total }))
            .sort((a, b) => b.total - a.total);

        const totalProfit = sorted.reduce((sum, g) => sum + g.total, 0);

        return `
            <div style="padding:20px;">
                <h3 style="margin-bottom:15px; font-size:16px;">กำไรตามหมวดหมู่</h3>
                ${sorted.map(g => `
                    <div class="chart-row">
                        <div class="chart-label">${g.name}</div>
                        <div class="chart-bar-container">
                            <div class="chart-bar-fill" style="width:${Math.max(0, (g.total / totalProfit) * 100)}%; background:var(--success-color);"></div>
                        </div>
                        <div class="chart-value" style="color:var(--success-color);">+฿${Utils.formatCurrency(g.total)}</div>
                    </div>
                `).join('')}
            </div>
        `;
    },

    renderCategoryBreakdown: (sales) => {
        const groupStats = {};
        const allProducts = DB.getProducts(); // Need to lookup group if not in item

        sales.forEach(sale => {
            sale.items.forEach(item => {
                // Try to find group
                let group = 'Uncategorized';
                if (item.group) group = item.group;
                else {
                    const fresh = allProducts.find(p => p.id === item.id);
                    if (fresh && fresh.group) group = fresh.group;
                }

                if (!groupStats[group]) groupStats[group] = 0;
                groupStats[group] += App.getLineTotal(item);
            });
        });

        const sorted = Object.entries(groupStats)
            .map(([name, total]) => ({ name, total }))
            .sort((a, b) => b.total - a.total);

        const totalSales = sorted.reduce((sum, g) => sum + g.total, 0);

        return `
            <div style="padding:20px;">
                <h3 style="margin-bottom:15px; font-size:16px;">ยอดขายตามหมวดหมู่</h3>
                ${sorted.map(g => `
                    <div class="chart-row">
                        <div class="chart-label">${g.name}</div>
                        <div class="chart-bar-container">
                            <div class="chart-bar-fill" style="width:${(g.total / totalSales) * 100}%;"></div>
                        </div>
                        <div class="chart-value">฿${Utils.formatCurrency(g.total)}</div>
                    </div>
                `).join('')}
            </div>
        `;
    },

    showBillDetailByID: (billId) => {
        const allSales = DB.getSales().sort((a, b) => new Date(b.date) - new Date(a.date));
        const index = allSales.findIndex(s => s.billId === billId);
        if (index >= 0) App.showBillDetail(index);
    },

    showBillDetail: (index) => {
        App.closeModals(); // One-by-one rule
        const sale = DB.getSales().sort((a, b) => new Date(b.date) - new Date(a.date))[index];
        const overlay = document.getElementById('modal-overlay');
        const modal = document.getElementById('price-check-modal'); // Re-use generic modal

        modal.innerHTML = `
            <h2>รายละเอียดบิล</h2>
            ${sale.note ? `<div style="font-size:13px; color:#006064; background:#e0f7fa; padding:6px 12px; border-radius:8px; margin-bottom:12px; font-weight:bold; display:inline-block;">📝 หมายเหตุ: ${sale.note}</div>` : ''}
            <div style="display:flex; justify-content:space-between; color:#666; font-size:14px; margin-bottom:15px;">
                <span>${new Date(sale.date).toLocaleString('th-TH')}</span>
                <span style="font-weight:bold;">${sale.billId}</span>
            </div>
            
            <div style="max-height:300px; overflow-y:auto; border-top:1px solid #eee; border-bottom:1px solid #eee; padding:10px 0;">
                <table style="width:100%;">
                    ${sale.items.map(item => `
                        <tr>
                            <td style="padding:5px 0;">${Utils.escapeHTML(item.name)} <span style="font-size:12px; color:#999;">x${item.qty}</span></td>
                            <td style="text-align:right;">${Utils.formatCurrency(App.getLineTotal(item))}</td>
                        </tr>
                    `).join('')}
                </table>
            </div>
            
            <div style="display:flex; justify-content:space-between; margin-top:15px; font-weight:bold; font-size:18px;">
                <span>รวมทั้งสิ้น</span>
                <span>฿${Utils.formatCurrency(sale.total)}</span>
            </div>

            <div style="display:flex; gap:10px; margin-top:20px;">
                <button class="secondary-btn" style="flex:1; background:#fff3e0; color:#e65100; border:1px solid #ffcc80;" onclick="App.editHistoricalBill('${sale.billId}')">
                    <span class="material-symbols-rounded" style="vertical-align:bottom;">edit_note</span> แก้ไขบิล
                </button>
                <button class="primary-btn" style="flex:1;" onclick="App.printReceiptFromHistory(${index})">
                    <span class="material-symbols-rounded" style="vertical-align:bottom; margin-right:5px;">print</span> พิมพ์
                </button>
            </div>
            <button class="secondary-btn" style="width:100%; margin-top:10px;" onclick="App.closeModals()">ปิด</button>
        `;

        overlay.classList.remove('hidden');
        modal.classList.remove('hidden');
    },

    editHistoricalBill: async (billId) => {
        if (App.state.cart.length > 0) {
            await App.alert('⚠️ ดำเนินการไม่ได้:\nคุณมีสินค้าค้างอยู่ในตะกร้า\nกรุณา "พักบิล" หรือลบตะกร้าทิ้งก่อนทำการแก้ไขบิลเก่าครับ');
            return;
        }

        App.closeModals(); // REQUEST: Hide detail modal before confirmation
        if (!await App.confirm('⚠️ คำเตือน: การแก้ไขบิลจะทำการ:\n1. คืนสต็อกสินค้าเดิมกลับเข้าระบบ\n2. นำรายการสินค้าเข้าตะกร้าเพื่อให้แก้ไข\n\nคุณต้องการดำเนินการต่อหรือไม่?')) return;

        const sale = DB.getSaleById(billId);
        if (!sale) {
            await App.alert('ไม่พบข้อมูลบิลนี้');
            return;
        }

        // 1. Revert Stock (Add back)
        sale.items.forEach(item => {
            if (item.parentId && item.packSize) {
                DB.updateStock(item.parentId, -(item.qty * item.packSize)); // Negative to ADD
            } else {
                DB.updateStock(item.id, -(item.qty));
            }
        });

        // 2. Load to Cart (Deep copy and track originalQty)
        App.state.cart = JSON.parse(JSON.stringify(sale.items)).map(item => ({ ...item, originalQty: item.qty }));
        App.state.editingBillId = sale.billId;
        App.state.editingSaleDate = sale.date;

        // 3. Switch View
        App.renderCart();
        App.closeModals();
        App.renderView('pos');

        await App.alert(`โหลดบิล ${billId} เรียบร้อย\nแก้ไขรายการแล้วกด "ชำระเงิน" เพื่อบันทึกทับบิลเดิม`);
    },

    VERSION: '0.99.26 (10/08/2026)', // Persistent in-app microphone and camera controls

    renderUserSession: (user, syncState = 'synced') => {
        const bar = document.getElementById('user-session-bar');
        if (!bar) return;
        if (!user) {
            bar.classList.add('hidden');
            return;
        }
        const email = document.getElementById('user-session-email');
        const role = document.getElementById('user-session-role');
        const cloud = document.getElementById('user-session-cloud');
        if (email) email.textContent = user.email || 'บัญชี Firebase';
        if (role) role.textContent = `${DB.userRole === 'admin' ? 'ผู้ดูแลระบบ' : 'พนักงาน'} · ${syncState === 'syncing' ? 'กำลังซิงค์ข้อมูล' : 'Firebase เชื่อมต่อแล้ว'}`;
        if (cloud) cloud.textContent = syncState === 'syncing' ? 'cloud_sync' : 'cloud_done';
        bar.classList.toggle('syncing', syncState === 'syncing');
        bar.classList.remove('hidden');
    },

    openAccountModal: () => {
        const user = DB.currentUser;
        if (!user) return;
        const mediaPrefs = DB.getSettings();
        App.closeModals();
        const overlay = document.getElementById('modal-overlay');
        const modal = document.getElementById('account-modal');
        modal.innerHTML = `
            <div class="account-sheet-header">
                <span class="material-symbols-rounded">account_circle</span>
                <div><h2>บัญชีที่กำลังใช้งาน</h2><p>${Utils.escapeHTML(user.email || '')}</p></div>
                <button type="button" onclick="App.closeModals()" aria-label="ปิด"><span class="material-symbols-rounded">close</span></button>
            </div>
            <div class="account-sheet-status"><span class="material-symbols-rounded">cloud_done</span><div><strong>Firebase เชื่อมต่อแล้ว</strong><small>สิทธิ์: ${DB.userRole === 'admin' ? 'ผู้ดูแลระบบ' : 'พนักงาน'}</small></div></div>
            <div class="account-permissions">
                <h3>สิทธิ์ไมค์และกล้องในแอป</h3>
                <label><span class="material-symbols-rounded">mic</span><span><strong>ค้นหาด้วยเสียง</strong><small>จำการตั้งค่านี้ไว้ในเครื่อง</small></span><input type="checkbox" ${mediaPrefs.microphoneEnabled !== false ? 'checked' : ''} onchange="App.setMediaAccess('microphone', this.checked)"></label>
                <label><span class="material-symbols-rounded">photo_camera</span><span><strong>กล้องสแกนบาร์โค้ด</strong><small>จำการตั้งค่านี้ไว้ในเครื่อง</small></span><input type="checkbox" ${mediaPrefs.cameraEnabled !== false ? 'checked' : ''} onchange="App.setMediaAccess('camera', this.checked)"></label>
                <p>สวิตช์นี้หยุดแอปไม่ให้ใช้ไมค์หรือกล้อง หากต้องการถอนสิทธิ์ของ Safari ให้เปลี่ยนที่ “การตั้งค่าเว็บไซต์” ของ iPhone</p>
            </div>
            <button class="account-sheet-action" type="button" onclick="App.sendCurrentUserPasswordReset()"><span class="material-symbols-rounded">lock_reset</span><span><strong>ตั้งรหัสผ่านใหม่</strong><small>ส่งลิงก์ไปยังอีเมลบัญชีนี้</small></span></button>
            <button class="account-sheet-action danger" type="button" onclick="App.logoutCurrentUser()"><span class="material-symbols-rounded">logout</span><span><strong>ออกจากระบบ</strong><small>ข้อมูลสต็อกใน Firebase จะไม่ถูกลบ</small></span></button>`;
        overlay.classList.remove('hidden');
        modal.classList.remove('hidden');
    },

    setMediaAccess: async (feature, enabled) => {
        if (feature === 'microphone') {
            await DB.saveSettings({ microphoneEnabled: enabled });
            if (!enabled && App.state.voiceListening) {
                App.state.voiceListening = false;
                try { App.voiceRecognition?.abort(); } catch (_) {}
                App.updateVoiceSearchButton();
            }
        } else if (feature === 'camera') {
            await DB.saveSettings({ cameraEnabled: enabled });
            if (!enabled && App.state.cameraScanner.active) App.closeCameraScanner();
        }
    },

    sendCurrentUserPasswordReset: async () => {
        const email = DB.currentUser?.email;
        if (!email) return;
        const result = await DB.sendPasswordReset(email);
        if (result.success) await App.alert(`ส่งลิงก์ตั้งรหัสผ่านใหม่ไปที่\n${email}\n\nกรุณาตรวจกล่องจดหมายและจดหมายขยะ`);
        else await App.alert(result.message);
    },

    logoutCurrentUser: async () => {
        if (!await App.confirm('ต้องการออกจากระบบบัญชีนี้ใช่หรือไม่?', 'ออกจากระบบ')) return;
        App.closeModals();
        await DB.logout();
    },

    checkForAppUpdate: async () => {
        try {
            const response = await fetch(`version.json?t=${Date.now()}`, { cache: 'no-store' });
            if (!response.ok) return;
            const remote = await response.json();
            const current = App.VERSION.split(' ')[0];
            if (remote.version && remote.version !== current) {
                const url = new URL(window.location.href);
                url.searchParams.set('v', remote.version);
                window.location.replace(url.toString());
            }
        } catch (_) {}
    },

    requestPasswordReset: async () => {
        const emailInput = document.getElementById('login-email');
        const status = document.getElementById('password-reset-status');
        const button = document.getElementById('btn-forgot-password');
        if (!emailInput || !status || !button) return;
        const email = emailInput.value.trim();
        status.className = 'login-reset-status';
        status.textContent = '';
        if (!email) {
            status.classList.add('error');
            status.textContent = 'กรุณากรอกอีเมล แล้วกดลืมรหัสผ่านอีกครั้ง';
            emailInput.focus();
            return;
        }
        button.disabled = true;
        button.textContent = 'กำลังส่งอีเมล…';
        const result = await DB.sendPasswordReset(email);
        button.disabled = false;
        button.textContent = 'ลืมรหัสผ่าน?';
        if (result.success) {
            status.classList.add('success');
            status.textContent = `ส่งลิงก์ตั้งรหัสผ่านใหม่ไปที่ ${email} แล้ว กรุณาตรวจกล่องจดหมายและจดหมายขยะ`;
        } else {
            status.classList.add('error');
            status.textContent = result.message;
        }
    },

    formatStockBreakdown: (product, stockValue = null) => {
        const stock = Math.max(0, Number(stockValue === null ? product.stock : stockValue) || 0);
        const unitsPerBox = Math.max(0, parseInt(product.unitsPerBox) || 0);
        const unitLabel = product.unitLabel || 'ชิ้น';
        if (unitsPerBox <= 1) return `${stock} ${unitLabel}`;
        const boxes = Math.floor(stock / unitsPerBox);
        const looseUnits = stock % unitsPerBox;
        return `${boxes} กล่อง ${looseUnits} ${unitLabel} (รวม ${stock} ${unitLabel})`;
    },

    // --- Settings View ---
    renderSettingsView: (container) => {
        const settings = DB.getSettings();
        let approvalsBtn = '';
        if (DB.userRole === 'admin') {
            approvalsBtn = `
            <div style="margin-bottom:20px;">
                <button onclick="App.renderView('approvals')" style="width:100%; padding:15px; background:var(--warning-color); color:white; border:none; border-radius:8px; font-size:18px; font-weight:bold; cursor:pointer; display:flex; justify-content:center; align-items:center; gap:10px;">
                    <span class="material-symbols-rounded">pending_actions</span>
                    รายการรออนุมัติจากพนักงาน
                </button>
            </div>`;
        }

        container.innerHTML = `
            <div class="settings-page-header">
                <h2>ตั้งค่าระบบ</h2>
                <div style="font-size:14px; color:#888; margin-bottom:5px;">เวอร์ชัน ${App.VERSION}</div>
            </div>
            ${approvalsBtn}
            <div class="settings-grid">
                <!-- Store Config -->
                <div class="settings-card">
                    <h3>ข้อมูลร้านค้า</h3>
                    <p style="color:#666; font-size:14px; margin-bottom:15px;">ชื่อนี้จะปรากฏบนใบเสร็จ (ไม่มีผลกับบิลเก่า)</p>
                    <label>ชื่อร้าน</label>
                    <input type="text" id="set-store-name" value="${settings.storeName}" style="width:100%; padding:10px; font-size:18px; margin-bottom:10px;">
                    
                    <label>ที่อยู่ร้าน (บรรทัดที่ 1)</label>
                    <input type="text" id="set-address" value="${settings.address || ''}" placeholder="บ้านเลขที่, ถนน, แขวง/ตำบล" style="width:100%; padding:10px; font-size:16px; margin-bottom:10px;">
                    
                    <label>เบอร์โทรศัพท์</label>
                    <input type="tel" id="set-phone" value="${settings.phone || ''}" placeholder="08x-xxx-xxxx" style="width:100%; padding:10px; font-size:16px; margin-bottom:10px;">

                    <button class="primary-btn" onclick="App.saveStoreName()">บันทึกข้อมูลร้าน</button>
                </div>
                <!-- Security Config -->
                <div class="settings-card">
                    <h3>ความปลอดภัย</h3>
                    <div style="margin-bottom:15px;">
                        <label>เปลี่ยนรหัสผ่าน (PIN)</label>
                        <input type="password" id="set-new-pin" placeholder="รหัสใหม่ 4 หลัก" maxlength="4" style="width:100%; padding:10px; font-size:18px; letter-spacing:2px; margin-top:5px;">
                    </div>
                    <button class="secondary-btn" onclick="App.changePin()">เปลี่ยนรหัสผ่าน</button>
                </div>
                <!-- Backup -->
                <div class="settings-card settings-card-centered">
                    <span class="material-symbols-rounded" style="font-size:48px; color:var(--primary-color);">cloud_download</span>
                    <h3>สำรองข้อมูล</h3>
                    <button class="primary-btn" onclick="App.backupData()">Download Backup</button>
                </div>
                <!-- Firebase Sync -->
                <div class="settings-card settings-card-centered">
                    <span class="material-symbols-rounded" style="font-size:48px; color:#f57c00;">cloud_sync</span>
                    <h3>ซิงก์จำนวนสต็อก</h3>
                    <p style="color:#666; font-size:14px; margin-bottom:15px;">ส่งเฉพาะจำนวนคงเหลือ ไม่ส่งชื่อ ราคา หรือรูปสินค้า</p>
                    <button class="primary-btn" style="background:#f57c00; border:none;" onclick="App.uploadProductsToFirebase(event)">ส่งสต็อกไป Firebase</button>
                </div>
                <!-- Restore -->
                <div class="settings-card settings-card-centered">
                    <span class="material-symbols-rounded" style="font-size:48px; color:var(--warning-color);">cloud_upload</span>
                    <h3>เรียกคืนข้อมูล</h3>
                    <input type="file" id="restore-input" accept=".json" style="display:none;" onchange="App.restoreData(this)">
                    <button class="secondary-btn" onclick="document.getElementById('restore-input').click()">Upload Backup</button>
                </div>

                <!-- Storage Management (Expand Storage) -->
                <div id="storage-management-card" style="background:var(--primary-light); padding:20px; border-radius:12px; box-shadow:var(--shadow-sm); text-align:center; grid-column:1 / -1; border:2px dashed var(--primary-color); margin-top:10px;">
                    <div style="display:flex; flex-direction:column; align-items:center; gap:10px;">
                        <span class="material-symbols-rounded" style="font-size:48px; color:var(--primary-color);">speed</span>
                        <h3 style="margin:0; color:var(--primary-color);">จัดการพื้นที่จัดเก็บและการแสดงผล</h3>
                        <p style="color:var(--primary-dark); font-size:14px; margin-bottom:5px; max-width:500px;">
                            หากพบปัญหา <b>"พื้นที่เต็ม"</b> หรือเครื่องเริ่มทำงานช้าลง ให้กดปุ่มนี้เพื่อบีบอัดรูปภาพเก่าทั้งหมดในระบบ (ช่วยให้เก็บสินค้าได้เพิ่มขึ้นอีกหลายเท่าตัว)
                        </p>
                        <button class="primary-btn" onclick="App.runStorageCleanup()" style="min-width:250px; height:50px; font-size:16px;">
                            <span class="material-symbols-rounded" style="vertical-align:middle; margin-right:8px;">auto_fix_high</span>
                            ขยายพื้นที่จัดเก็บ (บีบอัดรูปภาพเก่า)
                        </button>
                        <div id="cleanup-progress" style="margin-top:10px; font-size:14px; color:var(--primary-color); font-weight:bold; display:none;">
                             กำลังขยายพื้นที่...
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Group Images Config -->
            <div style="background:white; padding:20px; border-radius:8px; box-shadow:var(--shadow-sm); margin-top:20px;">
                <h3>รูปภาพหมวดหมู่สินค้า</h3>
                <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap:15px; margin-top:15px;">
                    ${(() => {
                const products = DB.getProducts();
                const groups = [...new Set(products.map(p => p.group).filter(g => g))]; // Unique Groups
                const groupImages = DB.getGroupImages();

                if (groups.length === 0) return '<div style="color:#999; grid-column:1/-1;">ยังไม่มีหมวดหมู่สินค้า (สร้างสินค้าและระบุหมวดหมู่ก่อน)</div>';

                return groups.map(g => {
                    const img = groupImages[g];
                    return `
                                <div style="text-align:center; border:1px solid #eee; padding:10px; border-radius:8px;">
                                    <div style="font-weight:bold; margin-bottom:5px; font-size:14px;">${g}</div>
                                    <div id="preview-group-${g}" style="width:100px; height:100px; background:#f9f9f9; margin:0 auto; display:flex; align-items:center; justify-content:center; overflow:hidden; border-radius:4px; border:1px solid #ddd;">
                                        ${img ? `<img src="${img}" style="width:100%; height:100%; object-fit:cover;">` : '<span class="material-symbols-rounded" style="font-size:32px; color:#ccc;">image</span>'}
                                    </div>
                                    <div style="display:flex; justify-content:center; gap:5px; margin-top:10px;">
                                        <input type="file" id="upload-group-${g}" accept="image/*" style="display:none;" onchange="App.handleGroupImageUpload(this, '${g}')">
                                        <button class="secondary-btn" onclick="document.getElementById('upload-group-${g}').click()" style="padding:5px 10px; font-size:12px;">
                                            <span class="material-symbols-rounded" style="font-size:16px;">upload</span>
                                        </button>
                                        ${img ? `
                                            <button class="icon-btn dangerous" onclick="App.removeGroupImage('${g}')" style="width:30px; height:30px; border:1px solid #ffcdd2;">
                                                <span class="material-symbols-rounded" style="font-size:16px;">delete</span>
                                            </button>
                                        ` : ''}
                                    </div>
                                </div>
                            `;
                }).join('');
            })()}
                </div>
            </div>

            <!-- Printer Config -->
            <div style="background:white; padding:20px; border-radius:8px; box-shadow:var(--shadow-sm); margin-top:20px;">
                <h3>ตั้งค่าใบเสร็จ (80mm / 58mm)</h3>
                <!-- Responsive Grid: Stacks on mobile, Side-by-side on desktop -->
                <div style="display:flex; flex-wrap:wrap; gap:20px; margin-top:15px;">
                    <!-- Logo Upload -->
                    <div class="receipt-image-setting">
                        <label>โลโก้ร้าน (หัวบิล)</label>
                        <div style="display:flex; gap:10px; align-items:center; margin-top:5px;">
                            <div id="preview-logo" style="width:80px; height:80px; background:#eee; border-radius:8px; overflow:hidden; display:flex; align-items:center; justify-content:center; border:1px solid #ddd;">
                                ${settings.logo ? `<img src="${settings.logo}" style="width:100%; height:100%; object-fit:contain;">` : '<span style="color:#ccc; font-size:12px;">No Logo</span>'}
                            </div>
                            <div style="flex:1; display:flex; gap:10px; align-items:center;">
                                <input type="file" id="set-logo-input" accept="image/*" style="display:none;" onchange="App.handleImagePreview(this, 'preview-logo')">
                                <button class="secondary-btn" onclick="document.getElementById('set-logo-input').click()" style="height:40px; min-width:40px; padding:0 15px; display:flex; align-items:center; justify-content:center; gap:5px;">
                                    <span class="material-symbols-rounded">folder_open</span> เลือกรูป
                                </button>
                                <button class="icon-btn dangerous" onclick="App.clearImage('logo')" style="height:40px; width:40px; display:flex; align-items:center; justify-content:center; border:1px solid #ffcdd2;">
                                    <span class="material-symbols-rounded">delete</span>
                                </button>
                            </div>
                        </div>
                    </div>
                    
                    <!-- QR Upload -->
                    <div class="receipt-image-setting">
                        <label>QR Code รับเงิน (ท้ายบิล)</label>
                        <div style="display:flex; gap:10px; align-items:center; margin-top:5px;">
                            <div id="preview-qr" style="width:80px; height:80px; background:#eee; border-radius:8px; overflow:hidden; display:flex; align-items:center; justify-content:center; border:1px solid #ddd;">
                                ${settings.qrCode ? `<img src="${settings.qrCode}" style="width:100%; height:100%; object-fit:contain;">` : '<span style="color:#ccc; font-size:12px;">No QR</span>'}
                            </div>
                            <div style="flex:1; display:flex; gap:10px; align-items:center;">
                                <input type="file" id="set-qr-input" accept="image/*" style="display:none;" onchange="App.handleImagePreview(this, 'preview-qr')">
                                <button class="secondary-btn" onclick="document.getElementById('set-qr-input').click()" style="height:40px; min-width:40px; padding:0 15px; display:flex; align-items:center; justify-content:center; gap:5px;">
                                    <span class="material-symbols-rounded">folder_open</span> เลือกรูป
                                </button>
                                <button class="icon-btn dangerous" onclick="App.clearImage('qrCode')" style="height:40px; width:40px; display:flex; align-items:center; justify-content:center; border:1px solid #ffcdd2;">
                                    <span class="material-symbols-rounded">delete</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <div style="margin-top:15px; border-top:1px solid #eee; padding-top:15px;">
                     <label style="display:flex; align-items:center; gap:10px; cursor:pointer;">
                        <input type="checkbox" id="set-print-logo" ${settings.printLogo ? 'checked' : ''}>
                        พิมพ์โลโก้ที่หัวบิล (Default)
                    </label>
                    <label style="display:flex; align-items:center; gap:10px; cursor:pointer; margin-top:5px;">
                        <input type="checkbox" id="set-print-qr" ${settings.printQr ? 'checked' : ''}>
                        พิมพ์ QR Code ที่ท้ายบิล (Default)
                    </label>
                    <label style="display:flex; align-items:center; gap:10px; margin-top:10px;">
                        เว้นบรรทัดท้ายบิล (สำหรับฉีก/ตัด)
                        <input type="number" id="set-printer-feed" value="${settings.printerFeedLines !== undefined ? settings.printerFeedLines : 5}" min="0" max="50" style="width:60px; padding:5px; font-size:16px; text-align:center; border:1px solid #ddd; border-radius:4px;">
                        <span style="font-size:12px; color:#888;">บรรทัด</span>
                    </label>
                </div>
                
                <button class="primary-btn" onclick="App.savePrinterSettings()" style="margin-top:15px;">บันทึกตั้งค่าเครื่องพิมพ์</button>
            </div>
            <div style="margin-top:40px; text-align:center;">
                 <p style="color:#999; font-size:12px;">Grocery POS v${App.VERSION}</p>
                 <p style="color:#ccc; font-size:10px;">ID: ${new Date().getTime().toString().slice(-6)}</p>
                 <button onclick="window.location.reload(true)" style="margin-top:10px; background:none; border:1px solid #eee; padding:5px 10px; border-radius:4px; color:#999; font-size:10px;">
                    Force Update / Refresh
                 </button>
            </div>
        `;
    },

    saveStoreName: () => {
        const name = document.getElementById('set-store-name').value;
        const address = document.getElementById('set-address').value;
        const phone = document.getElementById('set-phone').value;

        if (!name) {
            App.alert('กรุณาใส่ชื่อร้าน');
            return;
        }

        App.checkPin(async () => {
            const settings = DB.getSettings();
            settings.storeName = name;
            settings.address = address;
            settings.phone = phone;
            await DB.saveSettings(settings);

            await App.alert('บันทึกข้อมูลร้านและซิงก์ Firebase เรียบร้อยแล้ว!');
            App.renderSettingsView(document.getElementById('view-container'));
        });
    },

    runStorageCleanup: async () => {
        if (!await App.confirm('⚠️ ยืนยันการบีบอัดรูปภาพเก่า?\n\nระบบจะทำการย่อขนาดรูปภาพสินค้าทั้งหมดเพื่อเพิ่มพื้นที่จัดเก็บ ข้อมูลอื่นๆ จะยังอยู่ครบถ้วน\n(แนะนำให้ Download Backup เก็บไว้ก่อนเพื่อความปลอดภัย)')) return;

        const progressDiv = document.getElementById('cleanup-progress');
        if (progressDiv) {
            progressDiv.style.display = 'block';
            progressDiv.style.color = 'var(--primary-color)';
        }
        
        try {
            const count = await DB.recompressAllProducts((current, total) => {
                if (progressDiv) progressDiv.textContent = `กำลังดำเนินการ: ${current} / ${total} รายการ... ${Math.round((current/total)*100)}%`;
            });

            App.state.products = DB.getProducts(); // Refresh 
            
            if (progressDiv) {
                progressDiv.style.color = 'var(--success-color)';
                progressDiv.textContent = `✨ สำเร็จ! บีบอัดไปทั้งหมด ${count} รูปภาพ พื้นที่ว่างเพิ่มขึ้นแล้ว`;
            }
            
            setTimeout(async () => {
                await App.alert(`🎉 ขยายพื้นที่สำเร็จ!\nบีบอัดรูปภาพสินค้าไปทั้งหมด ${count} รายการ\nท่านสามารถเพิ่มสินค้าและรูปภาพใหม่ได้ทันทีครับ`);
                if (progressDiv) progressDiv.style.display = 'none';
            }, 500);
        } catch (err) {
            console.error('Cleanup Error:', err);
            await App.alert('เกิดข้อผิดพลาดระหว่างการบีบอัด');
            if (progressDiv) progressDiv.style.display = 'none';
        }
    },


    changePin: () => {
        const newPin = document.getElementById('set-new-pin').value;
        if (!/^\d{4}$/.test(newPin)) {
            App.alert('รหัสผ่านต้องเป็นตัวเลข 4 หลัก');
            return;
        }
        App.checkPin(async () => {
            await DB.saveSettings({ pin: newPin });
            await App.alert('เปลี่ยนรหัสผ่านเรียบร้อยแล้ว!');
        });
    },

    backupData: () => {
        const data = DB.exportData();
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `backup_pos_${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
    },

    uploadProductsToFirebase: async (event) => {
        if (typeof dbFirestore === 'undefined' || !dbFirestore) {
            App.alert("ไม่พบการตั้งค่า Firebase กรุณาตรวจสอบ db.js");
            return;
        }
        // Check if user is logged in first
        if (!DB.currentUser) {
            App.alert("กรุณาล็อกอินก่อนทำการอัปโหลดข้อมูลครับ");
            return;
        }
        if (!confirm("ยืนยันส่งเฉพาะจำนวนสต็อกทั้งหมดจากเครื่องนี้ไป Firebase? ข้อมูลชื่อ ราคา และรูปสินค้าจะไม่ถูกส่ง")) return;
        
        const originalBtnText = event.target.innerText;
        event.target.innerText = 'กำลังอัปโหลด...';
        event.target.disabled = true;

        try {
            const products = DB.getProducts();
            let count = 0;
            // Batch writes could be faster, but loop is simple and reliable for <500 items
            const batch = dbFirestore.batch();
            for (const p of products) {
                const stock = Number(p.stock);
                if (!Number.isFinite(stock)) throw new Error(`Invalid stock for product ${p.id}`);
                const stockRef = dbFirestore.collection(DB.STOCK_COLLECTION).doc(p.id.toString());
                batch.set(stockRef, {
                    stock,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
                count++;
            }
            await batch.commit();
            App.alert(`ส่งจำนวนสต็อก ${count} รายการไป Firebase สำเร็จ!`);
        } catch (e) {
            console.error(e);
            App.alert("เกิดข้อผิดพลาดในการอัปโหลด: " + e.message);
        } finally {
            event.target.innerText = originalBtnText;
            event.target.disabled = false;
        }
    },

    savePrinterSettings: async () => {
        const printLogo = document.getElementById('set-print-logo').checked;
        const printQr = document.getElementById('set-print-qr').checked;
        const feedInput = document.getElementById('set-printer-feed');
        const printerFeedLines = feedInput ? parseInt(feedInput.value) || 0 : 5;

        // Handle Images
        const logoInput = document.getElementById('set-logo-input');
        const qrInput = document.getElementById('set-qr-input');

        const updates = { printLogo, printQr, printerFeedLines };

        try {
            if (logoInput.files[0]) {
                const raw = await Utils.fileToBase64(logoInput.files[0]);
                updates.logo = await Utils.compressImage(raw, 300, 0.7);
            }
            if (qrInput.files[0]) {
                const raw = await Utils.fileToBase64(qrInput.files[0]);
                updates.qrCode = await Utils.compressImage(raw, 300, 0.7);
            }

            await DB.saveSettings(updates);
            await App.alert('บันทึกตั้งค่าใบเสร็จและซิงก์ Firebase เรียบร้อยแล้ว!');
            App.renderView('settings');
        } catch (e) {
            await App.alert('เกิดข้อผิดพลาดในการบันทึกภาพ (อาจใหญ่เกินไป): ' + e.message);
        }
    },

    handleGroupImageUpload: async (input, groupName) => {
        if (input.files && input.files[0]) {
            try {
                const raw = await Utils.fileToBase64(input.files[0]);
                const compressed = await Utils.compressImage(raw, 250, 0.5);
                DB.setGroupImage(groupName, compressed);
                App.renderView('settings'); // Re-render to show new image
            } catch (err) {
                console.error('Group Upload Error:', err);
                App.alert('ไม่สามารถอัปโหลดรูปภาพหมวดหมู่ได้');
            }
        }
    },

    removeGroupImage: async (groupName) => {
        if (await App.confirm(`ลบรูปภาพหมวดหมู่ "${groupName}"?`)) {
            DB.removeGroupImage(groupName);
            App.renderView('settings');
        }
    },

    handleImagePreview: async (input, previewId) => {
        if (input.files && input.files[0]) {
            try {
                const raw = await Utils.fileToBase64(input.files[0]);
                const compressed = await Utils.compressImage(raw, 300, 0.7);
                const preview = document.getElementById(previewId);
                if (preview) {
                    preview.innerHTML = `<img src="${compressed}" style="width:100%; height:100%; object-fit:contain;">`;
                    // Note: Dataset is used during savePrinterSettings as backup if needed 
                    // though here it's mainly for display.
                    preview.dataset.base64 = compressed;
                }
            } catch (err) {
                console.error('Preview Error:', err);
                App.alert('ไม่สามารถแสดงตัวอย่างภาพได้');
            }
        }
    },

    clearImage: async (type) => {
        if (!await App.confirm('ต้องการลบรูปภาพนี้ใช่หรือไม่?')) return;

        const updates = {};
        updates[type] = null;
        await DB.saveSettings(updates);
        App.renderView('settings');
    },

    restoreData: (input) => {
        const file = input.files[0];
        if (!file) return;

        // Show Processing Overlay
        const overlay = document.createElement('div');
        overlay.id = 'import-progress-overlay';
        overlay.style = 'position:fixed; inset:0; background:rgba(255,255,255,0.9); z-index:9999; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; padding:20px;';
        overlay.innerHTML = `
            <div style="font-size:48px; margin-bottom:20px;">📦</div>
            <h2 style="color:var(--primary-color);">กำลังกู้คืนข้อมูล...</h2>
            <p id="import-status" style="margin-top:10px; color:#666;">กรุณารอสักครู่ ระบบกำลังนำเข้าข้อมูลสินค้า</p>
            <div id="import-progress-bar-container" style="width:200px; height:10px; background:#eee; border-radius:5px; margin-top:20px; overflow:hidden; display:none;">
                <div id="import-progress-bar" style="width:0%; height:100%; background:var(--primary-color); transition:width 0.3s;"></div>
            </div>
        `;
        document.body.appendChild(overlay);

        const reader = new FileReader();
        reader.onload = async (e) => {
            const statusEl = document.getElementById('import-status');
            const barContainer = document.getElementById('import-progress-bar-container');
            const bar = document.getElementById('import-progress-bar');

            // Use the new async importData with progress callback
            const result = await DB.importData(e.target.result, (current, total) => {
                barContainer.style.display = 'block';
                statusEl.innerHTML = `พื้นที่เก็บข้อมูลในเครื่องไม่พอ<br><b>ระบบกำลังย่อขนาดรูปภาพให้อัตโนมัติ...</b><br>(${current} / ${total} รายการ)`;
                bar.style.width = (current / total * 100) + '%';
            });

            if (result.success) {
                const correctionNote = result.correctedStocks > 0
                    ? `<br><small>ปรับสต็อกผิดปกติเป็น 0 จำนวน ${result.correctedStocks} รายการ</small>`
                    : '';
                const internalCodeNote = result.internalBarcodeProducts > 0
                    ? `<br><small>นำเข้าสินค้าไม่มีบาร์โค้ดโดยใช้รหัสภายใน ${result.internalBarcodeProducts} รายการ</small>`
                    : '';
                statusEl.innerHTML = `<span style="color:green; font-weight:bold;">✅ กู้คืนข้อมูลสำเร็จ!${correctionNote}${internalCodeNote}<br>กำลังเริ่มระบบใหม่...</span>`;
                setTimeout(() => location.reload(), 1500);
            } else {
                overlay.remove();
                await App.alert('เกิดข้อผิดพลาด: ' + result.message);
            }
        };
        reader.readAsText(file);
    },    setQuickFilter: (groupName) => {
        if (groupName === 'all') {
            App.state.searchQuery = '';
        } else {
            App.state.searchQuery = groupName;
        }
        if (App.elements.globalSearch) {
            App.elements.globalSearch.value = App.state.searchQuery;
        }
        App.renderView(App.state.currentView);
    },

    renderQuickFilterBarHtml: () => {
        const products = App.state.products || [];
        const groups = [...new Set(products.map(p => p.group).filter(g => g))];
        if (groups.length === 0) return '';
        
        const currentFilter = App.state.searchQuery || 'all';
        let chipsHtml = `<div class="quick-filter-chip ${currentFilter === 'all' ? 'active' : ''}" onclick="App.setQuickFilter('all')">ทั้งหมด</div>`;
        
        groups.forEach(g => {
            const isActive = currentFilter === g;
            chipsHtml += `<div class="quick-filter-chip ${isActive ? 'active' : ''}" onclick="App.setQuickFilter('${g}')">${g}</div>`;
        });

        return `
            <div class="quick-filter-bar" style="margin-top: 10px; margin-bottom: 10px; border-radius: 8px;">
                ${chipsHtml}
            </div>
        `;
    },

    setPOSSortMode: (mode) => {
        const settings = DB.getSettings();
        settings.posSortMode = ['no_barcode', 'popular', 'name'].includes(mode) ? mode : 'no_barcode';
        DB.saveSettings(settings);
        App.renderProductGrid();
    },

    getProductPopularity: () => {
        const counts = {};
        (DB.getSales() || []).forEach(sale => (sale.items || []).forEach(item => {
            const id = item.productId || item.id;
            if (id) counts[id] = (counts[id] || 0) + (Number(item.quantity) || 1);
        }));
        return counts;
    },

    // --- POS View ---
    renderPOSView: (container) => {
        container.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
                <h2>ขายสินค้า</h2>
                <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; justify-content:flex-end;">
                    <select class="pos-sort-select" aria-label="เรียงสินค้าหน้าขาย" onchange="App.setPOSSortMode(this.value)">
                        <option value="no_barcode" ${(!DB.getSettings().posSortMode || DB.getSettings().posSortMode === 'no_barcode') ? 'selected' : ''}>ไม่มีบาร์โค้ดก่อน</option>
                        <option value="popular" ${DB.getSettings().posSortMode === 'popular' ? 'selected' : ''}>ขายบ่อยก่อน</option>
                        <option value="name" ${DB.getSettings().posSortMode === 'name' ? 'selected' : ''}>ชื่อ ก-ฮ</option>
                    </select>
                    <button class="secondary-btn" style="display:flex; align-items:center; gap:5px;" onclick="App.showManualEntryModal()">
                        <span class="material-symbols-rounded">edit_square</span> พิมพ์รายการเอง
                    </button>
                </div>
            </div>
            ${App.renderQuickFilterBarHtml()}
            <div class="product-grid" id="product-grid">
                <!-- Products will be injected here -->
            </div>
        `;
        App.renderProductGrid();
    },

    renderProductGrid: () => {
        const grid = document.getElementById('product-grid');
        if (!grid) return;

        let displayProducts = [...App.state.products];
        const query = App.state.searchQuery.trim().toLowerCase();
        if (query) {
            displayProducts = displayProducts.filter(p =>
                (p.name && p.name.toLowerCase().includes(query)) ||
                (p.barcode && p.barcode.includes(query)) ||
                (p.packBarcode && p.packBarcode.includes(query)) ||
                (p.group && p.group.toLowerCase().includes(query))
            );
            displayProducts.sort((a, b) => {
                const aName = (a.name || '').toLowerCase();
                const bName = (b.name || '').toLowerCase();
                const aScore = aName === query ? 0 : aName.startsWith(query) ? 1 : 2;
                const bScore = bName === query ? 0 : bName.startsWith(query) ? 1 : 2;
                return aScore - bScore || aName.localeCompare(bName, 'th');
            });
        } else {
            const sortMode = DB.getSettings().posSortMode || 'no_barcode';
            const popularity = sortMode === 'popular' ? App.getProductPopularity() : {};
            displayProducts.sort((a, b) => {
                if (sortMode === 'popular') return (popularity[b.id] || 0) - (popularity[a.id] || 0) || (a.name || '').localeCompare(b.name || '', 'th');
                if (sortMode === 'name') return (a.name || '').localeCompare(b.name || '', 'th');
                return Number(a.hasBarcode !== false) - Number(b.hasBarcode !== false) || (a.name || '').localeCompare(b.name || '', 'th');
            });
        }

        // Aggregate by Group
        const groups = {};
        const singles = [];

        displayProducts.forEach(p => {
            if (!query && p.hasBarcode !== false && p.group) {
                if (!groups[p.group]) groups[p.group] = [];
                groups[p.group].push(p);
            } else {
                singles.push(p);
            }
        });

        // 1. Render Groups (Folders)
        const groupImages = DB.getGroupImages();

        const groupHtml = Object.keys(groups).map(groupName => {
            const items = groups[groupName];
            // Prioritize Custom Group Image -> First Item Image -> Placeholder
            const coverImage = groupImages[groupName] || items[0].image;

            return `
                <div class="product-card" onclick="App.openVariantModal('${groupName}')" style="border: 2px solid var(--primary-color);">
                    <div style="height:120px; background:#e0ecff; display:flex; align-items:center; justify-content:center; overflow:hidden; position:relative;">
                        ${coverImage ? `<img src="${coverImage}" style="width:100%; height:100%; object-fit:cover; opacity:0.9;">` : ''}
                        <div style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; background:rgba(255,255,255,0.2);">
                            <span class="material-symbols-rounded" style="font-size:48px; color:var(--primary-color); text-shadow:0 0 5px white;">folder</span>
                        </div>
                    </div>
                    <div class="p-info" style="background:var(--primary-light);">
                        <div class="p-name" style="color:var(--primary-color); font-weight:bold;">${groupName}</div>
                        <div class="p-price">${items.length} รายการ</div>
                    </div>
                </div>
            `;
        }).join('');

        // 2. Render Singles
        const singleHtml = singles.map((p, index) => {
            let displayStock = p.stock;
            // Bundle Stock Calculation
            if (p.parentId && p.packSize) {
                const parent = App.state.products.find(x => x.id === p.parentId);
                displayStock = parent ? Math.floor(parent.stock / p.packSize) : 0;
            }

            // Days until expiry
            let badgeHtml = '';
            if (p.expiryDate) {
                const daysLeft = Math.ceil((new Date(p.expiryDate) - new Date()) / (1000 * 60 * 60 * 24));
                if (daysLeft <= 0) badgeHtml += '<div class="stock-badge dangerous" style="top:25px;">Expired!</div>';
                else if (daysLeft <= 7) badgeHtml += '<div class="stock-badge dangerous" style="top:25px;">Exp: 7d</div>';
                else if (daysLeft <= 30) badgeHtml += '<span class="material-symbols-rounded" style="position:absolute; top:5px; right:5px; color:#ffc107; background:white; border-radius:50%; padding:2px;">history_toggle_off</span>';
            }

            // Tags
            if (p.tags && p.tags.includes('promo')) {
                badgeHtml += '<div class="stock-badge" style="background:var(--danger-color); top:5px; left:5px; right:auto;">🔥 Promo</div>';
            }

            let sectionHeader = '';
            if (!query && p.hasBarcode === false && index === 0) {
                sectionHeader = '<div class="product-grid-section"><span class="material-symbols-rounded">touch_app</span> สินค้าไม่มีบาร์โค้ด · แตะเพื่อขาย</div>';
            } else if (!query && p.hasBarcode !== false && index > 0 && singles[index - 1].hasBarcode === false) {
                sectionHeader = '<div class="product-grid-section">สินค้าอื่น</div>';
            }

            return `${sectionHeader}
            <div class="product-card" onclick="App.addToCart(App.state.products.find(x => x.id === '${p.id}'))" style="${p.tags && p.tags.includes('promo') ? 'border:2px solid var(--danger-color);' : ''}">
                ${p.hasBarcode === false ? '<div class="stock-badge no-barcode">แตะขาย · ไม่มีบาร์โค้ด</div>' : ''}
                ${displayStock <= 5 ? '<div class="stock-badge low">Low Stock</div>' : ''}
                ${badgeHtml}
                <div style="height:120px; background:#f0f0f0; display:flex; align-items:center; justify-content:center; overflow:hidden;">
                    ${p.image ? `<img src="${p.image}" style="width:100%; height:100%; object-fit:cover;">` : '<span class="material-symbols-rounded" style="font-size:48px; color:#ccc;">image</span>'}
                </div>
                <div class="p-info">
                    <div class="p-name">${p.name}</div>
                    <div class="p-price">฿${Utils.formatCurrency(p.price)}</div>
                    <div class="p-stock">${displayStock} ${p.unitLabel || 'ชิ้น'}</div>
                    ${p.unitsPerBox > 1 ? `
                    <div style="font-size:10px; color:#888; text-align:center; margin-top:2px;">
                        ${App.formatStockBreakdown(p, displayStock)}
                    </div>
                    ` : p.wholesaleQty > 0 ? `
                    <div style="font-size:10px; color:#888; text-align:center; margin-top:2px;">
                        (${Math.floor(displayStock / p.wholesaleQty)} ลัง ${displayStock % p.wholesaleQty} ชิ้น)
                    </div>
                    ` : ''}
                </div>
            </div>
            `;
        }).join('');

        grid.innerHTML = singleHtml + groupHtml;
    },

    // --- Stock View ---
    renderStockView: (container) => {
        const { products } = App.getFilteredStock();

        // Calculate Totals (Global)
        const allProducts = App.state.products;
        const totalCostValue = allProducts.reduce((sum, p) => sum + (p.stock * (p.cost || 0)), 0);
        const totalSalesValue = allProducts.reduce((sum, p) => sum + (p.stock * p.price), 0);
        const totalItems = allProducts.reduce((sum, p) => sum + p.stock, 0);
        const lowStockCount = allProducts.filter(p => p.stock <= 5).length;
        const existingGroups = [...new Set(allProducts.map(p => p.group).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'th'));
        const selectedCount = App.state.selectedStockProductIds.length;

        container.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <h2>จัดการสต็อก</h2>
                <div style="text-align:right; display:flex; gap:10px; align-items:center; flex-wrap:wrap; justify-content:flex-end;">
                    <button class="secondary-btn ${App.state.stockBulkMode ? 'bulk-mode-active' : ''}" onclick="App.requestToggleStockBulkMode()" style="display:flex; align-items:center; gap:5px; padding:10px 15px;">
                        <span class="material-symbols-rounded" style="font-size:18px;">checklist</span> ${App.state.stockBulkMode ? 'ออกจากโหมดจัดหมวด' : 'จัดหมวดหลายรายการ'}
                    </button>
                    <button class="secondary-btn" onclick="App.printProductCatalog()" style="display:flex; align-items:center; gap:5px; padding: 10px 15px;">
                        <span class="material-symbols-rounded" style="font-size:18px;">print</span> แคตตาล็อค
                    </button>
                    <button class="primary-btn" onclick="App.openProductModal()">+ เพิ่มสินค้า</button>
                </div>
            </div>
            ${App.renderQuickFilterBarHtml()}
            
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(150px, 1fr)); gap:10px; margin-top:15px;">
                 <div onclick="App.setStockTab('all')" style="background:white; padding:15px; border-radius:8px; box-shadow:var(--shadow-sm); cursor:pointer;">
                    <div style="font-size:12px; color:#666;">จำนวนชิ้นรวม</div>
                    <div style="font-weight:bold; font-size:18px;">${totalItems}</div>
                 </div>
                 <div onclick="App.setStockTab('low')" style="background:white; padding:15px; border-radius:8px; box-shadow:var(--shadow-sm); cursor:pointer;">
                    <div style="font-size:12px; color:#666;">สินค้าใกล้หมด</div>
                    <div style="font-weight:bold; font-size:18px; color:${lowStockCount > 0 ? 'var(--danger-color)' : 'black'};">${lowStockCount}</div>
                 </div>
                 <div style="background:white; padding:15px; border-radius:8px; box-shadow:var(--shadow-sm);">
                    <div style="font-size:12px; color:#666;">ทุนรวม (Cost)</div>
                    <div style="font-weight:bold; font-size:18px; color:var(--neutral-900);">฿${Utils.formatCurrency(totalCostValue)}</div>
                 </div>
                 <div style="background:white; padding:15px; border-radius:8px; box-shadow:var(--shadow-sm); border:1px solid var(--primary-color);">
                    <div style="font-size:12px; color:var(--primary-color);">มูลค่าขาย (Sales)</div>
                    <div style="font-weight:bold; font-size:18px; color:var(--primary-color);">฿${Utils.formatCurrency(totalSalesValue)}</div>
                 </div>
            </div>

            <!-- Tabs -->
            <div class="filter-bar" style="margin-top:20px;">
                <button class="filter-btn ${App.state.stockTab === 'all' ? 'active' : ''}" onclick="App.setStockTab('all')">ทั้งหมด</button>
                <button class="filter-btn ${App.state.stockTab === 'low' ? 'active' : ''}" onclick="App.setStockTab('low')">ใกล้หมด (Low)</button>
                <button class="filter-btn ${App.state.stockTab === 'new' ? 'active' : ''}" onclick="App.setStockTab('new')">มาใหม่ (New)</button>
                <button class="filter-btn ${App.state.stockTab === 'groups' ? 'active' : ''}" onclick="App.setStockTab('groups')" ${App.state.stockBulkMode ? 'disabled title="ออกจากโหมดจัดหมวดก่อน"' : ''}>แยกหมวดหมู่</button>
            </div>

            ${App.state.stockBulkMode ? `
                <div class="bulk-category-ribbon" role="region" aria-label="เครื่องมือจัดหมวดหลายรายการ">
                    <div class="bulk-category-summary">
                        <span class="material-symbols-rounded">library_add_check</span>
                        <strong id="bulk-selected-count">เลือกแล้ว ${selectedCount} รายการ</strong>
                        <button type="button" onclick="App.selectAllFilteredStock(true)">เลือกที่แสดงทั้งหมด</button>
                        <button type="button" onclick="App.selectAllFilteredStock(false)">ล้างการเลือก</button>
                    </div>
                    <div class="bulk-category-actions">
                        <label for="bulk-category-input">ย้ายไปหมวด</label>
                        <input id="bulk-category-input" list="bulk-category-list" placeholder="เลือกหรือพิมพ์หมวดใหม่">
                        <datalist id="bulk-category-list">${existingGroups.map(group => `<option value="${Utils.escapeHTML(group)}">`).join('')}</datalist>
                        <button type="button" class="primary-btn bulk-category-apply" onclick="App.applyBulkCategory(false)" ${selectedCount ? '' : 'disabled'}>ย้ายหมวด</button>
                        <button type="button" class="secondary-btn bulk-category-apply" onclick="App.applyBulkCategory(true)" ${selectedCount ? '' : 'disabled'}>เอาออกจากหมวด</button>
                    </div>
                    <small>คำสั่งนี้เปลี่ยนเฉพาะหมวดหมู่ ไม่แตะราคา สต็อก หรือบาร์โค้ด</small>
                </div>
            ` : ''}

            <div style="margin-top:10px; overflow-x:auto;">
                ${App.state.stockTab === 'groups' ? App.renderStockGroups(products) : App.renderStockTable(products)}
            </div>
        `;
    },

    setStockTab: (tab) => {
        App.state.stockTab = tab;
        App.renderView('stock');
    },

    requestToggleStockBulkMode: () => {
        if (App.state.stockBulkMode) {
            App.state.stockBulkMode = false;
            App.state.selectedStockProductIds = [];
            App.renderView('stock');
            return;
        }
        App.checkPin(() => {
            App.state.stockBulkMode = true;
            App.state.stockTab = 'all';
            App.state.selectedStockProductIds = [];
            App.renderView('stock');
        });
    },

    toggleStockProductSelection: (productId, checked) => {
        const selected = new Set(App.state.selectedStockProductIds);
        if (checked) selected.add(productId);
        else selected.delete(productId);
        App.state.selectedStockProductIds = [...selected];
        document.getElementById(`stock-item-${productId}`)?.classList.toggle('stock-row-selected', checked);
        App.updateBulkCategoryRibbonState();
    },

    updateBulkCategoryRibbonState: () => {
        const count = App.state.selectedStockProductIds.length;
        const countEl = document.getElementById('bulk-selected-count');
        if (countEl) countEl.textContent = `เลือกแล้ว ${count} รายการ`;
        document.querySelectorAll('.bulk-category-apply').forEach(button => { button.disabled = count === 0; });
        const visibleIds = App.getFilteredStock().products.map(p => p.id);
        const selectAll = document.getElementById('bulk-select-all');
        if (selectAll) selectAll.checked = visibleIds.length > 0 && visibleIds.every(id => App.state.selectedStockProductIds.includes(id));
    },

    selectAllFilteredStock: (checked) => {
        const visibleIds = App.getFilteredStock().products.map(p => p.id);
        const selected = new Set(App.state.selectedStockProductIds);
        visibleIds.forEach(id => checked ? selected.add(id) : selected.delete(id));
        App.state.selectedStockProductIds = [...selected];
        App.renderView('stock');
    },

    applyBulkCategory: async (removeCategory = false) => {
        const selectedIds = new Set(App.state.selectedStockProductIds);
        if (!selectedIds.size) return App.alert('กรุณาเลือกสินค้าอย่างน้อย 1 รายการ');
        const newGroup = removeCategory ? '' : (document.getElementById('bulk-category-input')?.value || '').trim();
        if (!removeCategory && !newGroup) return App.alert('กรุณาเลือกหรือพิมพ์ชื่อหมวดหมู่');

        const targetLabel = removeCategory ? 'ไม่มีหมวดหมู่' : newGroup;
        if (!await App.confirm(`ยืนยันเปลี่ยนหมวดสินค้า ${selectedIds.size} รายการเป็น “${targetLabel}” หรือไม่?\n\nราคา สต็อก และบาร์โค้ดจะไม่เปลี่ยน`)) return;

        const result = Utils.assignCategoryToProducts(App.state.products, selectedIds, newGroup);
        App.state.products = result.products;
        const changed = result.changed;
        const syncResult = await DB.saveProductsWithCloud(App.state.products, [...selectedIds]);
        App.state.selectedStockProductIds = [];
        App.renderView('stock');
        const syncNote = syncResult.available ? `\nซิงค์ Firebase แล้ว ${syncResult.synced} รายการ` : '\nบันทึกในเครื่องแล้ว และจะซิงค์เมื่อเชื่อมต่อ Firebase';
        await App.alert(`จัดหมวดหมู่เรียบร้อย ${changed} รายการ${syncNote}`);
    },

    toggleStockSort: (column) => {
        if (App.state.stockSort.column === column) {
            // Toggle direction
            App.state.stockSort.direction = App.state.stockSort.direction === 'asc' ? 'desc' : 'asc';
        } else {
            // New column, default to desc for numbers, asc for text
            App.state.stockSort.column = column;
            App.state.stockSort.direction = (column === 'price' || column === 'stock') ? 'desc' : 'asc';
        }
        App.renderView('stock');
    },

    getFilteredStock: () => {
        let products = [...App.state.products];

        if (App.state.searchQuery) {
            const query = App.state.searchQuery.toLowerCase();
            products = products.filter(p =>
                (p.name && p.name.toLowerCase().includes(query)) ||
                (p.barcode && p.barcode.includes(query)) ||
                (p.packBarcode && p.packBarcode.includes(query)) ||
                (p.group && p.group.toLowerCase().includes(query))
            );
        }

        // 1. Filter
        switch (App.state.stockTab) {
            case 'low':
                products = products.filter(p => p.stock <= 5);
                break;
            case 'new':
                products = products.slice().reverse().slice(0, 20); // Last 20 added
                break;
            // 'all' and 'groups' use full list
        }

        // 2. Sort
        const { column, direction } = App.state.stockSort;
        products.sort((a, b) => {
            let valA = a[column];
            let valB = b[column];

            // Handle virtual columns or specific logic
            if (column === 'name') {
                valA = (valA || '').toLowerCase();
                valB = (valB || '').toLowerCase();
            }

            if (valA < valB) return direction === 'asc' ? -1 : 1;
            if (valA > valB) return direction === 'asc' ? 1 : -1;
            return 0;
        });

        return { products };
    },

    renderStockTable: (products) => {
        if (products.length === 0) return '<div style="text-align:center; padding:40px; color:#999;">ไม่พบสินค้า</div>';

        const suppliers = DB.getSuppliers();
        const sortIcon = (col) => {
            const iconClass = "material-symbols-rounded";
            if (App.state.stockSort.column !== col) return `<span class="${iconClass}" style="color:#ddd; font-size:16px; vertical-align:middle;">unfold_more</span>`;
            return App.state.stockSort.direction === 'asc'
                ? `<span class="${iconClass}" style="font-size:16px; vertical-align:middle;">arrow_upward</span>`
                : `<span class="${iconClass}" style="font-size:16px; vertical-align:middle;">arrow_downward</span>`;
        };

        const thStyle = "padding:12px; cursor:pointer; user-select:none; white-space:nowrap; vertical-align:middle;";
        const visibleIds = products.map(p => p.id);
        const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => App.state.selectedStockProductIds.includes(id));
        const mobileRowsHtml = products.map(p => `
            <article id="stock-mobile-${p.id}" class="stock-mobile-item ${App.state.selectedStockProductIds.includes(p.id) ? 'stock-row-selected' : ''}">
                ${App.state.stockBulkMode ? `<label class="stock-mobile-select"><input type="checkbox" aria-label="เลือก ${Utils.escapeHTML(p.name)}" ${App.state.selectedStockProductIds.includes(p.id) ? 'checked' : ''} onchange="App.toggleStockProductSelection('${p.id}', this.checked)"></label>` : ''}
                <div class="stock-mobile-thumb">
                    ${p.image ? `<img src="${p.image}" alt="">` : '<span class="material-symbols-rounded">inventory_2</span>'}
                </div>
                <div class="stock-mobile-main">
                    <strong>${Utils.escapeHTML(p.name)}</strong>
                    <small>${p.hasBarcode === false ? `ไม่มีบาร์โค้ด · ${Utils.escapeHTML(p.internalCode || p.barcode)}` : Utils.escapeHTML(p.barcode)}</small>
                    <div class="stock-mobile-facts">
                        <span><b>ขาย</b> ฿${Utils.formatCurrency(p.price)}</span>
                        <span><b>ทุน</b> ฿${Utils.formatCurrency(p.cost || 0)}</span>
                        <span class="${p.stock <= 5 ? 'stock-mobile-low' : ''}"><b>เหลือ</b> ${p.stock} ${Utils.escapeHTML(p.unitLabel || 'ชิ้น')}</span>
                    </div>
                    ${p.unitsPerBox > 1 ? `<small>${App.formatStockBreakdown(p)}</small>` : ''}
                </div>
                <div class="stock-mobile-actions" aria-label="จัดการ ${Utils.escapeHTML(p.name)}">
                    <button class="icon-btn" onclick="App.openProductModal('${p.id}')" title="แก้ไขสินค้า"><span class="material-symbols-rounded">edit</span></button>
                    <button class="icon-btn" onclick="App.editProductCategory('${p.id}')" title="จัดหมวดหมู่"><span class="material-symbols-rounded">folder_open</span></button>
                    <button class="icon-btn dangerous" onclick="App.deleteProduct('${p.id}')" title="ลบสินค้า"><span class="material-symbols-rounded">delete</span></button>
                </div>
            </article>
        `).join('');

        return `
            <div style="padding-bottom:20px;">
                <!-- Scroll Hint -->
                <div class="stock-scroll-hint" style="font-size:10px; color:#999; text-align:right; margin-bottom:5px; display:flex; align-items:center; justify-content:flex-end; gap:4px;">
                    <span class="material-symbols-rounded" style="font-size:12px;">arrow_forward</span> เลื่อนขวาเพื่อจัดการ
                </div>

                <div class="stock-mobile-list">${mobileRowsHtml}</div>
                <div class="stock-desktop-table" style="overflow-x:auto; -webkit-overflow-scrolling:touch; border-radius:8px; border:1px solid #eee; background:white;">
                    <table style="width:100%; min-width:600px; border-collapse:collapse; overflow:hidden;">
                    <thead>
                        <tr style="background:var(--neutral-100); text-align:left; font-size:13px; color:#666;">
                            ${App.state.stockBulkMode ? `<th style="padding:12px; width:46px;"><input id="bulk-select-all" type="checkbox" aria-label="เลือกสินค้าที่แสดงทั้งหมด" ${allVisibleSelected ? 'checked' : ''} onchange="App.selectAllFilteredStock(this.checked)"></th>` : ''}
                            <th style="${thStyle}" onclick="App.toggleStockSort('name')">
                                <div style="display:flex; align-items:center; gap:4px;">สินค้า ${sortIcon('name')}</div>
                            </th>
                            <th style="${thStyle}" onclick="App.toggleStockSort('price')">
                                <div style="display:flex; align-items:center; gap:4px;">ราคา/ทุน ${sortIcon('price')}</div>
                            </th>
                            <th style="${thStyle}" onclick="App.toggleStockSort('stock')">
                                <div style="display:flex; align-items:center; gap:4px;">สต็อก ${sortIcon('stock')}</div>
                            </th>
                            <th style="${thStyle}" onclick="App.toggleStockSort('entryDate')">
                                <div style="display:flex; align-items:center; gap:4px;">วันที่ลง ${sortIcon('entryDate')}</div>
                            </th>
                            <th style="padding:12px;">ร้านส่ง (Supplier)</th>
                            <th style="padding:12px; text-align:right;">จัดการ</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${products.map(p => {
            let statusHtml = '';
            if (p.expiryDate) {
                const daysLeft = Math.ceil((new Date(p.expiryDate) - new Date()) / (1000 * 60 * 60 * 24));
                if (daysLeft <= 0) statusHtml = '<div style="font-size:10px; color:white; background:red; padding:2px 4px; border-radius:4px; display:inline-block; margin-top:2px;">Exp</div>';
                else if (daysLeft <= 7) statusHtml = `<div style="font-size:10px; color:white; background:orange; padding:2px 4px; border-radius:4px; display:inline-block; margin-top:2px;">${daysLeft}d</div>`;
            }

            // Determine Supplier
            const prices = DB.getPricesByProduct(p.id);
            let supplierName = '<span style="color:#ccc;">-</span>';
            if (prices.length > 0) {
                // Find primary (lowest cost? or just first?)
                const sId = prices[0].supplierId;
                const s = suppliers.find(x => x.id === sId);
                if (s) supplierName = `<a href="#" onclick="App.renderSupplierDetail('${s.id}')" style="color:var(--primary-color); text-decoration:none;">${s.name}</a>`;
            }

            const costAlert = !p.cost ? 'color:orange;' : '';

            return `
                                <tr id="stock-item-${p.id}" class="${App.state.selectedStockProductIds.includes(p.id) ? 'stock-row-selected' : ''}" style="border-bottom:1px solid #eee;">
                                    ${App.state.stockBulkMode ? `<td style="padding:12px;"><input type="checkbox" aria-label="เลือก ${Utils.escapeHTML(p.name)}" ${App.state.selectedStockProductIds.includes(p.id) ? 'checked' : ''} onchange="App.toggleStockProductSelection('${p.id}', this.checked)"></td>` : ''}
                                    <td style="padding:10px;">
                                        <div style="display:flex; align-items:center; gap:10px;">
                                            <div style="width:36px; height:36px; background:#eee; border-radius:4px; overflow:hidden; flex-shrink:0;">
                                                ${p.image ? `<img src="${p.image}" style="width:100%; height:100%; object-fit:cover;">` : ''}
                                            </div>
                                            <div style="min-width:0;">
                                                <div style="font-weight:bold; font-size:14px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${p.name}</div>
                                                <div style="font-size:11px; color:#888;">${p.hasBarcode === false ? `ไม่มีบาร์โค้ด · รหัสภายใน ${Utils.escapeHTML(p.internalCode || p.barcode)}` : Utils.escapeHTML(p.barcode)}</div>
                                                ${statusHtml}
                                            </div>
                                        </div>
                                    </td>
                                    <td style="padding:10px; font-size:13px;">
                                        <div>ขาย: ${Utils.formatCurrency(p.price)}</div>
                                        <div style="font-size:11px; color:#888; ${costAlert}">ทุน: ${p.cost ? Utils.formatCurrency(p.cost) : '0.00 (?)'}</div>
                                    </td>
                                    <td style="padding:10px;">
                                        <span style="color:${p.stock <= 5 ? 'var(--danger-color)' : 'black'}; font-weight:${p.stock <= 5 ? 'bold' : 'normal'};">
                                            ${p.stock} ${p.unitLabel || 'ชิ้น'}
                                        </span>
                                        ${p.unitsPerBox > 1 ? `
                                        <div style="font-size:11px; color:#888; margin-top:3px;">
                                            ${App.formatStockBreakdown(p)}
                                        </div>
                                        ` : p.wholesaleQty > 0 ? `
                                        <div style="font-size:11px; color:#888; margin-top:3px;">
                                            (${Math.floor(p.stock / p.wholesaleQty)} ลัง ${p.stock % p.wholesaleQty} ชิ้น)
                                        </div>
                                        ` : ''}
                                    </td>
                                    <td style="padding:10px; font-size:13px; color:#666;">
                                        ${p.entryDate ? new Date(p.entryDate).toLocaleDateString('th-TH') : '-'}
                                    </td>
                                    <td style="padding:10px; font-size:13px;">
                                        ${supplierName}
                                    </td>
                                    <td style="padding:10px; text-align:right;">
                                        <button class="icon-btn" onclick="App.openProductModal('${p.id}')" style="padding:5px;">
                                            <span class="material-symbols-rounded" style="font-size:18px;">edit</span>
                                        </button>
                                        <button class="icon-btn" onclick="App.editProductCategory('${p.id}')" style="padding:5px; color:var(--primary-color);">
                                            <span class="material-symbols-rounded" style="font-size:18px;">folder_open</span>
                                        </button>
                                        <button class="icon-btn dangerous" onclick="App.deleteProduct('${p.id}')" style="padding:5px;">
                                            <span class="material-symbols-rounded" style="font-size:18px;">delete</span>
                                        </button>
                                    </td>
                                </tr>
                            `}).join('')}
                    </tbody>
                </table>
            </div>
        `;
    },

    renderStockGroups: (products) => {
        const groups = {};
        const noGroup = [];

        products.forEach(p => {
            if (p.group) {
                if (!groups[p.group]) groups[p.group] = [];
                groups[p.group].push(p);
            } else {
                noGroup.push(p);
            }
        });

        const sortedGroups = Object.keys(groups).sort();

        return `
            <div style="display:flex; flex-direction:column; gap:20px;">
                ${sortedGroups.map(groupName => `
                    <div style="background:white; border-radius:8px; overflow:hidden; box-shadow:var(--shadow-sm);">
                        <div style="background:var(--primary-light); color:var(--primary-color); padding:10px 15px; font-weight:bold; display:flex; justify-content:space-between;">
                            <span>${groupName}</span>
                            <span>${groups[groupName].length} รายการ</span>
                        </div>
                        ${App.renderStockTable(groups[groupName]).replace('<table style="width:100%; border-collapse:collapse; background:white; border-radius:8px; overflow:hidden;">', '<table style="width:100%; border-collapse:collapse;">')} 
                        <!-- Hack to remove double container style -->
                    </div>
                `).join('')}

            </div>
        `;
    },

    // --- Product Catalog Print ---
    printProductCatalog: () => {
        const products = App.state.products.slice().sort((a, b) => {
            const groupA = a.group || 'ไม่มีหมวดหมู่';
            const groupB = b.group || 'ไม่มีหมวดหมู่';
            if (groupA < groupB) return -1;
            if (groupA > groupB) return 1;
            return a.name.localeCompare(b.name);
        });

        if (products.length === 0) {
            App.alert('ไม่มีสินค้าในสต็อก');
            return;
        }

        let printHtml = `
            <!DOCTYPE html>
            <html lang="th">
            <head>
                <meta charset="UTF-8">
                <title>แคตตาล็อคสินค้า</title>
                <!-- Include fonts from the main app for consistency -->
                <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;500;600;700&display=swap" rel="stylesheet">
                <style>
                    body { font-family: 'Sarabun', sans-serif; padding: 20px; font-size: 14px; margin: 0; color: #333; }
                    @page { size: A4 portrait; margin: 1cm; }
                    h1 { text-align: center; font-size: 24px; margin-bottom: 20px; }
                    .catalog-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; }
                    .product-card { border: 1px solid #ccc; padding: 10px; text-align: center; border-radius: 8px; page-break-inside: avoid; background: white; }
                    .product-image { width: 100%; height: 120px; object-fit: contain; margin-bottom: 10px; background: #fafafa; border-radius: 4px; display: block; }
                    .product-no-image { width: 100%; height: 120px; background: #f0f0f0; margin-bottom: 10px; border-radius: 4px; display: flex; align-items: center; justify-content: center; color: #999; border: 1px dashed #ccc; box-sizing: border-box; }
                    .product-name { font-weight: bold; font-size: 14px; margin-bottom: 5px; height: 40px; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; line-height: 1.4; }
                    .product-price { color: #d32f2f; font-weight: bold; font-size: 16px; margin-bottom: 5px; }
                    .product-barcode { font-size: 11px; color: #666; font-family: monospace; }
                    .category-header { font-size: 18px; font-weight: bold; margin-top: 30px; margin-bottom: 15px; border-bottom: 2px solid #555; padding-bottom: 5px; grid-column: 1 / -1; page-break-after: avoid; }
                    @media print {
                        body { padding: 0; }
                        .catalog-grid { grid-template-columns: repeat(4, 1fr); gap: 10px; }
                        .product-card { width: 100%; box-sizing: border-box; border: 1px solid #999; }
                    }
                </style>
            </head>
            <body>
                <h1>แคตตาล็อคสินค้า</h1>
                <div class="catalog-grid">
        `;

        let currentGroup = null;
        products.forEach(p => {
            const group = p.group || 'ไม่มีหมวดหมู่';
            if (group !== currentGroup) {
                printHtml += `<div class="category-header">${group}</div>`;
                currentGroup = group;
            }
            const imgHtml = p.image ? `<img src="${p.image}" class="product-image">` : `<div class="product-no-image">ไม่มีรูป</div>`;
            printHtml += `
                <div class="product-card">
                    ${imgHtml}
                    <div class="product-name">${p.name}</div>
                    <div class="product-price">฿${Number(p.price).toFixed(2)}</div>
                    <div class="product-barcode">${p.barcode || '-'}</div>
                </div>
            `;
        });

        printHtml += `
                </div>
                <script>
                    window.onload = function() {
                        setTimeout(() => {
                            window.print();
                        }, 500);
                    }
                </script>
            </body>
            </html>
        `;

        const printWindow = window.open('', '_blank');
        if (printWindow) {
            printWindow.document.write(printHtml);
            printWindow.document.close();
        } else {
            // Fallback for pop-up blocker
            alert("กรุณาอนุญาต Pop-up บนเว็บบราว์เซอร์เพื่อแสดงแคตตาล็อค");
        }
    },

    // --- Category Edit Logic ---
    editProductCategory: (productId) => {
        App.checkPin(() => {
            const product = App.state.products.find(p => p.id === productId);
            if (!product) return;

            const existingGroups = [...new Set(App.state.products.map(p => p.group).filter(g => g))].sort();
            const modal = document.getElementById('price-check-modal'); // Reuse generic modal
            const overlay = document.getElementById('modal-overlay');

            modal.innerHTML = `
                <h3>แก้ไขหมวดหมู่</h3>
                <p style="color:#666; margin-bottom:15px;">สินค้า: <strong>${Utils.escapeHTML(product.name)}</strong></p>
                <div style="margin-bottom:15px;">
                    <label style="font-size:12px;">หมวดหมู่ปัจจุบัน</label>
                    <div style="font-size:18px; font-weight:bold;">${product.group || 'ไม่มีหมวดหมู่'}</div>
                </div>
                
                <label style="font-size:12px;">เลือกหมวดหมู่ใหม่ หรือ พิมพ์ใหม่</label>
                <input type="text" id="new-cat-input" list="cat-list" value="${product.group || ''}" 
                    style="width:100%; padding:10px; font-size:18px; margin-top:5px; border:1px solid #ddd; border-radius:4px;"
                    placeholder="พิมพ์ชื่อหมวดหมู่..." onfocus="this.select()"
                    onkeydown="if(event.key === 'Enter') App.saveCategory('${productId}')">
                
                <datalist id="cat-list">
                    ${existingGroups.map(g => `<option value="${g}">`).join('')}
                </datalist>

                <div style="display:flex; flex-wrap:wrap; gap:5px; margin-top:10px; max-height:150px; overflow-y:auto;">
                    ${existingGroups.map(g => `
                        <button class="filter-btn" onclick="document.getElementById('new-cat-input').value = '${g}'">${g}</button>
                    `).join('')}
                </div>

                <div style="display:flex; gap:10px; margin-top:20px;">
                    <button class="secondary-btn" style="flex:1;" onclick="App.closeModals()">ยกเลิก</button>
                    <button class="primary-btn" style="flex:1;" onclick="App.saveCategory('${productId}')">บันทึก</button>
                </div>
            `;

            overlay.classList.remove('hidden');
            modal.classList.remove('hidden');
            setTimeout(() => document.getElementById('new-cat-input').focus(), 100);
        });
    },

    saveCategory: async (productId) => {
        const newGroup = document.getElementById('new-cat-input').value.trim();
        const product = App.state.products.find(p => p.id === productId);

        if (product) {
            product.group = newGroup;
            product.updatedAt = Date.now();
            await DB.saveProductsWithCloud(App.state.products, [product.id]);
            App.closeModals();
            App.renderView('stock'); // Refresh View

            setTimeout(async () => {
                await App.alert(`เปลี่ยนหมวดหมู่เป็น "${newGroup || 'ไม่มี'}" เรียบร้อย`);
            }, 100);
        }
    },

    // --- Supplier View ---
    renderSupplierView: (container) => {
        const suppliers = DB.getSuppliers();
        container.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <h2>ร้านส่ง / Supplier</h2>
                <button class="primary-btn" onclick="App.checkPin(() => App.openSupplierModal())">+ เพิ่มร้านค้า</button>
            </div>

            <!-- Consolidated Schedule Table -->
            <div style="margin-top:20px; background:white; padding:15px; border-radius:8px; box-shadow:var(--shadow-sm);">
                <h3 style="margin-bottom:10px; display:flex; align-items:center; gap:5px;">
                    <span class="material-symbols-rounded" style="color:var(--primary-color);">calendar_month</span> 
                    ตารางนัดลงของ (ประจำสัปดาห์/เดือน)
                </h3>
                <div style="overflow-x:auto;">
                    <table style="width:100%; min-width:500px; border-collapse:collapse; font-size:14px;">
                        <thead>
                            <tr style="background:var(--neutral-100); text-align:left; color:#666;">
                                <th style="padding:10px; border-bottom:2px solid #ddd;">วันนัดหมาย</th>
                                <th style="padding:10px; border-bottom:2px solid #ddd;">เวลา</th>
                                <th style="padding:10px; border-bottom:2px solid #ddd;">ร้านส่ง</th>
                                <th style="padding:10px; border-bottom:2px solid #ddd;">หมายเหตุ</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${suppliers.filter(s => s.scheduleDay).length > 0 ?
                suppliers.filter(s => s.scheduleDay).sort((a, b) => (a.scheduleDay || '').localeCompare(b.scheduleDay || '')).map(s => `
                                    <tr style="border-bottom:1px solid #eee; cursor:pointer;" onclick="App.renderSupplierDetail('${s.id}')">
                                        <td style="padding:10px; font-weight:bold; color:var(--primary-color);">${s.scheduleDay}</td>
                                        <td style="padding:10px;">${s.scheduleTime || '-'}</td>
                                        <td style="padding:10px;">${s.name}</td>
                                        <td style="padding:10px; color:#666;">${s.scheduleNote || '-'}</td>
                                    </tr>
                                `).join('')
                : '<tr><td colspan="4" style="padding:20px; text-align:center; color:#999;">ยังไม่มีข้อมูลตารางนัดหมาย</td></tr>'}
                        </tbody>
                    </table>
                </div>
            </div>

            <h3 style="margin-top:25px; margin-bottom:10px;">รายชื่อร้านส่งทั้งหมด</h3>
            <div class="supplier-list" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(300px, 1fr)); gap:20px;">
                ${suppliers.map(s => `
                    <div class="supplier-card" style="background:white; padding:20px; border-radius:var(--radius-md); box-shadow:var(--shadow-sm); cursor:pointer; position:relative;" onclick="App.renderSupplierDetail('${s.id}')">
                        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                            <div style="font-weight:bold; font-size:18px;">${s.name}</div>
                            <div style="display:flex; gap:5px;" onclick="event.stopPropagation()">
                                <button class="icon-btn" onclick="App.checkPin(() => App.openSupplierModal('${s.id}'))" style="padding:4px;" title="แก้ไขร้านส่ง"><span class="material-symbols-rounded" style="font-size:18px;">edit</span></button>
                                <button class="icon-btn dangerous" onclick="App.checkPin(() => App.deleteSupplier('${s.id}'))" style="padding:4px;" title="ลบร้านส่ง"><span class="material-symbols-rounded" style="font-size:18px;">delete</span></button>
                            </div>
                        </div>
                        <div style="color:#666; margin-top:5px;">${s.contact}</div>
                        <div style="color:var(--primary-color); margin-top:5px;">📞 ${s.phone}</div>
                        ${s.scheduleDay ? `<div style="margin-top:10px; font-size:12px; display:inline-block; padding:3px 8px; background:#e0ecff; color:var(--primary-color); border-radius:12px;">🗓️ ${s.scheduleDay} ${s.scheduleTime || ''}</div>` : ''}
                    </div>
                `).join('')}
            </div>
        `;
    },

    renderSupplierDetail: (supplierId) => {
        const suppliers = DB.getSuppliers();
        const supplier = suppliers.find(s => s.id === supplierId);
        if (!supplier) return App.renderView('suppliers');

        const prices = DB.getPricesBySupplier(supplierId);

        App.elements.viewContainer.innerHTML = `
            <button class="secondary-btn" onclick="App.renderView('suppliers')" style="margin-bottom:20px;">
                <span class="material-symbols-rounded" style="vertical-align:bottom;">arrow_back</span> กลับ
            </button>
            
            <div style="background:white; padding:20px; border-radius:8px; box-shadow:var(--shadow-sm); margin-bottom:20px;">
                <div style="display:flex; justify-content:space-between;">
                    <h2>${supplier.name}</h2>
                    <div>
                         <button class="icon-btn" onclick="App.checkPin(() => App.openSupplierModal('${supplier.id}'))"><span class="material-symbols-rounded">edit</span></button>
                         <button class="icon-btn dangerous" onclick="App.checkPin(() => App.deleteSupplier('${supplier.id}'))"><span class="material-symbols-rounded">delete</span></button>
                    </div>
                </div>
                <p>ผู้ติดต่อ: ${supplier.contact} | โทร: ${supplier.phone}</p>
                ${supplier.scheduleDay ? `
                    <div style="margin-top:15px; padding:10px; background:#f8fafe; border-left:4px solid var(--primary-color); border-radius:4px;">
                        <div style="font-weight:bold; color:var(--primary-color); margin-bottom:5px;">📅 ตารางลงของ</div>
                        <div><strong>วัน:</strong> ${supplier.scheduleDay} ${supplier.scheduleTime ? `| <strong>เวลา:</strong> ${supplier.scheduleTime}` : ''}</div>
                        ${supplier.scheduleNote ? `<div style="margin-top:5px; color:#555;"><strong>หมายเหตุ:</strong> ${supplier.scheduleNote}</div>` : ''}
                    </div>
                ` : ''}
            </div>

            <div style="display:flex; justify-content:space-between; align-items:center;">
                <h3>รายการสินค้าที่ส่ง</h3>
                <button class="primary-btn" onclick="App.openLinkProductModal('${supplier.id}')">+ เพิ่มสินค้า</button>
            </div>

            <table style="width:100%; background:white; margin-top:15px; border-radius:8px; border-collapse:collapse;">
                <thead>
                    <tr style="background:#f9f9f9; text-align:left;">
                        <th style="padding:10px;">สินค้า</th>
                        <th style="padding:10px;">ราคาขายหน้าร้าน</th>
                        <th style="padding:10px;">ต้นทุน (Cost)</th>
                        <th style="padding:10px;">กำไร/ชิ้น</th>
                        <th style="padding:10px;">ลบ</th>
                    </tr>
                </thead>
                <tbody>
                    ${prices.map(price => {
            const product = App.state.products.find(p => p.id === price.productId);
            if (!product) return '';
            const profit = product.price - price.cost;
            const profitPercent = (profit / product.price) * 100;

            let costDisplay = Utils.formatCurrency(price.cost);
            if (price.buyUnit && price.buyUnit !== 'piece') {
                let unitName = price.buyUnit === 'pack' ? 'แพ็ค' : 'ลัง';
                costDisplay = `
                                <div>${Utils.formatCurrency(price.buyPrice)} / ${unitName}</div>
                                <div style="font-size:12px; color:#666;">(ตกชิ้นละ ${Utils.formatCurrency(price.cost)})</div>
                             `;
            }

            return `
                        <tr style="border-bottom:1px solid #eee;">
                            <td style="padding:10px;">${Utils.escapeHTML(product.name)}</td>
                            <td style="padding:10px;">${Utils.formatCurrency(product.price)}</td>
                            <td style="padding:10px; font-weight:bold;">${costDisplay}</td>
                            <td style="padding:10px; color:${profit > 0 ? 'green' : 'red'};">
                                ${Utils.formatCurrency(profit)} (${profitPercent.toFixed(1)}%)
                            </td>
                            <td style="padding:10px;">
                                <button class="icon-btn dangerous" onclick="DB.deleteSupplierPrice('${supplier.id}', '${product.id}'); App.renderSupplierDetail('${supplier.id}');">
                                    <span class="material-symbols-rounded">close</span>
                                </button>
                            </td>
                        </tr>
                        `;
        }).join('')}
                </tbody>
            </table>
        `;
    },

    // --- Modals (Product, Supplier, Security) ---
    openProductModal: (editId = null) => {
        App.closeModals(); // Prevent Overlap
        const product = editId ? App.state.products.find(p => p.id === editId) : null;
        const modal = document.getElementById('product-modal');
        const overlay = document.getElementById('modal-overlay');

        // Initial Groups for Autocomplete
        const existingGroups = [...new Set(App.state.products.map(p => p.group).filter(g => g))];

        // Supplier Prices for Comparison
        const supplierPrices = product ? DB.getPricesByProduct(product.id) : [];
        supplierPrices.sort((a, b) => a.cost - b.cost); // Best price first
        const suppliers = DB.getSuppliers();

        modal.innerHTML = `
            <h2>${product ? 'แก้ไขสินค้า' : 'เพิ่มสินค้าใหม่'}</h2>
            <form id="product-form" style="display:flex; flex-direction:column; gap:10px; margin-top:15px;">
                <input type="hidden" id="p-id" value="${product ? product.id : ''}">
                
                <div style="display:flex; flex-wrap:wrap; gap:15px;">
                    <div style="flex: 1 1 250px;">
                        <label>บาร์โค้ด (ไม่บังคับ)</label>
                        <div style="display:flex; gap:5px;">
                            <input type="text" id="p-barcode" value="${product && product.hasBarcode !== false ? product.barcode : ''}" placeholder="สแกน พิมพ์ หรือปล่อยว่าง" style="flex:1;">
                            <button type="button" class="secondary-btn" onclick="document.getElementById('p-barcode').focus()">Scan</button>
                        </div>
                        <small style="color:#667085;">ถ้าปล่อยว่าง ระบบจะสร้างรหัสภายในและแสดงสินค้านี้ไว้หน้าขาย</small>
                    </div>
                     <div style="flex: 1 1 200px;">
                        <label>หมวดหมู่ (ปล่อยว่างถ้าไม่มี)</label>
                        <input type="text" id="p-group" list="group-list" value="${product && product.group ? product.group : ''}"
                            placeholder="เช่น น้ำอัดลม, ไข่ไก่" style="width:100%;">
                        <datalist id="group-list">
                            ${existingGroups.map(g => `<option value="${g}">`).join('')}
                        </datalist>
                        <div id="p-group-suggestions" class="category-suggestions"></div>
                    </div>
                </div>

                <label>ชื่อสินค้า (ระบุรสชาติ/ขนาด)</label>
                <input type="text" id="p-name" value="${product ? product.name : ''}" required placeholder="เช่น โค้ก (กระป๋อง), เบอร์ 0 (10 ฟอง)" style="width:100%;">
                
                <div style="display:flex; flex-wrap:wrap; gap:15px;">
                    <div style="flex: 1 1 150px;">
                        <label>ราคาขาย (บาท)</label>
                        <input type="number" step="0.5" id="p-price" value="${product ? product.price : ''}" required style="width:100%;">
                    </div>
                    <div style="flex: 1 1 150px;">
                        <label>ต้นทุน (Cost)</label>
                        <input type="number" step="0.5" id="p-cost" value="${product ? (product.cost || '') : ''}" placeholder="ใส่เพื่อคิดกำไร" style="width:100%;">
                    </div>
                    <div style="flex: 1 1 150px;">
                        <label>ราคาเป๋าตัง (60:40)</label>
                        <input type="number" step="0.5" id="p-tct-price" value="${product ? (product.thaiChuaiThaiPrice || '') : ''}" placeholder="ระบุราคาที่นี่" style="width:100%;">
                    </div>
                </div>

                 <div style="display:flex; flex-wrap:wrap; gap:15px; align-items:flex-start;">
                    <!-- Stock Column -->
                    <div style="flex: 1 1 250px;">
                         <!-- Stock / Bundle Switch -->
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:5px;">
                            <label style="margin:0;">จำนวนสต็อก</label>
                            <label style="font-size:12px; display:flex; align-items:center; gap:3px; cursor:pointer;">
                                <input type="checkbox" id="p-is-bundle" ${product && product.parentId ? 'checked' : ''} onchange="App.toggleBundleMode()">
                                ตัดสต็อกสินค้าอื่น
                            </label>
                        </div>

                        <div style="display:flex; flex-wrap:wrap; gap:10px; margin-top:15px; background:#f5faff; padding:10px; border-radius:8px; border:1px solid #cce5ff;">
                            <div style="width:100%; font-size:12px; font-weight:bold; color:var(--primary-color);">ตั้งค่าราคาขายส่ง (ต่อแพ็ค/ลัง)</div>
                            <div style="flex: 1 1 120px;">
                                <label style="font-size:12px;">ครบกี่ชิ้น=1แพ็ค</label>
                                <input type="number" id="p-wholesale-qty" value="${product ? (product.wholesaleQty || '') : ''}" placeholder="เช่น 12" style="width:100%;">
                            </div>
                            <div style="flex: 1 1 120px;">
                                <label style="font-size:12px;">ราคา/แพ็ค (บาท)</label>
                                <input type="number" step="0.5" id="p-wholesale-price" value="${product ? (product.wholesalePrice || '') : ''}" placeholder="ระบุหรือไม่ระบุก็ได้" style="width:100%;">
                            </div>
                            <div style="flex: 1 1 100%;">
                                <label style="font-size:12px;">บาร์โค้ดลัง/แพ็ค (ทางเลือก)</label>
                                <input type="text" id="p-pack-barcode" value="${product ? (product.packBarcode || '') : ''}" placeholder="สแกนบาร์โค้ดลังที่นี่" style="width:100%;">
                            </div>
                        </div>

                        <!-- Normal Stock Input -->
                        <div id="stock-input-group">
                            <div style="display:flex; gap:5px;">
                                <input type="number" id="p-stock" value="${product ? product.stock : ''}" style="flex:1;">
                                <button type="button" class="secondary-btn" onclick="Utils.toggle('stock-calc-panel')">
                                    <span class="material-symbols-rounded">calculate</span>
                                </button>
                            </div>
                             <!-- Inline Stock Calculator -->
                             <div id="stock-calc-panel" class="hidden" style="background:var(--neutral-100); padding:10px; margin-top:5px; border-radius:8px; border:1px solid var(--neutral-300);">
                                <div style="font-size:12px; color:#666; margin-bottom:5px;">เครื่องมือช่วยคำนวณ</div>
                                <div style="display:flex; gap:5px; align-items:center;">
                                    <input type="number" id="sc-packs" placeholder="ลัง" style="flex:1; padding:5px; text-align:center;" oninput="App.calcStockPreview()">
                                    <span>x</span>
                                    <input type="number" id="sc-per-pack" placeholder="ชิ้น" style="flex:1; padding:5px; text-align:center;" oninput="App.calcStockPreview()">
                                    <span>=</span>
                                    <div id="sc-total" style="font-weight:bold; color:var(--primary-color); width:50px; text-align:right;">0</div>
                                </div>
                                <div style="display:flex; gap:5px; margin-top:5px;">
                                    <button type="button" class="primary-btn small" style="flex:1;" onclick="App.applyStockCalc(true)">+เพิ่ม</button>
                                    <button type="button" class="secondary-btn small" style="flex:1;" onclick="App.applyStockCalc(false)">แทนที่</button>
                                </div>
                            </div>
                        </div>

                        <!-- Bundle Config Group -->
                        <div id="bundle-input-group" class="hidden" style="background:#fff3cd; padding:10px; border-radius:8px; border:1px solid #ffeeba;">
                            <label style="font-size:12px; display:block; margin-bottom:3px;">สินค้าหลัก (Parent)</label>
                            <input type="text" id="p-parent-search" placeholder="ค้นหา/ยิงบาร์โค้ด" style="width:100%; padding:5px; margin-bottom:5px;" oninput="App.searchParent(this.value)">
                            <select id="p-parent-id" style="width:100%; padding:5px; margin-bottom:5px;">
                                ${product && product.parentId ? (() => {
                const parent = App.state.products.find(p => p.id === product.parentId);
                return parent ? `<option value="${parent.id}">${parent.name}</option>` : '<option value="">เลือกสินค้าหลัก...</option>';
            })() : '<option value="">เลือกสินค้าหลัก...</option>'}
                            </select>
                            <label style="font-size:12px; display:block; margin-bottom:3px;">จำนวนที่ตัด (Pack Size)</label>
                            <div style="display:flex; align-items:center; gap:5px;">
                                <input type="number" id="p-pack-size" value="${product ? product.packSize || 1 : 12}" style="width:100%; padding:5px; text-align:center;">
                                <span style="font-size:12px; color:#666;">ชิ้น</span>
                            </div>
                        </div>

                        <!-- Location Field (New) -->
                        <div style="margin-top:10px;">
                            <label>จุดวางสินค้า (Location)</label>
                            <input type="text" id="p-location" value="${product ? (product.location || '') : ''}" placeholder="เช่น ชั้น 2, ล็อค A, หลังตู้เย็น" style="width:100%; padding:8px; border:1px solid #ddd; border-radius:4px; font-size:16px;">
                        </div>
                        <div style="margin-top:10px;">
                            <label>วันที่ลงสต็อค (Entry Date)</label>
                            <input type="date" id="p-entry-date" value="${product ? (product.entryDate || '') : new Date().toISOString().split('T')[0]}" style="width:100%; padding:8px; border:1px solid #ddd; border-radius:4px; font-size:16px;">
                        </div>
                    </div>
                
                    <!-- Tags & Image Column -->
                    <div style="flex: 1 1 200px; display:flex; flex-direction:column; gap:10px;">
                        <div>
                            <label>วันหมดอายุ (Expiry)</label>
                            <input type="date" id="p-expiry" value="${product ? (product.expiryDate || '') : ''}" style="width:100%; margin-bottom:10px;">
                        </div>
                        
                        <div>
                            <label>ป้ายกำกับ (Tags)</label>
                            <div style="display:flex; gap:5px; flex-wrap:wrap;">
                                <label class="tag-check" style="cursor:pointer; padding:5px 8px; border:1px solid #ddd; border-radius:15px; display:flex; align-items:center; gap:3px;">
                                    <input type="checkbox" name="p-tags" value="promo" ${product && product.tags && product.tags.includes('promo') ? 'checked' : ''}>
                                    🔥 โปรฯ
                                </label>
                                <label class="tag-check" style="cursor:pointer; padding:5px 8px; border:1px solid #ddd; border-radius:15px; display:flex; align-items:center; gap:3px;">
                                    <input type="checkbox" name="p-tags" value="expiry" ${product && product.tags && product.tags.includes('expiry') ? 'checked' : ''}>
                                    ⏳ ใกล้หมด
                                </label>
                                 <label class="tag-check" style="cursor:pointer; padding:5px 8px; border:1px solid #ddd; border-radius:15px; display:flex; align-items:center; gap:3px;">
                                    <input type="checkbox" name="p-tags" value="new" ${product && product.tags && product.tags.includes('new') ? 'checked' : ''}>
                                    ✨ ใหม่
                                </label>
                            </div>
                        </div>

                        <div style="margin-top:15px;">
                            <label style="font-weight:bold; color:var(--primary-color);">รูปภาพสินค้า</label>
                            <div style="display:flex; gap:10px; align-items:center; margin-top:5px;">
                                <div id="p-image-preview" data-base64="${product && product.image ? product.image : ''}" style="width:80px; height:80px; background:#f0f7ff; border-radius:12px; overflow:hidden; flex-shrink:0; border:2px dashed var(--primary-color); display:flex; align-items:center; justify-content:center;">
                                    ${product && product.image ? `<img src="${product.image}" style="width:100%;height:100%;object-fit:cover;">` : '<span class="material-symbols-rounded" style="font-size:32px; color:var(--primary-color); opacity:0.5;">add_a_photo</span>'}
                                </div>
                                <div style="flex:1;">
                                    <input type="file" id="p-image-input" accept="image/*" style="display:none;">
                                    <button type="button" class="secondary-btn" onclick="document.getElementById('p-image-input').click()" style="width:100%; display:flex; align-items:center; justify-content:center; gap:8px; height:45px; background:white; border:1px solid var(--primary-color); color:var(--primary-color);">
                                        <span class="material-symbols-rounded">camera_alt</span>
                                        ถ่ายรูป / เลือกไฟล์
                                    </button>
                                    <div style="font-size:11px; color:#888; margin-top:5px;">* รูปจะถูกย่อขนาดอัตโนมัติเพื่อประหยัดพื้นที่</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>



                <!-- Supplier Comparison -->
                ${supplierPrices.length > 0 ? `
                    <div style="margin-top:15px; border-top:1px solid #eee; padding-top:15px;">
                        <div style="font-size:12px; font-weight:bold; color:#666; margin-bottom:5px;">เปรียบเทียบราคาร้านส่ง</div>
                        <table style="width:100%; border-collapse:collapse; font-size:12px;">
                            <thead style="background:#f9f9f9;">
                                <tr style="color:#666;">
                                    <th style="padding:5px; text-align:left;">ร้านค้า</th>
                                    <th style="padding:5px; text-align:right;">ทุน/ชิ้น</th>
                                    <th style="padding:5px; text-align:right;">หน่วยซื้อ</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${supplierPrices.map((p, i) => {
                const s = suppliers.find(x => x.id === p.supplierId);
                return `
                                        <tr style="border-bottom:1px solid #eee; ${i === 0 ? 'background:#ecfdf5;' : ''}">
                                            <td style="padding:5px;">${s ? s.name : '-'} ${i === 0 ? '⭐' : ''}</td>
                                            <td style="padding:5px; text-align:right; font-weight:bold; color:${i === 0 ? 'var(--success-color)' : 'inherit'};">
                                                ฿${Utils.formatCurrency(p.cost)}
                                            </td>
                                            <td style="padding:5px; text-align:right; color:#666;">
                                                ${p.buyUnit === 'piece' ? 'ชิ้น' : (p.buyUnit === 'pack' ? 'แพ็ค' : 'ลัง') + ` (${p.packSize})`}
                                            </td>
                                        </tr>
                                    `;
            }).join('')}
                            </tbody>
                        </table>
                    </div>
                ` : ''}

                <div style="display:flex; gap:10px; margin-top:15px;">
                    <button type="button" class="secondary-btn" style="flex:1;" onclick="App.closeModals()">ยกเลิก</button>
                    <button type="submit" class="primary-btn" style="flex:1;">บันทึก</button>
                </div>
            </form>
        `;

        setTimeout(() => {
            const fileInput = document.getElementById('p-image-input');
            const preview = document.getElementById('p-image-preview');
            // Toggle Visuals for Tags
            document.querySelectorAll('input[name="p-tags"]').forEach(chk => {
                chk.addEventListener('change', (e) => {
                    e.target.parentElement.style.background = e.target.checked ? '#e0ecff' : 'transparent';
                    e.target.parentElement.style.borderColor = e.target.checked ? 'var(--primary-color)' : '#ddd';
                });
                if (chk.checked) {
                    chk.parentElement.style.background = '#e0ecff';
                    chk.parentElement.style.borderColor = 'var(--primary-color)';
                }
            });

            fileInput.addEventListener('change', async (e) => {
                if (e.target.files[0]) {
                    try {
                        const originalBase64 = await Utils.fileToBase64(e.target.files[0]);
                        // Universal Compressor for extra safety
                        const compressed = await Utils.compressImage(originalBase64, 200, 0.5);
                        preview.innerHTML = `<img src="${compressed}" style="width:100%;height:100%;object-fit:cover;">`;
                        preview.dataset.base64 = compressed;
                    } catch (err) {
                        console.error('File Upload Error:', err);
                        App.alert('ไม่สามารถอัปโหลดรูปภาพนี้ได้');
                    }
                }
            });
            document.getElementById('product-form').addEventListener('submit', async (e) => {
                e.preventDefault();
                let id = document.getElementById('p-id').value || Utils.generateId();
                const enteredBarcode = document.getElementById('p-barcode').value.trim();
                const barcodeIdentity = Utils.resolveProductBarcode(
                    enteredBarcode,
                    id,
                    product && product.hasBarcode === false ? (product.internalCode || product.barcode) : ''
                );
                const { barcode, hasBarcode, internalCode } = barcodeIdentity;
                const group = document.getElementById('p-group').value.trim();
                const name = document.getElementById('p-name').value;
                const price = parseFloat(document.getElementById('p-price').value);
                let stock = parseInt(document.getElementById('p-stock').value) || 0;

                // New Fields
                const cost = parseFloat(document.getElementById('p-cost').value) || 0;
                const thaiChuaiThaiPrice = parseFloat(document.getElementById('p-tct-price').value) || 0;
                const location = document.getElementById('p-location').value.trim(); // Get Location
                const entryDate = document.getElementById('p-entry-date').value; // Get Entry Date
                const expiryDate = document.getElementById('p-expiry').value;
                const tags = Array.from(document.querySelectorAll('input[name="p-tags"]:checked')).map(cb => cb.value);

                // --- Duplicate Barcode Check ---
                const existingProduct = hasBarcode
                    ? App.state.products.find(p => p.hasBarcode !== false && p.barcode === barcode && p.id !== id)
                    : null;

                if (existingProduct) {
                    const isQuick = existingProduct.name.startsWith('(ขายด่วน)');
                    if (isQuick) {
                        if (!await App.confirm(`ตรวจสอบพบ "ประวัติการขายด่วน" ที่รอดำเนินการ\\n(คุณเคยขายติดลบไป ${existingProduct.stock} ชิ้น)\\n\\nระบบจะทำการอัปเดตข้อมูล และนำปริมาณที่กรอกมาหักลบยอดค้างให้โดยอัตโนมัติ (หักลบแล้วเหลือ ${stock + existingProduct.stock} ชิ้น)\\n\\nคุณต้องการแก้ไขและหักลบสต็อกอัตโนมัติหรือไม่?`)) {
                            return;
                        }

                        // Proceed to adopt the debt and OVERWRITE the quick product
                        id = existingProduct.id; // Override the new ID to use the quick product's ID
                        stock = stock + existingProduct.stock; // Math: e.g. 20 + (-5) = 15
                        // Let it continue to save!
                    } else {
                        const warningHtml = `
                            <div id="dup-warning-overlay" style="position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:2000; display:flex; align-items:center; justify-content:center;">
                                <div style="background:white; padding:20px; border-radius:10px; width:90%; max-width:400px; text-align:center; box-shadow:0 4px 20px rgba(0,0,0,0.3);">
                                    <div style="font-size:48px; margin-bottom:10px;">⚠️</div>
                                    <h3 style="margin-bottom:10px;">บาร์โค้ดนี้มีอยู่แล้ว!</h3>
                                    <div style="background:#f0f0f0; padding:10px; border-radius:5px; margin-bottom:15px; text-align:left; font-size:14px;">
                                        <div><strong>สินค้า:</strong> ${existingProduct.name}</div>
                                        <div><strong>ราคา:</strong> ฿${Utils.formatCurrency(existingProduct.price)}</div>
                                        <div><strong>สต็อกเดิม:</strong> ${existingProduct.stock}</div>
                                    </div>
                                    <p style="margin-bottom:15px; font-size:14px;">คุณต้องการทำรายการอย่างไร?</p>
                                    <div style="display:flex; flex-direction:column; gap:8px;">
                                        <button class="primary-btn" onclick="App.combineStock('${existingProduct.id}', ${stock})">
                                            📥 รวมสต็อก (เพิ่ม +${stock})
                                        </button>
                                        <button class="secondary-btn" onclick="App.switchToEdit('${existingProduct.id}')">
                                            ✏️ แก้ไขสินค้าเดิม
                                        </button>
                                        <button class="secondary-btn" style="background:#fff; border:1px solid #ddd;" onclick="document.getElementById('dup-warning-overlay').remove()">
                                            ❌ ยกเลิก
                                        </button>
                                    </div>
                                </div>
                            </div>
                        `;
                        document.body.insertAdjacentHTML('beforeend', warningHtml);
                        return; // STOP SAVE
                    }
                }
                // -------------------------------

                const existingImage = product ? product.image : null;
                const newImage = preview.dataset.base64 || existingImage;

                // Bundle Logic
                const isBundle = document.getElementById('p-is-bundle').checked;
                let parentId = null;
                let packSize = null;
                if (isBundle) {
                    parentId = document.getElementById('p-parent-id').value;
                    packSize = parseInt(document.getElementById('p-pack-size').value) || 1;
                }

                // Wholesale Logic
                const wholesaleQty = parseInt(document.getElementById('p-wholesale-qty').value) || 0;
                const wholesalePrice = parseFloat(document.getElementById('p-wholesale-price').value) || 0;
                const packBarcode = document.getElementById('p-pack-barcode').value.trim(); // Get Pack Barcode

                const newProduct = {
                    id, barcode, group, name, price, stock, image: newImage,
                    cost, thaiChuaiThaiPrice, expiryDate, tags, location, entryDate, // Save Location & Entry Date
                    parentId, packSize, wholesaleQty, wholesalePrice, packBarcode,
                    unitsPerBox: product ? (product.unitsPerBox || 0) : 0,
                    unitLabel: product ? (product.unitLabel || 'ชิ้น') : 'ชิ้น',
                    hasBarcode,
                    internalCode,
                    updatedAt: Date.now() // Auto-Timestamp
                };

                DB.saveProduct(newProduct);
                App.closeModals();
                App.renderView('stock');
            });
        }, 100);

        overlay.classList.remove('hidden');
        modal.classList.remove('hidden');
        App.setupCategorySuggestions('p-group', 'p-group-suggestions');
    },

    // --- Duplicate Check Helpers ---
    combineStock: async (id, addedQty) => {
        const product = App.state.products.find(p => p.id === id);
        if (product) {
            product.stock += addedQty;
            DB.saveProduct(product);
            await App.alert(`อัปเดตสต็อกเรียบร้อย!\n(รวมเป็น ${product.stock} ชิ้น)`);

            document.getElementById('dup-warning-overlay').remove();
            App.closeModals();
            App.renderView('stock');
        }
    },

    switchToEdit: (id) => {
        document.getElementById('dup-warning-overlay').remove();
        App.openProductModal(id);
    },

    calcStockPreview: () => {
        const packs = parseInt(document.getElementById('sc-packs').value) || 0;
        const perPack = parseInt(document.getElementById('sc-per-pack').value) || 0;
        document.getElementById('sc-total').textContent = packs * perPack;
    },

    setPackSize: (size) => {
        document.getElementById('sc-per-pack').value = size;
        App.calcStockPreview();
    },

    applyStockCalc: (isAdd) => {
        const packs = parseInt(document.getElementById('sc-packs').value) || 0;
        const perPack = parseInt(document.getElementById('sc-per-pack').value) || 0;
        const total = packs * perPack;

        if (total === 0) return;

        const stockInput = document.getElementById('p-stock');
        const current = parseInt(stockInput.value) || 0;

        if (isAdd) {
            stockInput.value = current + total;
        } else {
            stockInput.value = total;
        }

        // Hide panel after Apply
        document.getElementById('stock-calc-panel').classList.add('hidden');

        // Reset inputs
        document.getElementById('sc-packs').value = '';
        // Keep perPack as it might be reused
    },

    deleteProduct: async (id) => {
        if (await App.confirm('ต้องการลบสินค้านี้ใช่หรือไม่?')) {
            DB.deleteProduct(id);
            App.renderView('stock');
        }
    },

    openSupplierModal: (editId = null) => {
        App.closeModals(); // Prevent Overlap
        const suppliers = DB.getSuppliers();
        const s = editId ? suppliers.find(x => x.id === editId) : null;
        const modal = document.getElementById('product-modal'); // reuse modal
        const overlay = document.getElementById('modal-overlay');

        modal.innerHTML = `
            <h2>${s ? 'แก้ไขร้านค้า' : 'เพิ่มร้านค้าใหม่'}</h2>
            <form id="supplier-form" style="display:flex; flex-direction:column; gap:10px; margin-top:15px; max-height:70vh; overflow-y:auto; padding-right:5px;">
                <label>ชื่อร้านค้า</label>
                <input type="text" id="s-name" value="${s ? s.name : ''}" required style="padding:10px;">
                <label>ผู้ติดต่อ</label>
                <input type="text" id="s-contact" value="${s ? s.contact : ''}" style="padding:10px;">
                <label>เบอร์โทร</label>
                <input type="tel" id="s-phone" value="${s ? s.phone : ''}" required style="padding:10px;">
                
                <div style="margin-top:10px; padding:10px; background:#f8fafe; border-radius:8px; border:1px solid #e0ecff;">
                    <h3 style="margin-bottom:10px; font-size:14px; color:var(--primary-color);">📅 ตารางนัดหมายลงของ</h3>
                    <div style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:10px;">
                        <div style="flex:1; min-width:200px;">
                            <label style="font-size:12px;">วันนัดหมาย (เลือกได้หลายวัน)</label>
                            <div style="display:flex; flex-wrap:wrap; gap:8px; margin-top:5px; font-size:13px;">
                                ${['จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์', 'อาทิตย์'].map(day => `
                                    <label style="display:flex; align-items:center; gap:3px; cursor:pointer; background:white; padding:4px 8px; border-radius:4px; border:1px solid #ddd;">
                                        <input type="checkbox" name="s-schedule-day-chk" value="${day}" ${s && s.scheduleDay && s.scheduleDay.includes(day) ? 'checked' : ''}>
                                        ${day}
                                    </label>
                                `).join('')}
                            </div>
                        </div>
                        <div style="flex:1; min-width:100px;">
                            <label style="font-size:12px;">เวลา (โดยประมาณ)</label>
                            <input type="time" id="s-schedule-time" value="${s ? (s.scheduleTime || '') : ''}" style="width:100%; padding:8px;">
                        </div>
                    </div>
                    <div>
                        <label style="font-size:12px;">หมายเหตุ / ความถี่ (เช่น ทุกสัปดาห์, เดือนละครั้ง)</label>
                        <input type="text" id="s-schedule-note" value="${s ? (s.scheduleNote || '') : ''}" placeholder="เช่น ของลงทุกต้นเดือน" style="width:100%; padding:8px;">
                    </div>
                </div>

                <div style="display:flex; gap:10px; margin-top:15px;">
                    <button type="button" class="secondary-btn" onclick="App.closeModals()" style="flex:1;">ยกเลิก</button>
                    <button type="submit" class="primary-btn" style="flex:1;">บันทึก</button>
                </div>
            </form>
        `;

        document.getElementById('supplier-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = editId || Utils.generateId();
            const name = document.getElementById('s-name').value;
            const contact = document.getElementById('s-contact').value;
            const phone = document.getElementById('s-phone').value.trim();
            const checkedDays = Array.from(document.querySelectorAll('input[name="s-schedule-day-chk"]:checked')).map(cb => cb.value);
            const scheduleDay = checkedDays.join(', ');
            const scheduleTime = document.getElementById('s-schedule-time').value;
            const scheduleNote = document.getElementById('s-schedule-note').value;

            if (!/^0\d{8,9}$/.test(phone)) {
                await App.alert('เบอร์โทรศัพท์ไม่ถูกต้อง!\n- ต้องขึ้นต้นด้วย 0\n- มีความยาว 9 หรือ 10 หลัก\n- เป็นตัวเลขเท่านั้น');
                return;
            }

            DB.saveSupplier({ id, name, contact, phone, scheduleDay, scheduleTime, scheduleNote });
            App.closeModals();
            App.renderView('suppliers');
        });

        overlay.classList.remove('hidden');
        modal.classList.remove('hidden');
    },

    deleteSupplier: async (id) => {
        if (await App.confirm('ลบร้านค้านี้? ข้อมูลราคาที่ผูกไว้จะหายไปด้วย')) {
            DB.deleteSupplier(id);
            App.renderView('suppliers');
        }
    },

    renderSupplierDetail: (id) => {
        const supplier = DB.getSuppliers().find(s => s.id === id);
        if (!supplier) return;

        // Find products linked to this supplier
        const allProducts = DB.getProducts();
        const suppliedProducts = allProducts.filter(p => {
            const prices = DB.getPricesByProduct(p.id);
            return prices.some(price => price.supplierId === id);
        });

        const modal = document.getElementById('product-modal'); // Re-use product modal container
        const overlay = document.getElementById('modal-overlay');

        modal.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:start;">
                <h2>${supplier.name}</h2>
                <button class="icon-btn" onclick="App.closeModals()"><span class="material-symbols-rounded">close</span></button>
            </div>
            <div style="margin-top:10px; color:#666;">
                <div><strong>ผู้ติดต่อ:</strong> ${supplier.contact || '-'}</div>
                <div><strong>โทรศัพท์:</strong> ${supplier.phone || '-'}</div>
            </div>
            
            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:20px;">
                <h3 style="font-size:16px; margin:0;">สินค้าที่ส่ง (${suppliedProducts.length})</h3>
                <button class="primary-btn small" onclick="App.openLinkProductModal('${supplier.id}')">+ เพิ่มสินค้า</button>
            </div>
            <div style="max-height:300px; overflow-y:auto; margin-top:10px; border:1px solid #eee; border-radius:8px;">
                <table style="width:100%; border-collapse:collapse;">
                    <tbody>
                        ${suppliedProducts.map(p => {
            const priceInfo = DB.getPricesByProduct(p.id).find(pr => pr.supplierId === id);
            return `
                                <tr style="border-bottom:1px solid #eee;">
                                    <td style="padding:10px;">${p.name}</td>
                                    <td style="padding:10px; text-align:right;">
                                        ต้นทุน: ${priceInfo ? Utils.formatCurrency(priceInfo.buyPrice) : '-'} 
                                        /${priceInfo ? (priceInfo.unit === 'piece' ? 'ชิ้น' : priceInfo.unit) : '-'}
                                    </td>
                                </tr>
                            `;
        }).join('')}
                        ${suppliedProducts.length === 0 ? `
                            <tr>
                                <td colspan="2" style="padding:30px; text-align:center; color:#999; cursor:pointer;" onclick="App.openLinkProductModal('${supplier.id}')">
                                    <span class="material-symbols-rounded" style="font-size:32px; display:block; margin-bottom:5px;">add_circle</span>
                                    ไม่มีสินค้าที่ผูกไว้ (กดเพื่อเพิ่ม)
                                </td>
                            </tr>
                        ` : ''}
                    </tbody>
                </table>
            </div>
            
            <div style="margin-top:20px; text-align:right;">
                <button class="secondary-btn" onclick="App.closeModals()">ปิด</button>
            </div>
        `;

        overlay.classList.remove('hidden');
        modal.classList.remove('hidden');
    },

    openLinkProductModal: (supplierId) => {
        App.closeModals(); // Prevent Overlap
        const modal = document.getElementById('product-modal');
        const overlay = document.getElementById('modal-overlay');
        const allProducts = DB.getProducts();

        modal.innerHTML = `
            <h2>เพิ่มสินค้าให้ร้านค้า</h2>
            <form id="link-form" style="display:flex; flex-direction:column; gap:10px; margin-top:15px;">
                <label>ค้นหาสินค้า (พิมพ์ชื่อหรือบาร์โค้ด)</label>
                <div style="position:relative;">
                     <input type="text" id="l-product-search" placeholder="พิมพ์เพื่อค้นหา..." 
                        style="width:100%; padding:10px;" 
                        onkeyup="App.searchLinkProduct(this.value)" autocomplete="off">
                     <input type="hidden" id="l-product">
                     <div id="l-search-results" class="hidden" 
                        style="position:absolute; top:100%; left:0; right:0; background:white; border:1px solid #ddd; border-top:none; max-height:200px; overflow-y:auto; z-index:100; box-shadow:0 4px 6px rgba(0,0,0,0.1);">
                     </div>
                </div>
                <div style="background:var(--neutral-100); padding:10px; border-radius:8px; border:1px solid var(--neutral-300);">
                    <label>หน่วยการซื้อ</label>
                    <select id="l-unit" style="width:100%; padding:8px; margin-bottom:10px;" onchange="App.togglePackInput()">
                         <option value="piece">ชิ้น (Piece)</option>
                         <option value="pack">แพ็ค (Pack)</option>
                         <option value="cartoon">ลัง (Carton)</option>
                    </select>

                    <div id="pack-size-group" style="display:none; margin-bottom:10px;">
                        <label>จำนวนในแพ็ค/ลัง (ชิ้น)</label>
                        <input type="number" id="l-pack-size" value="1" min="1" style="width:100%; padding:8px;">
                    </div>

                    <label id="l-price-label">ราคาซื้อ (บาท)</label>
                    <input type="number" step="0.01" id="l-buy-price" required style="width:100%;">
                    
                    <div style="margin-top:10px; text-align:right; font-weight:bold; color:var(--primary-color);">
                        ต้นทุนตกชิ้นละ: <span id="l-calc-cost">0.00</span> บาท
                    </div>
                </div>
                <div style="display:flex; gap:10px; margin-top:15px;">
                    <button type="button" class="secondary-btn" style="flex:1;" onclick="App.closeModals()">ยกเลิก</button>
                    <button type="submit" class="primary-btn" style="flex:1;">บันทึก</button>
                </div>
            </form>
        `;

        App.togglePackInput = () => {
            const unit = document.getElementById('l-unit').value;
            const sizeGroup = document.getElementById('pack-size-group');
            const priceLabel = document.getElementById('l-price-label');
            if (unit === 'piece') {
                sizeGroup.style.display = 'none';
                document.getElementById('l-pack-size').value = 1;
                priceLabel.textContent = 'ราคาต้นทุน (ต่อชิ้น)';
            } else {
                sizeGroup.style.display = 'block';
                priceLabel.textContent = `ราคายก${unit === 'pack' ? 'แพ็ค' : 'ลัง'}`;
            }
            App.calcUnitCost();
        };

        App.calcUnitCost = () => {
            const price = parseFloat(document.getElementById('l-buy-price').value) || 0;
            const size = parseFloat(document.getElementById('l-pack-size').value) || 1;
            const perUnit = size > 0 ? (price / size) : 0;
            document.getElementById('l-calc-cost').textContent = Utils.formatCurrency(perUnit);
        };

        document.getElementById('l-buy-price').addEventListener('input', App.calcUnitCost);
        document.getElementById('l-pack-size').addEventListener('input', App.calcUnitCost);

        document.getElementById('link-form').addEventListener('submit', (e) => {
            e.preventDefault();
            const productId = document.getElementById('l-product').value;
            if (!productId) {
                App.alert('กรุณาเลือกสินค้าจากรายการค้นหา');
                return;
            }
            const buyUnit = document.getElementById('l-unit').value;
            const packSize = parseFloat(document.getElementById('l-pack-size').value) || 1;
            const buyPrice = parseFloat(document.getElementById('l-buy-price').value) || 0;

            DB.saveSupplierPrice({ supplierId, productId, buyUnit, packSize, buyPrice });
            App.closeModals();
            App.renderSupplierDetail(supplierId);
        });

        overlay.classList.remove('hidden');
        modal.classList.remove('hidden');
    },

    searchLinkProduct: (keyword) => {
        const resultsDiv = document.getElementById('l-search-results');
        if (!keyword || keyword.length < 1) {
            resultsDiv.classList.add('hidden');
            return;
        }

        const lower = keyword.toLowerCase();
        const matches = App.state.products.filter(p =>
            p.name.toLowerCase().includes(lower) ||
            p.barcode.includes(lower)
        ).slice(0, 10); // Limit to 10 results

        if (matches.length === 0) {
            resultsDiv.innerHTML = '<div style="padding:10px; color:#999; text-align:center;">ไม่พบสินค้า</div>';
        } else {
            resultsDiv.innerHTML = matches.map(p => `
                <div style="padding:10px; border-bottom:1px solid #eee; cursor:pointer;" 
                     onmouseover="this.style.background='#f9f9f9'" onmouseout="this.style.background='white'"
                     onclick="App.selectLinkProduct('${p.id}', '${p.name.replace(/'/g, "\\'")}', ${p.cost || 0})">
                    <div style="font-weight:bold;">${p.name}</div>
                    <div style="font-size:12px; color:#666;">${p.barcode} | ขาย: ${p.price}</div>
                </div>
            `).join('');
        }
        resultsDiv.classList.remove('hidden');
    },

    selectLinkProduct: (id, name, cost) => {
        document.getElementById('l-product').value = id;
        document.getElementById('l-product-search').value = name;
        document.getElementById('l-search-results').classList.add('hidden');

        // Auto-fill cost if available (as a hint)
        if (cost) {
            document.getElementById('l-buy-price').value = cost;
            App.calcUnitCost();
        }
    },

    // --- Variant Modal (Groups) ---
    openVariantModal: (groupName) => {
        const modal = document.getElementById('product-modal'); // reuse generic modal container
        const overlay = document.getElementById('modal-overlay');

        const variants = App.state.products.filter(p => p.group === groupName);

        modal.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                <div style="display:flex; align-items:center; gap:10px;">
                    <h2>${groupName}</h2>
                    <button class="icon-btn" onclick="App.renameCategory('${groupName}')" style="color:var(--primary-color);">
                        <span class="material-symbols-rounded" style="font-size:18px;">edit</span>
                    </button>
                </div>
                <button class="icon-btn" onclick="App.closeModals()"><span class="material-symbols-rounded">close</span></button>
            </div>
            <div class="variant-grid" style="display:grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap:15px;">
                ${variants.map(p => `
                    <div class="product-card" onclick="App.addToCart(App.state.products.find(x => x.id === '${p.id}')); App.closeModals();" style="border:1px solid #eee;">
                        <div style="height:100px; background:#f9f9f9; display:flex; align-items:center; justify-content:center;">
                            ${p.image ? `<img src="${p.image}" style="width:100%; height:100%; object-fit:contain;">` : ''}
                        </div>
                        <div style="padding:10px;">
                            <div style="font-weight:bold; font-size:14px;">${p.name}</div>
                            <div style="color:var(--primary-color);">฿${Utils.formatCurrency(p.price)}</div>
                            <div style="font-size:12px; color:#666;">เหลือ ${p.stock}</div>
                        </div>
                    </div>
                `).join('')}
            </div>
            <button class="secondary-btn" style="width:100%; margin-top:20px;" onclick="App.closeModals()">ปิด</button>
        `;

        overlay.classList.remove('hidden');
        modal.classList.remove('hidden');
    },

    renameCategory: (oldName) => {
        App.checkPin(async () => {
            const result = await App.prompt('ตั้งชื่อหมวดหมู่ใหม่:', oldName);
            if (result === null) return;
            const newName = result.trim();
            if (!newName || newName === oldName) return;

            // Update Products
            const products = App.state.products;
            let count = 0;
            products.forEach(p => {
                if (p.group === oldName) {
                    p.group = newName;
                    count++;
                }
            });

            if (count > 0) {
                // Update Group Image Key if exists
                const settings = DB.getSettings();
                if (settings.groupImages && settings.groupImages[oldName]) {
                    settings.groupImages[newName] = settings.groupImages[oldName];
                    delete settings.groupImages[oldName];
                    DB.saveSettings(settings);
                }

                DB.saveProducts(products);
                App.closeModals(); // Hide Variant Modal first
                App.renderView('pos'); // Refresh Grid

                setTimeout(async () => {
                    await App.alert(`เปลี่ยนชื่อหมวดหมู่เรียบร้อย (${count} รายการ)`);
                }, 100);
            }
        });
    },

    // --- Search & Scan Logic ---
    renderQuickSearchResults: (rawQuery) => {
        const panel = document.getElementById('quick-search-results');
        if (!panel) return;
        const query = String(rawQuery || '').trim().toLowerCase();
        if (!query || /^\d{6,18}$/.test(query)) {
            panel.classList.add('hidden');
            panel.innerHTML = '';
            return;
        }

        const matches = App.state.products
            .filter(p => (p.name || '').toLowerCase().includes(query) || (p.group || '').toLowerCase().includes(query))
            .sort((a, b) => {
                const aName = (a.name || '').toLowerCase();
                const bName = (b.name || '').toLowerCase();
                return Number(!aName.startsWith(query)) - Number(!bName.startsWith(query)) || aName.localeCompare(bName, 'th');
            })
            .slice(0, 12);
        const groups = [...new Set(matches.map(p => p.group).filter(Boolean))].slice(0, 4);
        if (!matches.length) {
            panel.innerHTML = `${App.state.voiceTranscript ? `<div class="quick-search-heard"><span class="material-symbols-rounded">hearing</span> ได้ยิน: “${Utils.escapeHTML(App.state.voiceTranscript)}”</div>` : ''}<div class="quick-search-empty">ไม่พบสินค้า — ลองพูดคำสั้นลง เช่น “โค้ก” หรือชื่อหมวดหมู่</div>`;
            panel.classList.remove('hidden');
            return;
        }

        panel.innerHTML = `
            ${App.state.voiceTranscript ? `<div class="quick-search-heard"><span class="material-symbols-rounded">hearing</span> ได้ยิน: “${Utils.escapeHTML(App.state.voiceTranscript)}”</div>` : ''}
            ${groups.length ? `<div class="quick-search-groups">${groups.map(group => `<button type="button" onclick="App.chooseQuickSearchCategory('${encodeURIComponent(group)}')">${Utils.escapeHTML(group)}</button>`).join('')}</div>` : ''}
            <div class="quick-search-products">${matches.map(p => `
                    <button type="button" class="quick-search-item" onclick="App.selectQuickSearchProduct('${p.id}')">
                        <span class="quick-search-thumb">${p.image ? `<img src="${p.image}" alt="">` : '<span class="material-symbols-rounded">inventory_2</span>'}</span>
                        <span class="quick-search-copy"><strong>${Utils.escapeHTML(p.name)}</strong><small>${Utils.escapeHTML(p.group || 'สินค้า')} · เหลือ ${Number(p.stock) || 0}</small></span>
                        <strong class="quick-search-price">฿${Utils.formatCurrency(p.price)}</strong>
                    </button>
                `).join('')}</div>
        `;
        panel.classList.remove('hidden');
    },

    selectQuickSearchProduct: (productId) => {
        const product = App.state.products.find(p => p.id === productId);
        if (product && DB.getSettings().scannerPriceCheckMode === true) {
            App.addPriceCheckItem(product, false);
            App.showScannerPriceResult(product, product.barcode || 'ค้นหาด้วยเสียง');
        } else if (product) {
            App.addToCart(product);
        }
        App.clearProductSearch();
    },

    chooseQuickSearchCategory: (encodedGroup) => {
        App.setQuickFilter(decodeURIComponent(encodedGroup));
        document.getElementById('quick-search-results')?.classList.add('hidden');
    },

    clearProductSearch: () => {
        App.state.searchQuery = '';
        App.state.voiceTranscript = '';
        if (App.elements.globalSearch) App.elements.globalSearch.value = '';
        App.renderQuickSearchResults('');
        if (App.state.currentView === 'pos') App.renderProductGrid();
    },

    updateVoiceSearchButton: () => {
        const button = document.getElementById('btn-voice-search');
        if (!button) return;
        button.classList.toggle('listening', App.state.voiceListening);
        button.setAttribute('aria-pressed', App.state.voiceListening ? 'true' : 'false');
        button.setAttribute('aria-label', App.state.voiceListening ? 'ปิดการฟังเสียง' : 'เปิดการฟังเสียงเพื่อค้นหาสินค้า');
        button.title = App.state.voiceListening ? 'กำลังฟังอยู่ — แตะเพื่อปิด' : 'แตะเพื่อเปิดฟังเสียงค้นหาสินค้า';
    },

    startVoiceSearch: () => {
        if (DB.getSettings().microphoneEnabled === false) {
            App.alert('ปิดการใช้ไมโครโฟนไว้ในเมนูบัญชี\nแตะแถบบัญชีแล้วเปิด “ค้นหาด้วยเสียง” ก่อน');
            return;
        }
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            App.alert('เครื่องนี้ยังไม่รองรับการค้นหาด้วยเสียง กรุณาพิมพ์ชื่อสินค้าแทน');
            return;
        }
        if (App.state.voiceListening) {
            App.state.voiceListening = false;
            App.updateVoiceSearchButton();
            if (App.voiceRecognition) {
                try { App.voiceRecognition.abort(); } catch (_) {}
            }
            return;
        }
        App.state.voiceListening = true;
        App.updateVoiceSearchButton();
        App.startVoiceRecognitionSession(SpeechRecognition);
    },

    startVoiceRecognitionSession: (SpeechRecognition) => {
        if (!App.state.voiceListening || document.visibilityState !== 'visible') return;
        const button = document.getElementById('btn-voice-search');
        const recognition = new SpeechRecognition();
        App.voiceRecognition = recognition;
        recognition.lang = 'th-TH';
        // Show candidates while the user is still speaking instead of waiting
        // for the speech service to finalize the whole phrase.
        recognition.interimResults = true;
        recognition.maxAlternatives = 1;
        recognition.continuous = true;
        recognition.onstart = () => App.updateVoiceSearchButton();
        recognition.onend = () => {
            if (App.voiceRecognition === recognition) App.voiceRecognition = null;
            if (App.state.voiceListening && document.visibilityState === 'visible') {
                setTimeout(() => App.startVoiceRecognitionSession(SpeechRecognition), 80);
            } else {
                App.updateVoiceSearchButton();
            }
        };
        recognition.onerror = event => {
            if (['not-allowed', 'service-not-allowed', 'audio-capture'].includes(event.error)) {
                App.state.voiceListening = false;
                App.updateVoiceSearchButton();
            }
        };
        recognition.onresult = (event) => {
            const spoken = Array.from(event.results || [])
                .slice(event.resultIndex || 0)
                .map(result => result?.[0]?.transcript || '')
                .join(' ')
                .trim();
            if (!spoken) return;
            App.state.voiceTranscript = spoken;
            App.elements.globalSearch.value = spoken;
            App.renderQuickSearchResults(spoken);
            App.elements.globalSearch.dispatchEvent(new Event('input', { bubbles: true }));
        };
        try { recognition.start(); } catch (_) {}
    },

    setupGlobalInput: () => {
        const input = App.elements.globalSearch;

        document.getElementById('btn-voice-search')?.addEventListener('click', App.startVoiceSearch);
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden' && App.voiceRecognition) {
                try { App.voiceRecognition.abort(); } catch (_) {}
            } else if (document.visibilityState === 'visible' && App.state.voiceListening && !App.voiceRecognition) {
                const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
                if (SpeechRecognition) App.startVoiceRecognitionSession(SpeechRecognition);
            }
        });
        input.addEventListener('focus', () => App.renderQuickSearchResults(input.value));
        input.addEventListener('blur', () => setTimeout(() => document.getElementById('quick-search-results')?.classList.add('hidden'), 180));

        // 1. Standard Search Box Input
        let timeout = null;
        input.addEventListener('input', (e) => {
            clearTimeout(timeout);
            App.renderQuickSearchResults(e.target.value);
            timeout = setTimeout(() => {
                const val = e.target.value;
                App.state.searchQuery = val;
                // If pasted or typed manually fully
                if (/^\d{8,14}$/.test(val)) {
                    App.handleBarcodeScan(val);
                    input.value = '';
                    App.state.searchQuery = '';
                    App.renderQuickSearchResults('');
                } else {
                    if (App.state.currentView === 'pos') {
                        App.renderProductGrid();
                    } else if (App.state.currentView === 'stock') {
                        App.renderView('stock');
                    }
                }
            }, 300);
        });

        // 2. Global Keydown Listener (Robust Speed-Based)
        // Works even if input is focused (e.g. on-screen keyboard involved)
        let scanBuffer = '';
        let scanStartedAt = 0;
        let lastKeyTime = 0;

        document.addEventListener('keydown', (e) => {
            if (e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
            const now = Date.now();
            const timeDiff = now - lastKeyTime;
            lastKeyTime = now;

            // Bluetooth scanners act like keyboards. Some budget scanners send
            // more slowly on Android, so allow up to 250ms between characters.
            if (timeDiff > 250) {
                scanBuffer = '';
                scanStartedAt = now;
            }

            if (Utils.isScannerTerminator(e.key)) {
                const elapsed = scanStartedAt ? now - scanStartedAt : 0;
                if (Utils.isLikelyScannerInput(scanBuffer, elapsed)) {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('Bluetooth/USB Scan Captured:', scanBuffer);

                    if (document.activeElement === App.elements.globalSearch) {
                        App.elements.globalSearch.value = '';
                        App.state.searchQuery = '';
                    }
                    App.handleBarcodeScan(scanBuffer);
                }
                scanBuffer = '';
                scanStartedAt = 0;
                return;
            }

            if (e.key.length === 1) {
                if (!scanBuffer) scanStartedAt = now;
                scanBuffer += e.key;
                if (scanBuffer.length > 32) {
                    scanBuffer = '';
                    scanStartedAt = 0;
                }
            }
        }, true); // Capture phase to intervene early

        // 3. Manual Trigger Button
        document.getElementById('btn-scan-trigger').addEventListener('click', App.openCameraScanner);
    },

    setupScannerPriceCheckMode: () => {
        const buttons = document.querySelectorAll('.price-check-mode-btn');
        if (!buttons.length) return;
        buttons.forEach(button => {
            if (button.dataset.ready === 'true') return;
            button.dataset.ready = 'true';
            button.addEventListener('click', App.toggleScannerPriceCheckMode);
        });
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible' && DB.getSettings().scannerPriceCheckMode) {
                App.requestPriceCheckWakeLock();
            }
        });
        App.updateScannerPriceCheckButton();
        if (DB.getSettings().scannerPriceCheckMode) App.requestPriceCheckWakeLock();
    },

    updateScannerPriceCheckButton: () => {
        const enabled = DB.getSettings().scannerPriceCheckMode === true;
        document.querySelectorAll('.price-check-mode-btn').forEach(button => {
            button.classList.toggle('active', enabled);
            button.setAttribute('aria-pressed', enabled ? 'true' : 'false');
            button.setAttribute('aria-label', enabled ? 'ปิดโหมดสแกนเช็กราคา' : 'เปิดโหมดสแกนเช็กราคา');
            button.title = enabled ? 'กำลังเช็กราคา — สแกนแล้วไม่เข้าบิล' : 'เปิดโหมดสแกนเช็กราคา';
        });
    },

    requestPriceCheckWakeLock: async () => {
        if (!DB.getSettings().scannerPriceCheckMode || document.visibilityState !== 'visible') return false;
        if (!('wakeLock' in navigator)) return false;
        try {
            if (App.state.priceCheckWakeLock && !App.state.priceCheckWakeLock.released) return true;
            App.state.priceCheckWakeLock = await navigator.wakeLock.request('screen');
            App.state.priceCheckWakeLock.addEventListener('release', () => {
                App.state.priceCheckWakeLock = null;
            });
            return true;
        } catch (error) {
            console.warn('Screen Wake Lock unavailable:', error);
            return false;
        }
    },

    releasePriceCheckWakeLock: async () => {
        const lock = App.state.priceCheckWakeLock;
        App.state.priceCheckWakeLock = null;
        if (lock && !lock.released) {
            try { await lock.release(); } catch (_) {}
        }
    },

    toggleScannerPriceCheckMode: async () => {
        const enabled = DB.getSettings().scannerPriceCheckMode !== true;
        await DB.saveSettings({ scannerPriceCheckMode: enabled });
        App.updateScannerPriceCheckButton();
        if (enabled) {
            const wakeLockActive = await App.requestPriceCheckWakeLock();
            await App.alert(
                `เปิดโหมดสแกนเช็กราคาแล้ว\n\nยิงบาร์โค้ดจากเครื่องสแกนได้ทันที และสินค้าจะไม่ถูกเพิ่มเข้าบิล${wakeLockActive ? '\nระบบกำลังป้องกันหน้าจอดับ' : '\nเครื่องนี้ไม่อนุญาตให้เว็บป้องกันหน้าจอดับ กรุณาตั้งเวลาล็อกหน้าจอให้นานขึ้น'}`
            );
        } else {
            await App.releasePriceCheckWakeLock();
            App.closeModals();
            await App.alert('ปิดโหมดเช็กราคาแล้ว\nการสแกนในหน้าขายจะกลับไปเพิ่มสินค้าเข้าบิลตามปกติ');
        }
    },

    setupCameraScanner: () => {
        const overlay = document.getElementById('camera-scanner-overlay');
        if (!overlay || overlay.dataset.ready === 'true') return;
        overlay.dataset.ready = 'true';
        document.getElementById('btn-camera-close').addEventListener('click', App.closeCameraScanner);
        document.getElementById('btn-camera-switch').addEventListener('click', async () => {
            App.state.cameraScanner.facingEnvironment = !App.state.cameraScanner.facingEnvironment;
            await App.startCameraScanner();
        });
        document.getElementById('btn-camera-torch').addEventListener('click', App.toggleCameraTorch);
        document.getElementById('camera-scanner-form').addEventListener('submit', async (event) => {
            event.preventDefault();
            const input = document.getElementById('camera-scanner-input');
            const code = input.value.trim();
            if (!code) return;
            input.value = '';
            await App.acceptCameraBarcode(code);
        });
        overlay.addEventListener('click', event => {
            if (event.target === overlay) App.closeCameraScanner();
        });
    },

    setCameraScannerStatus: (message, type = '') => {
        const status = document.getElementById('camera-scanner-status');
        if (!status) return;
        status.textContent = message;
        status.className = 'camera-scanner-status' + (type ? ` ${type}` : '');
    },

    openCameraScanner: async () => {
        if (DB.getSettings().cameraEnabled === false) {
            await App.alert('ปิดการใช้กล้องไว้ในเมนูบัญชี\nแตะแถบบัญชีแล้วเปิด “กล้องสแกนบาร์โค้ด” ก่อน');
            return;
        }
        const overlay = document.getElementById('camera-scanner-overlay');
        overlay.classList.remove('hidden');
        App.hideCameraScanResult(true);
        App.state.cameraScanner.active = true;
        await App.startCameraScanner();
    },

    stopCameraScanner: () => {
        const scanner = App.state.cameraScanner;
        scanner.active = false;
        scanner.detecting = false;
        scanner.detectingNow = false;
        clearTimeout(scanner.detectionTimer);
        scanner.detectionTimer = null;
        if (scanner.reader) { try { scanner.reader.reset(); } catch (_) {} scanner.reader = null; }
        if (scanner.stream) scanner.stream.getTracks().forEach(track => track.stop());
        scanner.stream = null;
        const video = document.getElementById('camera-scanner-video');
        if (video) video.srcObject = null;
    },

    closeCameraScanner: () => {
        App.stopCameraScanner();
        document.getElementById('camera-scanner-overlay').classList.add('hidden');
        App.elements.globalSearch.focus();
    },

    startCameraScanner: async () => {
        App.stopCameraScanner();
        const scanner = App.state.cameraScanner;
        scanner.active = true;
        const video = document.getElementById('camera-scanner-video');
        const empty = document.getElementById('camera-scanner-empty');
        empty.classList.add('hidden');
        video.style.display = 'block';
        App.setCameraScannerStatus('กำลังเปิดกล้อง...');
        const constraints = { video: { facingMode: scanner.facingEnvironment ? { ideal: 'environment' } : 'user', width: { ideal: 960, max: 1280 }, height: { ideal: 540, max: 720 } }, audio: false };
        try {
            if ('BarcodeDetector' in window) {
                scanner.detector ||= new BarcodeDetector({ formats: ['ean_13','ean_8','upc_a','upc_e','code_128','code_39','itf','qr_code'] });
                scanner.stream = await navigator.mediaDevices.getUserMedia(constraints);
                video.srcObject = scanner.stream;
                await video.play();
                scanner.detecting = true;
                App.setCameraScannerStatus('พร้อมสแกน', 'ok');
                App.detectCameraBarcode();
                return;
            }
            if (!window.ZXing) {
                App.setCameraScannerStatus('กำลังเตรียมตัวอ่านบาร์โค้ด...');
                await App.loadZXing();
            }
            scanner.reader = new ZXing.BrowserMultiFormatReader();
            App.setCameraScannerStatus('พร้อมสแกน', 'ok');
            await scanner.reader.decodeFromConstraints(constraints, 'camera-scanner-video', (result) => {
                if (result && scanner.active) App.acceptCameraBarcode(result.getText());
            });
        } catch (error) {
            console.error('Camera scanner error:', error);
            video.style.display = 'none';
            empty.classList.remove('hidden');
            App.setCameraScannerStatus(error.name === 'NotAllowedError' ? 'ไม่ได้รับอนุญาตให้ใช้กล้อง' : 'เปิดกล้องไม่ได้ ใช้ช่องกรอกบาร์โค้ดแทนได้', 'error');
            document.getElementById('camera-scanner-input').focus();
        }
    },

    loadExternalScript: (src) => {
        App._scriptPromises ||= {};
        if (App._scriptPromises[src]) return App._scriptPromises[src];
        App._scriptPromises[src] = new Promise((resolve, reject) => {
            const existing = document.querySelector(`script[src="${src}"]`);
            if (existing?.dataset.loaded === 'true') return resolve();
            const script = existing || document.createElement('script');
            script.src = src;
            script.async = true;
            script.onload = () => { script.dataset.loaded = 'true'; resolve(); };
            script.onerror = () => reject(new Error(`โหลด ${src} ไม่สำเร็จ`));
            if (!existing) document.head.appendChild(script);
        });
        return App._scriptPromises[src];
    },

    loadFirebaseSdkInBackground: async () => {
        try {
            await App.loadExternalScript('https://www.gstatic.com/firebasejs/10.9.0/firebase-app-compat.js');
            await Promise.all([
                App.loadExternalScript('https://www.gstatic.com/firebasejs/10.9.0/firebase-auth-compat.js'),
                App.loadExternalScript('https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore-compat.js')
            ]);
            DB.initializeFirebase();
        } catch (error) {
            console.error('Firebase background load error:', error);
        }
    },

    loadZXing: async () => {
        if (window.ZXing) return window.ZXing;
        await App.loadExternalScript('https://unpkg.com/@zxing/library@0.21.3/umd/index.min.js');
        if (!window.ZXing) throw new Error('โหลดตัวอ่านบาร์โค้ดไม่สำเร็จ');
        return window.ZXing;
    },

    preloadScannerFallback: () => {
        if ('BarcodeDetector' in window || window.ZXing) return;
        const preload = () => App.loadZXing().catch(error => console.warn('Scanner preload error:', error));
        if ('requestIdleCallback' in window) requestIdleCallback(preload, { timeout: 2500 });
        else setTimeout(preload, 1200);
    },

    detectCameraBarcode: async () => {
        const scanner = App.state.cameraScanner;
        const video = document.getElementById('camera-scanner-video');
        if (!scanner.active || !scanner.detecting) return;
        if (scanner.detectingNow) return;
        scanner.detectingNow = true;
        try {
            if (video.readyState >= 2) {
                const results = await scanner.detector.detect(video);
                if (results[0]?.rawValue) await App.acceptCameraBarcode(results[0].rawValue);
            }
        } catch (_) {}
        finally {
            scanner.detectingNow = false;
            scanner.lastDetectionAt = Date.now();
        }
        if (scanner.active && scanner.detecting) {
            scanner.detectionTimer = setTimeout(App.detectCameraBarcode, 110);
        }
    },

    acceptCameraBarcode: async (rawCode) => {
        const code = String(rawCode || '').trim();
        if (!code) return;
        const scanner = App.state.cameraScanner;
        const now = Date.now();
        if (scanner.lastCode === code && now - scanner.lastAt < 1800) return;
        scanner.lastCode = code;
        scanner.lastAt = now;
        App.setCameraScannerStatus(`อ่านบาร์โค้ด ${code} — กำลังตรวจสอบ...`);
        await App.handleBarcodeScan(code);
    },

    playScanFeedback: (success = true) => {
        if (navigator.vibrate) navigator.vibrate(success ? [45, 35, 75] : [120, 60, 120]);
        try {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (!AudioContextClass) return;
            const context = new AudioContextClass();
            const oscillator = context.createOscillator();
            const gain = context.createGain();
            oscillator.type = 'sine';
            oscillator.frequency.value = success ? 880 : 220;
            gain.gain.setValueAtTime(0.08, context.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.12);
            oscillator.connect(gain);
            gain.connect(context.destination);
            oscillator.start();
            oscillator.stop(context.currentTime + 0.12);
            oscillator.onended = () => context.close();
        } catch (_) {}
    },

    hideCameraScanResult: (immediate = false) => {
        const result = document.getElementById('camera-scan-result');
        if (!result) return;
        clearTimeout(App.state.cameraScanner.resultTimer);
        clearTimeout(App.state.cameraScanner.resultCleanupTimer);
        const cleanup = () => {
            result.className = 'camera-scan-result';
            result.innerHTML = '';
            result.onclick = null;
            result.onkeydown = null;
            result.removeAttribute('role');
            result.removeAttribute('tabindex');
            result.removeAttribute('aria-label');
        };
        if (immediate || !result.classList.contains('visible')) cleanup();
        else {
            result.classList.add('leaving');
            App.state.cameraScanner.resultCleanupTimer = setTimeout(cleanup, 220);
        }
    },

    showCameraScanResult: (product, barcode, options = {}) => {
        const result = document.getElementById('camera-scan-result');
        if (!result) return;
        clearTimeout(App.state.cameraScanner.resultTimer);

        const cartItem = App.state.cart.find(item => item.id === product.id);
        const cartQty = cartItem?.qty || 0;
        const stock = Number(product.stock) || 0;
        const projectedStock = stock - cartQty;
        const addedQty = options.addedQty || 0;
        const addedToCart = options.addedToCart === true;
        const imageHtml = product.image
            ? `<img src="${product.image}" alt="">`
            : '<span class="material-symbols-rounded">inventory_2</span>';

        result.innerHTML = `
            <div class="camera-scan-result-image">${imageHtml}</div>
            <div class="camera-scan-result-body">
                <div class="camera-scan-result-state">
                    <span class="camera-scan-result-check material-symbols-rounded">${addedToCart ? 'check_circle' : 'visibility'}</span>
                    ${addedToCart ? `เพิ่มเข้าบิลแล้ว +${addedQty}` : 'พบสินค้าในระบบ'}
                </div>
                <div class="camera-scan-result-name">${Utils.escapeHTML(product.name)}</div>
                <div class="camera-scan-result-code">${Utils.escapeHTML(barcode)}</div>
                <div class="camera-scan-result-facts">
                    <strong>฿${Utils.formatCurrency(product.price)}</strong>
                    ${addedToCart ? `<span>ในบิล ${cartQty} ชิ้น</span>` : ''}
                    <span class="${projectedStock < 0 ? 'danger' : ''}">
                        ${addedToCart ? 'เหลือหลังบิล' : 'คงเหลือ'} ${addedToCart ? projectedStock : stock} ${product.unitLabel || 'ชิ้น'}
                    </span>
                </div>
                <div class="camera-scan-result-action">
                    <span class="material-symbols-rounded">edit</span>
                    แตะเพื่อแก้ไขสินค้า — เริ่มที่ราคาขาย
                    <span class="material-symbols-rounded">chevron_right</span>
                </div>
            </div>`;
        result.className = 'camera-scan-result visible success';
        result.setAttribute('role', 'button');
        result.setAttribute('tabindex', '0');
        result.setAttribute('aria-label', `แก้ไข ${product.name} เริ่มที่ราคาขาย`);
        result.onclick = () => App.openScannedProductEditor(product.id);
        result.onkeydown = event => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                App.openScannedProductEditor(product.id);
            }
        };
        const stage = document.querySelector('.camera-scanner-stage');
        if (stage) {
            stage.classList.remove('scan-success');
            requestAnimationFrame(() => stage.classList.add('scan-success'));
            setTimeout(() => stage.classList.remove('scan-success'), 620);
        }
        App.state.cameraScanner.resultTimer = setTimeout(() => App.hideCameraScanResult(false), 4200);
    },

    openScannedProductEditor: (productId) => {
        const product = App.state.products.find(item => String(item.id) === String(productId));
        if (!product) {
            App.alert('ไม่พบข้อมูลสินค้าที่ต้องการแก้ไข');
            return;
        }
        App.hideCameraScanResult(true);
        if (App.state.cameraScanner.active) App.closeCameraScanner();
        App.renderView('stock');
        setTimeout(() => {
            App.openProductModal(product.id);
            setTimeout(() => {
                const priceInput = document.getElementById('p-price');
                if (priceInput) {
                    priceInput.focus();
                    priceInput.select();
                    priceInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }, 160);
        }, 80);
    },

    toggleCameraTorch: async () => {
        const scanner = App.state.cameraScanner;
        const track = scanner.stream?.getVideoTracks?.()[0];
        const capabilities = track?.getCapabilities?.() || {};
        if (!track || !capabilities.torch) { App.setCameraScannerStatus('กล้องนี้ไม่รองรับไฟฉาย', 'error'); return; }
        scanner.torchOn = !scanner.torchOn;
        try { await track.applyConstraints({ advanced: [{ torch: scanner.torchOn }] }); }
        catch (_) { scanner.torchOn = false; App.setCameraScannerStatus('เปิดไฟฉายไม่ได้', 'error'); }
    },

    handleBarcodeScan: async (barcode) => {
        const match = DB.getProductByBarcode(barcode);

        // Hands-free price-check mode is intentionally isolated from sales.
        // A scanner can keep sending keyboard input while this result modal is open.
        if (DB.getSettings().scannerPriceCheckMode === true) {
            if (match) {
                App.addPriceCheckItem(match.product, match.isPack);
                App.showScannerPriceResult(match.product, barcode, { isPack: match.isPack });
                App.playScanFeedback(true);
            } else {
                App.showScannerPriceNotFound(barcode);
                App.playScanFeedback(false);
            }
            return;
        }

        if (match) {
            const product = match.product;
            const isPack = match.isPack;

            if (!App.state.cameraScanner.active) App.showProductFlash(product);

            let addedQty = 0;

            if (App.state.currentView === 'pos') {
                if (isPack) {
                    // Safe UX: Prompt before adding massive amounts
                    const packQty = product.wholesaleQty || 1;
                    if (await App.confirm(`🛒 คุณสแกนบาร์โค้ดลัง:\n\nต้องการเพิ่ม "${product.name}"\nจำนวน 1 ลัง (${packQty} ชิ้น) ลงตะกร้าใช่หรือไม่?`)) {
                        for (let i = 0; i < packQty; i++) {
                            await App.addToCart(product, true);
                        }
                        addedQty = packQty;
                    }
                } else {
                    // Normal piece scan
                    await App.addToCart(product, true); // True = fromScan
                    addedQty = 1;
                }
            }

            if (App.state.cameraScanner.active) {
                App.showCameraScanResult(product, barcode, {
                    addedQty,
                    addedToCart: App.state.currentView === 'pos' && addedQty > 0
                });
                App.setCameraScannerStatus(
                    addedQty > 0
                        ? `เพิ่ม ${product.name} ลงบิลแล้ว • ในบิล ${App.state.cart.find(item => item.id === product.id)?.qty || 0} ชิ้น`
                        : `พบ ${product.name} • ฿${Utils.formatCurrency(product.price)}`,
                    'ok'
                );
                App.playScanFeedback(true);
            }
            // In Stock/Other views: Just Flash, and scroll to item if in Stock View
            if (App.state.currentView === 'stock') {
                // Try to find the element
                let el = document.getElementById(`stock-item-${product.id}`);

                // If not found, it might be filtered out - reset view
                if (!el) {
                    App.state.searchQuery = '';
                    App.state.stockTab = 'all';
                    App.renderView('stock');
                    // Wait for render
                    setTimeout(() => {
                        el = document.getElementById(`stock-item-${product.id}`);
                        if (el) {
                            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            el.classList.add('row-highlight-flash');
                            setTimeout(() => el.classList.remove('row-highlight-flash'), 2000);
                        }
                    }, 100);
                } else {
                    // Found immediately
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    el.classList.add('row-highlight-flash');
                    setTimeout(() => el.classList.remove('row-highlight-flash'), 2000);
                }
            }
        } else {
            App.setCameraScannerStatus(`ไม่พบสินค้า: ${barcode}`, 'error');
            App.playScanFeedback(false);
            // The camera overlay sits above regular dialogs. Stop and close it
            // first so the quick-sale/add-product choices are immediately visible.
            if (App.state.cameraScanner.active) App.closeCameraScanner();
            const notFoundHtml = `
                <div id="not-found-overlay" style="position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:2000; display:flex; align-items:center; justify-content:center;">
                    <div style="background:white; padding:20px; border-radius:10px; width:90%; max-width:400px; text-align:center; box-shadow:0 4px 20px rgba(0,0,0,0.3);">
                        <div style="font-size:48px; margin-bottom:10px;">⚠️</div>
                        <h3 style="margin-bottom:10px;">ไม่พบสินค้า ${barcode}</h3>
                        <p style="margin-bottom:15px; font-size:14px; color:#555;">ยังไม่มีสินค้านี้ในระบบ คุณต้องการทำอะไร?</p>
                        
                        <div style="background:#fff3cd; padding:15px; border-radius:8px; margin-bottom:15px; text-align:left; border:1px solid #ffeeba;">
                            <label style="font-size:14px; font-weight:bold; color:#856404; display:block; margin-bottom:5px;">⚡ ขายด่วน (ระบุราคาขาย)</label>
                            <div style="display:flex; gap:10px;">
                                <input type="number" id="quick-sell-price" placeholder="ราคา (บาท)" style="flex:1; padding:8px; border:1px solid #ddd; border-radius:4px; font-size:16px;">
                                <button class="primary-btn" onclick="App.doQuickSell('${barcode}')">ขายด่วนเลย</button>
                            </div>
                        </div>

                        <div style="display:flex; flex-direction:column; gap:8px;">
                            <button class="primary-btn" data-barcode="${Utils.escapeHTML(barcode)}" onclick="App.openQuickStockAdd(this.dataset.barcode)">
                                📦 เพิ่มสินค้าเข้าสต็อกแบบรวดเร็ว
                            </button>
                            <button class="secondary-btn" onclick="App.goToAddProduct('${barcode}')">
                                ➕ ไปหน้าเพิ่มสินค้าแบบละเอียด
                            </button>
                            <button class="secondary-btn" style="background:#fff; border:1px solid #ddd;" onclick="document.getElementById('not-found-overlay').remove()">
                                ❌ ยกเลิก
                            </button>
                        </div>
                    </div>
                </div>
            `;
            document.body.insertAdjacentHTML('beforeend', notFoundHtml);

            setTimeout(() => {
                const input = document.getElementById('quick-sell-price');
                if (input) {
                    input.focus();
                    input.onkeydown = (e) => {
                        if (e.key === 'Enter') App.doQuickSell(barcode);
                    };
                }
            }, 100);
        }
    },

    doQuickSell: (barcode) => {
        const input = document.getElementById('quick-sell-price');
        const price = parseFloat(input.value);
        if (isNaN(price) || price <= 0) {
            App.alert('กรุณาระบุราคาขายที่ถูกต้อง');
            return;
        }

        const newQuickProduct = {
            id: barcode, // Important: use the barcode as ID so editing it later works easily
            barcode: barcode,
            name: `(ขายด่วน) ${barcode}`,
            price: price,
            cost: 0,
            stock: 0,
            isQuick: true,
            hasBarcode: true,
            internalCode: null,
            entryDate: new Date().toISOString().split('T')[0],
            updatedAt: Date.now()
        };

        DB.saveProduct(newQuickProduct);
        App.state.products = DB.getProducts(); // Refresh state

        // Add to cart
        const addedProduct = App.state.products.find(p => p.id === barcode);
        App.addToCart(addedProduct, true);

        document.getElementById('not-found-overlay').remove();
    },

    goToAddProduct: (barcode) => {
        document.getElementById('not-found-overlay').remove();
        App.renderView('stock');
        setTimeout(() => {
            App.openProductModal();
            setTimeout(() => document.getElementById('p-barcode').value = barcode, 200);
        }, 100);
    },

    openQuickStockAdd: (barcode) => {
        document.getElementById('not-found-overlay')?.remove();
        const groups = [...new Set(App.state.products.map(product => product.group).filter(Boolean))];
        const html = `
            <div id="quick-stock-overlay" style="position:fixed; inset:0; background:rgba(0,0,0,.6); z-index:31000; display:flex; align-items:center; justify-content:center; padding:12px;">
                <div style="background:white; width:100%; max-width:520px; max-height:94dvh; overflow:auto; padding:20px; border-radius:14px; box-shadow:0 8px 30px rgba(0,0,0,.3);">
                    <h2 style="margin:0 0 15px;">📦 เพิ่มสินค้าเข้าสต็อกแบบรวดเร็ว</h2>
                    <form id="quick-stock-form" style="display:flex; flex-direction:column; gap:12px;">
                        <label>บาร์โค้ด
                            <input id="qs-barcode" value="${Utils.escapeHTML(barcode)}" readonly style="width:100%; background:#f5f5f5;">
                        </label>
                        <label>หมวดหมู่ (ไม่บังคับ)
                            <input id="qs-group" list="qs-group-list" placeholder="เช่น เครื่องดื่ม" style="width:100%;">
                            <datalist id="qs-group-list">${groups.map(group => `<option value="${Utils.escapeHTML(group)}">`).join('')}</datalist>
                            <div id="qs-group-suggestions" class="category-suggestions"></div>
                        </label>
                        <label>ชื่อสินค้า
                            <input id="qs-name" required placeholder="ชื่อสินค้าและขนาด" style="width:100%;">
                        </label>
                        <label>ราคาขาย (บาท)
                            <input id="qs-price" type="number" min="0" step="0.5" required style="width:100%;">
                        </label>
                        <div style="background:#f4f8f4; border:1px solid #c8dfc9; border-radius:10px; padding:12px;">
                            <div style="font-weight:bold; margin-bottom:10px;">จำนวนเริ่มต้น (ไม่บังคับ)</div>
                            <div style="display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px;">
                                <label>หน่วยย่อย
                                    <select id="qs-unit-label" onchange="App.updateQuickStockPreview()" style="width:100%;">
                                        <option value="ชิ้น">ชิ้น</option>
                                        <option value="ขวด">ขวด</option>
                                    </select>
                                </label>
                                <label>1 กล่องมีกี่ชิ้น/ขวด
                                    <input id="qs-units-per-box" type="number" min="1" placeholder="เช่น 12" oninput="App.updateQuickStockPreview()" style="width:100%;">
                                </label>
                                <label>จำนวนกล่อง
                                    <input id="qs-boxes" type="number" min="0" placeholder="0" oninput="App.updateQuickStockPreview()" style="width:100%;">
                                </label>
                                <label>ชิ้น/ขวดแยก
                                    <input id="qs-loose-units" type="number" min="0" placeholder="0" oninput="App.updateQuickStockPreview()" style="width:100%;">
                                </label>
                            </div>
                            <div id="qs-stock-preview" style="margin-top:10px; padding:10px; background:white; border-radius:8px; text-align:center; font-weight:bold; color:var(--primary-color);">รวม 0 ชิ้น</div>
                        </div>
                        <label>รูปสินค้า (ไม่บังคับ)
                            <input id="qs-image" type="file" accept="image/*" style="width:100%;">
                        </label>
                        <div style="display:flex; gap:10px;">
                            <button type="button" class="secondary-btn" style="flex:1;" onclick="document.getElementById('quick-stock-overlay').remove()">ยกเลิก</button>
                            <button type="submit" class="primary-btn" style="flex:2;">บันทึกเข้าสต็อก</button>
                        </div>
                    </form>
                </div>
            </div>`;
        document.body.insertAdjacentHTML('beforeend', html);
        document.getElementById('quick-stock-form').addEventListener('submit', App.saveQuickStockProduct);
        App.setupCategorySuggestions('qs-group', 'qs-group-suggestions');
        document.getElementById('qs-name').focus();
        App.updateQuickStockPreview();
    },

    setupCategorySuggestions: (inputId, containerId) => {
        const input = document.getElementById(inputId);
        const container = document.getElementById(containerId);
        if (!input || !container) return;

        const render = () => {
            const query = input.value.trim().toLocaleLowerCase('th-TH');
            const groups = [...new Set(App.state.products
                .map(product => (product.group || '').trim())
                .filter(Boolean))];

            const matches = groups
                .map(group => {
                    const normalized = group.toLocaleLowerCase('th-TH');
                    let score = 3;
                    if (!query) score = 2;
                    else if (normalized === query) score = 0;
                    else if (normalized.startsWith(query)) score = 1;
                    else if (normalized.includes(query) || query.includes(normalized)) score = 2;
                    return { group, score };
                })
                .filter(item => !query || item.score < 3)
                .sort((a, b) => a.score - b.score || a.group.localeCompare(b.group, 'th'))
                .slice(0, 6);

            container.innerHTML = matches.map(item => `
                <button type="button" class="category-suggestion-chip"
                    data-group="${Utils.escapeHTML(item.group)}"
                    onclick="App.selectCategorySuggestion('${inputId}', this.dataset.group, '${containerId}')">
                    ${Utils.escapeHTML(item.group)}
                </button>
            `).join('');
            container.classList.toggle('visible', matches.length > 0);
        };

        input.addEventListener('input', render);
        input.addEventListener('focus', render);
    },

    selectCategorySuggestion: (inputId, group, containerId) => {
        const input = document.getElementById(inputId);
        if (input) input.value = group;
        document.getElementById(containerId)?.classList.remove('visible');
    },

    getQuickStockQuantity: () => {
        const unitsPerBox = Math.max(0, parseInt(document.getElementById('qs-units-per-box')?.value) || 0);
        const boxes = Math.max(0, parseInt(document.getElementById('qs-boxes')?.value) || 0);
        const looseUnits = Math.max(0, parseInt(document.getElementById('qs-loose-units')?.value) || 0);
        return { unitsPerBox, boxes, looseUnits, total: (boxes * unitsPerBox) + looseUnits };
    },

    updateQuickStockPreview: () => {
        const quantity = App.getQuickStockQuantity();
        const unitLabel = document.getElementById('qs-unit-label')?.value || 'ชิ้น';
        const preview = document.getElementById('qs-stock-preview');
        if (!preview) return;
        preview.textContent = quantity.unitsPerBox > 0
            ? `${quantity.boxes} กล่อง ${quantity.looseUnits} ${unitLabel} = รวม ${quantity.total} ${unitLabel}`
            : `รวม ${quantity.looseUnits} ${unitLabel}`;
    },

    saveQuickStockProduct: async (event) => {
        event.preventDefault();
        const barcode = document.getElementById('qs-barcode').value.trim();
        const name = document.getElementById('qs-name').value.trim();
        const price = Number(document.getElementById('qs-price').value);
        if (!barcode || !name || !Number.isFinite(price) || price <= 0) {
            await App.alert('กรุณาระบุชื่อสินค้าและราคาขายให้ถูกต้อง');
            return;
        }
        if (DB.getProductByBarcode(barcode)) {
            await App.alert('บาร์โค้ดนี้มีสินค้าอยู่แล้ว');
            return;
        }

        const quantity = App.getQuickStockQuantity();
        if (quantity.boxes > 0 && quantity.unitsPerBox < 1) {
            await App.alert('กรุณาระบุว่า 1 กล่องมีกี่ชิ้นหรือกี่ขวด');
            return;
        }
        const unitLabel = document.getElementById('qs-unit-label').value || 'ชิ้น';
        let image = null;
        const imageFile = document.getElementById('qs-image').files[0];
        if (imageFile) {
            const rawImage = await Utils.fileToBase64(imageFile);
            image = await Utils.compressImage(rawImage, 200, 0.5);
        }

        const product = {
            id: barcode,
            barcode,
            group: document.getElementById('qs-group').value.trim(),
            name,
            price,
            stock: quantity.total,
            unitsPerBox: quantity.unitsPerBox > 1 ? quantity.unitsPerBox : 0,
            unitLabel,
            image,
            cost: 0,
            entryDate: new Date().toISOString().split('T')[0],
            updatedAt: Date.now()
        };
        await DB.saveProduct(product);
        App.state.products = DB.getProducts();
        document.getElementById('quick-stock-overlay')?.remove();
        App.state.stockTab = 'all';
        App.state.searchQuery = barcode;
        App.renderView('stock');
        await App.alert(`บันทึกสินค้าเรียบร้อย\n${App.formatStockBreakdown(product)}`);
    },

    // --- Manual Entry ---
    showManualEntryModal: () => {
        // Close any other open modals just in case
        App.closeModals();

        const manualHtml = `
            <div id="manual-entry-overlay" style="position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:2000; display:flex; align-items:center; justify-content:center;">
                <div style="background:white; padding:20px; border-radius:10px; width:90%; max-width:400px; box-shadow:0 4px 20px rgba(0,0,0,0.3);">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px; border-bottom:1px solid #eee; padding-bottom:10px;">
                        <h3 style="margin:0; display:flex; align-items:center; gap:5px;"><span class="material-symbols-rounded">edit_square</span> พิมพ์รายการขายเอง</h3>
                        <button class="icon-btn" onclick="document.getElementById('manual-entry-overlay').remove()">
                            <span class="material-symbols-rounded">close</span>
                        </button>
                    </div>
                    
                    <div style="margin-bottom:15px;">
                        <label style="display:block; margin-bottom:5px; font-weight:bold; color:#555;">ชื่อรายการ / สินค้า</label>
                        <input type="text" id="manual-name" placeholder="เช่น ค่าจัดส่ง, สินค้านอกระบบ" style="width:100%; padding:10px; border:1px solid #ddd; border-radius:4px; font-size:16px;">
                    </div>
                    
                    <div style="display:flex; gap:10px; margin-bottom:20px;">
                        <div style="flex:1;">
                            <label style="display:block; margin-bottom:5px; font-weight:bold; color:#555;">ราคา (บาท)</label>
                            <input type="number" id="manual-price" placeholder="0" style="width:100%; padding:10px; border:1px solid #ddd; border-radius:4px; font-size:16px;">
                        </div>
                        <div style="width:100px;">
                            <label style="display:block; margin-bottom:5px; font-weight:bold; color:#555;">จำนวน</label>
                            <input type="number" id="manual-qty" value="1" min="1" style="width:100%; padding:10px; border:1px solid #ddd; border-radius:4px; font-size:16px; text-align:center;">
                        </div>
                    </div>

                    <button class="primary-btn" style="width:100%; padding:12px; font-size:16px;" onclick="App.doManualEntry()">+ เพิ่มลงตะกร้า</button>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', manualHtml);

        setTimeout(() => {
            document.getElementById('manual-name').focus();

            // Allow pressing Enter to submit
            const submitOnEnter = (e) => {
                if (e.key === 'Enter') App.doManualEntry();
            };
            document.getElementById('manual-name').addEventListener('keydown', submitOnEnter);
            document.getElementById('manual-price').addEventListener('keydown', submitOnEnter);
            document.getElementById('manual-qty').addEventListener('keydown', submitOnEnter);
        }, 100);
    },

    doManualEntry: () => {
        const nameInput = document.getElementById('manual-name').value.trim();
        const priceInput = parseFloat(document.getElementById('manual-price').value);
        let qtyInput = parseInt(document.getElementById('manual-qty').value);

        if (!nameInput) {
            App.alert('กรุณาระบุชื่อรายการ');
            return;
        }
        if (isNaN(priceInput) || priceInput <= 0) {
            App.alert('กรุณาระบุราคาที่ถูกต้อง');
            return;
        }
        if (isNaN(qtyInput) || qtyInput <= 0) qtyInput = 1;

        // Generate a random temporary ID for it
        const randomId = 'M' + String(Date.now()).slice(-8);

        const newManualProduct = {
            id: randomId,
            barcode: randomId,
            name: nameInput,
            price: priceInput,
            cost: 0,
            stock: 0,
            isQuick: true, // Flag as temporary/quick
            hasBarcode: false,
            internalCode: randomId,
            entryDate: new Date().toISOString().split('T')[0],
            updatedAt: Date.now()
        };

        // Save it temporarily so it works with cart validations, 
        // AND so the user has a record if they want to merge it later
        DB.saveProduct(newManualProduct);
        App.state.products = DB.getProducts();

        // Add to cart directly and loop for qty
        const addedProduct = App.state.products.find(p => p.id === randomId);

        if (addedProduct) {
            for (let i = 0; i < qtyInput; i++) {
                App.addToCart(addedProduct, true);
            }
        }

        document.getElementById('manual-entry-overlay').remove();
    },

    // --- Product Flash Popup (Helper) ---
    showProductFlash: (product) => {
        // Remove existing flash if any
        const existing = document.getElementById('product-flash-popup');
        if (existing) existing.remove();

        const popup = document.createElement('div');
        popup.id = 'product-flash-popup';
        popup.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0, 0, 0, 0.85);
            color: white;
            padding: 30px;
            border-radius: 15px;
            z-index: 9999;
            text-align: center;
            min-width: 300px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.5);
            animation: fadeInOut 1.5s ease-in-out forwards;
            pointer-events: none; /* Let clicks pass through */
        `;

        popup.innerHTML = `
            <div style="font-size: 24px; font-weight: bold; margin-bottom: 10px; color: #fff;">${Utils.escapeHTML(product.name)}</div>
            <div style="font-size: 48px; font-weight: bold; color: #4caf50; margin-bottom: 10px;">
                ฿${Utils.formatCurrency(product.price)}
            </div>
            ${product.location ? `
                <div style="font-size: 20px; color: #ffeb3b; background: rgba(255,255,255,0.1); padding: 5px 15px; border-radius: 20px; display: inline-block;">
                    📍 ${Utils.escapeHTML(product.location)}
                </div>
            ` : '<div style="font-size: 16px; color: #ccc;">(ไม่ระบุจุดวาง)</div>'}
        `;

        document.body.appendChild(popup);

        // Auto remove after animation (1s delay + fade out)
        setTimeout(() => {
            if (popup.parentNode) popup.parentNode.removeChild(popup);
        }, 1200);
    },

    // --- Cart & Wholesale Logic Helpers ---
    calcItemTotal: (item) => {
        if (item.wholesaleQty > 0 && item.wholesalePrice > 0) {
            const packs = Math.floor(item.qty / item.wholesaleQty);
            const remainder = item.qty % item.wholesaleQty;
            return (packs * item.wholesalePrice) + (remainder * item.price);
        }
        return item.price * item.qty;
    },

    getLineTotal: (item) => {
        return item.finalLineTotal !== undefined ? item.finalLineTotal : (item.price * item.qty);
    },

    checkWholesalePrompt: async (item) => {
        if (item.wholesaleQty > 0 && (!item.wholesalePrice || item.wholesalePrice <= 0)) {
            if (item.qty >= item.wholesaleQty) {
                if (item._askedWholesale) return;
                item._askedWholesale = true;

                const priceStr = await App.prompt(`สินค้า "${item.name}" ซื้อถึง ${item.wholesaleQty} ชิ้น (ราคาส่ง)\nกรุณาระบุราคาขายส่งต่อแพ็ค/ลัง (ถ้าไม่มีให้ปล่อยว่างหรือใส่ 0):`);
                if (priceStr) {
                    const price = parseFloat(priceStr);
                    if (price > 0) {
                        item.wholesalePrice = price;
                        const products = DB.getProducts();
                        const pIndex = products.findIndex(p => p.id === item.id);
                        if (pIndex >= 0) {
                            products[pIndex].wholesalePrice = price;
                            DB.saveProducts(products);
                            App.state.products = DB.getProducts();
                        }
                    }
                }
            }
        }
    },

    // --- Cart Logic ---
    addToCart: async (product, fromScan = false) => {
        // Removed strict stock blocks to allow Quick Sales (Native negative stock handling)
        const existingIndex = App.state.cart.findIndex(item => item.id === product.id);
        if (existingIndex > -1) {
            const existing = App.state.cart[existingIndex];
            existing.qty++;
            await App.checkWholesalePrompt(existing);
        } else {
            const newItem = { ...product, qty: 1 };
            if (App.state.isTCTMode && product.thaiChuaiThaiPrice > 0) {
                newItem.price = product.thaiChuaiThaiPrice;
                newItem.wholesalePrice = 0;
            }
            App.state.cart.push(newItem);
            await App.checkWholesalePrompt(newItem);
        }
        App.renderCart();

        // Auto-Popup Logic (Mobile Only)
        // If fromScan is TRUE and cart is currently CLOSED -> Open for 2 seconds
        const cartPanel = document.getElementById('right-panel');
        const isMobile = window.innerWidth <= 1024;
        const isClosed = !cartPanel.classList.contains('open');

        if (isMobile && fromScan && isClosed) {
            // The scanner has its own compact result card. Opening the full cart
            // behind it adds motion without giving the cashier useful feedback.
            if (!App.state.cameraScanner.active) App.toggleMobileCart(true, 2000);
        }
        return App.state.cart.find(item => item.id === product.id);
    },

    actionParkCart: async () => {
        try {
            if (App.state.cart.length === 0) {
                await App.alert('กรุณาเลือกสินค้าลงตะกร้าก่อนพักบิล');
                return;
            }

            let note = '';
            let timestamp = null;

            // Smart Re-park Check
            if (App.state.activeBill) {
                // Feature: Auto-save back to current table without prompting
                note = App.state.activeBill.note || '';
                timestamp = App.state.activeBill.timestamp;
            } else {
                const result = await App.prompt('ตั้งชื่อบิลพักนี้ (เช่น โต๊ะ 5, คุณสมชาย):', '');
                if (result === null) return; // User cancelled
                note = result.trim();
            }
            DB.parkCart(App.state.cart, note, timestamp, App.state.activeBill ? App.state.activeBill.id : null);

            // Clear Active State
            App.state.activeBill = null;
            App.state.cart = [];

            App.renderCart();
            App.updateParkedBadge();
            App.closeModals(); // Close any open modals
            if (App.toggleMobileCart) App.toggleMobileCart(false); // Close mobile cart drawer
            await App.alert(`พักบิลเรียบร้อย ${note ? '(' + note + ')' : ''}`);
        } catch (err) {
            await App.alert('เกิดข้อผิดพลาดในการพักบิล: ' + err.message);
            console.error(err);
        }
    },

    renderCart: () => {
        App.elements.cartItemsContainer.innerHTML = App.state.cart.map((item, index) => {
            const product = App.state.products.find(p => p.id === item.id) || item;
            const stockWarning = product.stock <= 10 ? `<div style="font-size:11px; color:#e65100; margin-top:2px; font-weight:normal;">⚠️ เหลือสต็อก ${product.stock} ชิ้น</div>` : '';
            return `
            <div class="cart-item" draggable="true" ondragstart="App.cartDragStart(event, ${index})" ondragover="App.cartDragOver(event)" ondrop="App.cartDrop(event, ${index})" ondragend="App.cartDragEnd(event)" style="flex-direction: column; align-items: stretch; gap: 8px;">
                <!-- Row 1: Drag, Name, Delete -->
                <div style="display:flex; align-items:flex-start; justify-content:space-between; width:100%;">
                    <div style="display:flex; align-items:flex-start; flex:1;">
                        <div style="cursor:grab; margin-right:5px; color:#ccc; display:flex; align-items:center; transform: translateY(2px);">
                            <span class="material-symbols-rounded" style="font-size:20px;">drag_indicator</span>
                        </div>
                        <div style="flex:1;">
                            <div style="font-weight:bold; display:flex; align-items:center; gap:5px; line-height:1.3; font-size:15px;">
                                ${Utils.escapeHTML(item.name)}
                                ${product.isQuick || item.id.startsWith('M') ? `<span class="material-symbols-rounded" style="font-size:16px; color:var(--primary-color); cursor:pointer;" onclick="App.editCartItemName(${index})" title="แก้ไขชื่อ">edit</span>` : ''}
                            </div>
                            ${stockWarning}
                        </div>
                    </div>
                    
                    <button class="icon-btn dangerous" onclick="App.removeCartItem(${index})" title="ลบรายการนี้" style="padding:4px; margin-left:5px; height:32px; width:32px; display:flex; align-items:center; justify-content:center;">
                        <span class="material-symbols-rounded" style="font-size:20px;">delete</span>
                    </button>
                </div>

                <!-- Row 2: Price, Qty, Total -->
                <div style="display:flex; align-items:center; justify-content:space-between; width:100%; padding-left:25px;">
                    <!-- Unit Price -->
                    <div style="font-size:13px; color:#666; line-height:1.2;">
                        @${Utils.formatCurrency(item.price)}
                        ${item.wholesaleQty > 0 && item.wholesalePrice > 0 ? `<div style="font-size:11px;color:var(--primary-color);">(${item.wholesaleQty}ชิ้น=${item.wholesalePrice}฿)</div>` : ''}
                    </div>

                    <!-- Qty Controls -->
                    <div style="display:flex; align-items:center; background:#f0f0f0; border-radius:20px; padding:2px;">
                        <button class="icon-btn small" onclick="App.updateCartQty(${index}, -1)" style="width:28px; height:28px;">-</button>
                        <div onclick="App.promptQtyChange(${index})" style="width:55px; text-align:center; border:1px solid #ddd; border-radius:4px; font-weight:bold; height:28px; background:white; margin:0 2px; font-size:14px; display:flex; align-items:center; justify-content:center; cursor:pointer; user-select:none; color:var(--primary-color);" title="กดเพื่อระบุจำนวนที่เพิ่ม">${item.qty} ชิ้น</div>
                        <button class="icon-btn small" onclick="App.updateCartQty(${index}, 1)" style="width:28px; height:28px;">+</button>
                    </div>

                    <!-- Line Total -->
                    <div style="font-weight:bold; font-size:16px; color:var(--primary-color); text-align:right; min-width:60px;">
                        ฿${Utils.formatCurrency(App.calcItemTotal(item))}
                    </div>
                </div>
            </div>
        `}).join('');

        const total = App.state.cart.reduce((sum, item) => sum + App.calcItemTotal(item), 0);
        App.elements.cartTotal.textContent = Utils.formatCurrency(total);
        App.updateMobileCartBadge();

        // Update Smart Table/Parked Bill UI
        const headerTitle = document.getElementById('cart-header-title');
        const parkBtn = document.getElementById('btn-park-cart');

        if (App.state.activeBill && App.state.activeBill.note) {
            if (headerTitle) headerTitle.innerHTML = `ตะกร้าสินค้า: <span style="color:var(--primary-color);">📝 ${App.state.activeBill.note}</span>`;
            if (parkBtn) parkBtn.textContent = `บันทึก (${App.state.activeBill.note})`;
        } else {
            if (headerTitle) headerTitle.textContent = 'ตะกร้าสินค้า';
            if (parkBtn) parkBtn.textContent = 'พักบิล';
        }

        // Auto-save current cart state
        DB.saveAutoCart({
            cart: App.state.cart,
            activeBill: App.state.activeBill,
            editingBillId: App.state.editingBillId,
            editingSaleDate: App.state.editingSaleDate
        });
    },

    removeCartItem: async (index) => {
        const item = App.state.cart[index];
        // Confirmation for accidental clicks is good UX
        let msg = `ต้องการลบรายการ "${item.name}" ออกจากตะกร้า?`;
        if (item.originalQty) {
            msg = `⚠️ รายการ "${item.name}" มีอยู่ในออเดอร์เดิม (${item.originalQty} ชิ้น)\nยืนยันลบทิ้งใช่หรือไม่?`;
        }
        
        if (await App.confirm(msg, item.originalQty ? 'ยืนยันลบรายการ' : undefined)) {
            App.state.cart.splice(index, 1);

            // If the cart is now empty, reset the smart parked bill tracker
            if (App.state.cart.length === 0) App.state.activeBill = null;

            App.renderCart();
        }
    },

    editCartItemName: async (index) => {
        const item = App.state.cart[index];
        const newName = await App.prompt('ระบุชื่อรายการใหม่:', item.name);
        if (newName && newName.trim() !== '') {
            item.name = newName.trim();
            // Also update the temporary product definition in the DB so receipt gets the new name
            const products = DB.getProducts();
            const pIndex = products.findIndex(p => p.id === item.id);
            if (pIndex >= 0 && (products[pIndex].isQuick || products[pIndex].id.startsWith('M'))) {
                products[pIndex].name = item.name;
                DB.saveProducts(products);
                App.state.products = DB.getProducts();
            }
            App.renderCart();
        }
    },

    // --- Drag and Drop Cart Reordering ---
    cartDragStart: (e, index) => {
        App.state.draggedCartIndex = index;
        e.target.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        // Required for Firefox
        e.dataTransfer.setData('text/plain', index);
    },

    cartDragOver: (e) => {
        e.preventDefault(); // Necessary to allow dropping
        e.dataTransfer.dropEffect = 'move';

        // Find the closest cart-item
        const item = e.target.closest('.cart-item');
        if (item) {
            item.classList.add('drag-over');
        }
    },

    cartDrop: (e, dropIndex) => {
        e.preventDefault();
        const dragIndex = App.state.draggedCartIndex;

        if (dragIndex !== undefined && dragIndex !== dropIndex) {
            // Reorder array
            const draggedItem = App.state.cart[dragIndex];
            App.state.cart.splice(dragIndex, 1);
            App.state.cart.splice(dropIndex, 0, draggedItem);

            App.renderCart();
        }

        // Cleanup visuals
        document.querySelectorAll('.cart-item').forEach(el => el.classList.remove('drag-over', 'dragging'));
        App.state.draggedCartIndex = null;
    },

    cartDragEnd: (e) => {
        document.querySelectorAll('.cart-item').forEach(el => el.classList.remove('drag-over', 'dragging'));
        App.state.draggedCartIndex = null;
    },

    promptQtyChange: async (index) => {
        const item = App.state.cart[index];
        const addStr = await App.prompt(`ระบุการเปลี่ยนแปลงสำหรับ "${item.name}"\n(เช่น ใส่ 5 เพื่อเพิ่ม 5 ชิ้น หรือ -2 เพื่อลด 2 ชิ้น):`, '');
        if (addStr === null || addStr.trim() === '') return;
        
        let change = parseInt(addStr);
        if (isNaN(change) || change === 0) return;
        
        const newQty = item.qty + change;
        
        if (newQty <= 0) {
            if (await App.confirm(`ต้องการลบ "${item.name}" ออกจากตะกร้าหรือไม่?`)) {
                App.state.cart.splice(index, 1);
                App.renderCart();
            }
        } else {
            if (item.originalQty && newQty < item.originalQty) {
                if (!await App.confirm(`⚠️ สินค้าน้อยกว่าออเดอร์เดิม (${item.originalQty} ชิ้น)\nยืนยันลดจำนวน "${item.name}" เหลือ ${newQty} ใช่หรือไม่?`, 'ยืนยันลดจำนวน')) {
                    return;
                }
            }
            
            item.qty = newQty;
            await App.checkWholesalePrompt(item);
            App.renderCart();
            
            if (change > 0 && typeof App.alert === 'function') {
                App.alert(`เพิ่ม "${item.name}" ไป ${change} ชิ้น\n➤ รวมเป็น ${newQty} ชิ้น`);
            }
        }
    },

    updateCartQty: async (index, change) => {
        const item = App.state.cart[index];
        const newQty = item.qty + change;
        
        if (newQty <= 0) {
            if (await App.confirm(`ต้องการลบ "${item.name}" ออกจากตะกร้าหรือไม่?`)) {
                App.state.cart.splice(index, 1);
                App.renderCart();
            }
        } else {
            // Warn if reducing below original ordered amount from table
            if (item.originalQty && newQty < item.originalQty) {
                if (!await App.confirm(`⚠️ สินค้าน้อยกว่าออเดอร์เดิม (${item.originalQty} ชิ้น)\nยืนยันลดจำนวน "${item.name}" เหลือ ${newQty} ใช่หรือไม่?`, 'ยืนยันลดจำนวน')) {
                    return;
                }
            }
            
            item.qty = newQty;
            await App.checkWholesalePrompt(item);
            App.renderCart();
        }
    },

    completeSale: async (isTest = false) => {
        if (App.state.isProcessingPayment) return; // Prevent double clicks
        App.state.isProcessingPayment = true;

        const total = App.state.cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
        const receivedInput = document.getElementById('pay-received');
        const received = isTest ? total : parseFloat(receivedInput.value);
        // ... (rest of logic) ...

        // On Error or Success, reset flag
        // But success reloads view, so just handle error cases if any? 
        // Actually success calls renderProductGrid which doesn't reset flag.
        // Let's reset it at the end of success path.
    },

    updateMobileCartBadge: () => {
        const count = App.state.cart.reduce((sum, item) => sum + item.qty, 0);
        const total = App.state.cart.reduce((sum, item) => sum + App.calcItemTotal(item), 0);
        const badge = document.getElementById('mobile-cart-count');
        const badgeTotal = document.getElementById('mobile-cart-total');
        if (badge) badge.textContent = count;
        if (badgeTotal) {
            badgeTotal.textContent = `฿${Utils.formatCurrency(total)}`;
            if (count > 0) {
                badgeTotal.style.display = 'inline';
                document.getElementById('btn-mobile-cart').style.borderRadius = '30px';
                document.getElementById('btn-mobile-cart').style.padding = '0 18px';
            } else {
                badgeTotal.style.display = 'none';
                document.getElementById('btn-mobile-cart').style.borderRadius = '50%';
                document.getElementById('btn-mobile-cart').style.padding = '0';
            }
        }
    },

    setupCartActions: () => {
        document.getElementById('btn-clear-cart').addEventListener('click', async () => {
            if (App.state.activeBill?.id) {
                const confirmed = await App.confirm(
                    `ตะกร้านี้ผูกกับบิล "${App.state.activeBill.note || App.state.activeBill.id}"\n\nต้องการยกเลิกและล้างบิลนี้ออกจากโต๊ะ/รายการส่งทั้งหมดหรือไม่?`,
                    'ยกเลิกบิลที่เปิดอยู่'
                );
                if (!confirmed) return;
                App.closeBillSession(App.state.activeBill.id, 'cancelled');
            } else if (await App.confirm('ต้องการล้างตะกร้าสินค้าทั้งหมด?', 'ล้างตะกร้า')) {
                App.state.cart = [];
                DB.clearAutoCart();
                App.renderCart();
            }
        });
        document.getElementById('btn-park-cart').addEventListener('click', App.actionParkCart);
        document.getElementById('btn-parked-carts').addEventListener('click', App.showParkedCartsModal);
        document.getElementById('btn-checkout').addEventListener('click', () => {
            if (App.state.cart.length === 0) return;
            App.showPaymentModal();
        });
        
        const btnTctPrice = document.getElementById('btn-tct-price');
        if (btnTctPrice) {
            btnTctPrice.addEventListener('click', App.applyTCTPrice);
        }

        const quickBtn = document.getElementById('btn-quick-print');
        if (quickBtn) {
            quickBtn.addEventListener('click', App.quickCheckoutAndPrint);
        }

        // --- Mobile Cart Toggle ---
        // --- Mobile Cart Toggle ---
        const mobileCartBtn = document.getElementById('btn-mobile-cart');
        const mobileOverlay = document.getElementById('mobile-cart-overlay');

        if (mobileCartBtn) {
            mobileCartBtn.addEventListener('click', () => {
                // Manual open: 5 minutes timeout
                App.toggleMobileCart(true, 300000);
            });
        }

        if (mobileOverlay) {
            mobileOverlay.addEventListener('click', () => {
                App.toggleMobileCart(false);
            });
        }
    },

    closeBillSession: (billId, fulfillmentStatus = 'cancelled') => {
        if (!billId) return;
        if (fulfillmentStatus === 'completed') DB.finalizeParkedCart(billId);
        else DB.removeParkedCart(billId, { fulfillmentStatus: 'cancelled', moveToTrash: true });

        const tables = DB.getTables();
        let changed = false;
        tables.forEach(table => {
            if (String(table.billId) === String(billId)) {
                table.billId = null;
                changed = true;
            }
        });
        if (changed) DB.saveTables(tables);

        if (App.state.activeBill && String(App.state.activeBill.id) === String(billId)) {
            App.state.cart = [];
            App.state.activeBill = null;
        }
        DB.clearAutoCart();
        App.updateParkedBadge();
        App.renderCart();
    },

    applyTCTPrice: async () => {
        if (App.state.cart.length === 0) return;
        
        // Initialize state if not present
        if (App.state.isTCTMode === undefined) App.state.isTCTMode = false;
        
        App.state.isTCTMode = !App.state.isTCTMode; // Toggle mode
        
        let applied = false;
        App.state.cart.forEach(item => {
            const product = App.state.products.find(p => p.id === item.id);
            if (product) {
                if (App.state.isTCTMode && product.thaiChuaiThaiPrice > 0) {
                    item.price = product.thaiChuaiThaiPrice;
                    item.wholesalePrice = 0; // Disable wholesale pricing if TCT applies
                    applied = true;
                } else if (!App.state.isTCTMode) {
                    // Restore original prices
                    item.price = product.price;
                    item.wholesalePrice = product.wholesalePrice || 0;
                    applied = true; // Always true when reverting
                }
            }
        });
        
        const btnTctPrice = document.getElementById('btn-tct-price');
        if (btnTctPrice) {
            if (App.state.isTCTMode) {
                btnTctPrice.style.background = '#e8f0fe';
            } else {
                btnTctPrice.style.background = '';
            }
        }
        
        if (applied || !App.state.isTCTMode) {
            App.renderCart();
            if (App.state.isTCTMode) {
                await App.alert('เปิดใช้งานราคา "ไทยช่วยไทย (เป๋าตัง)" แล้ว');
            } else {
                await App.alert('กลับสู่ราคาปกติเรียบร้อยแล้ว');
            }
        } else {
            // Revert the toggle if no product has TCT price
            App.state.isTCTMode = false;
            await App.alert('ไม่มีสินค้าในตะกร้าที่ตั้งราคา "ไทยช่วยไทย" ไว้');
        }
    },

    quickCheckoutAndPrint: async () => {
        if (App.state.cart.length === 0) return;

        if (await App.confirm('ต้องการปิดบิล (รับเงินพอดี) และพิมพ์ใบเสร็จทันทีหรือไม่?')) {
            if (App.state.isProcessingPayment) return;
            App.state.isProcessingPayment = true;

            const total = App.state.cart.reduce((sum, item) => sum + App.calcItemTotal(item), 0);

            // Persist stock and sale before clearing the cart.
            const saleData = {
                billId: App.state.editingBillId || App.state.activeBill?.id || null,
                date: App.state.editingSaleDate || new Date(),
                items: App.state.cart.map(item => ({ ...item, finalLineTotal: App.calcItemTotal(item) })),
                total: total,
                received: total,
                change: 0
            };
            try {
                await DB.commitSale(saleData, App.state.cart);
            } catch (error) {
                App.state.isProcessingPayment = false;
                await App.alert('บันทึกการขายไม่สำเร็จ ตะกร้ายังไม่ถูกล้าง กรุณาลองใหม่\n' + error.message);
                return;
            }

            // A paid table/delivery bill must be removed from the active queue.
            if (App.state.activeBill?.id) App.closeBillSession(App.state.activeBill.id, 'completed');

            App.state.editingBillId = null;
            App.state.editingSaleDate = null;

            App.state.cart = [];
            App.state.activeBill = null; // Clear tracker after print
            App.updateParkedBadge();
            App.state.products = DB.getProducts();
            App.renderCart();
            App.renderProductGrid();
            App.closeModals();
            if (App.toggleMobileCart) App.toggleMobileCart(false);
            App.state.isProcessingPayment = false;

            // Trigger Print
            App.printReceipt(saleData);
        }
    },

    updateParkedBadge: () => {
        const tables = DB.getTables();
        const tableBillIds = tables.filter(t => t.billId).map(t => t.billId);
        const parkedBills = DB.getParkedCarts().filter(c => !tableBillIds.includes(c.id));
        const count = parkedBills.length;
        App.elements.parkedCount.textContent = count;
        App.elements.parkedCount.style.display = count > 0 ? 'inline-block' : 'none';
    },

    showParkedCartsModal: () => {
        App.closeModals(); // Prevent Overlap
        const rawParked = DB.getParkedCarts(); // Sorted by DB
        const tables = DB.getTables();
        const tableBillIds = tables.filter(t => t.billId).map(t => t.billId);
        const parked = rawParked.filter(c => !tableBillIds.includes(c.id));

        const trash = DB.getParkedTrash();
        const overlay = document.getElementById('modal-overlay');
        const modal = document.getElementById('price-check-modal'); // reuse

        // Trash View Toggle
        const showTrash = App.state.showingTrash || false;
        const listToRender = showTrash ? trash : parked;
        const title = showTrash ? `ถังขยะ (${trash.length}) - ย้อนหลัง 10 รายการ` : `รายการพักบิล (${parked.length})`;

        modal.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <h2>${title}</h2>
                <button class="secondary-btn small" onclick="App.toggleTrash()" style="${showTrash ? 'background:#ffebee; color:red; border:1px solid red;' : ''}">
                    ${showTrash ? 'กลับไปรายการปกติ' : `🗑️ ถังขยะ (${trash.length})`}
                </button>
            </div>

            ${App.state.cart.length > 0 && !showTrash ? `
            <div style="margin-top:15px; margin-bottom:10px;">
                <button class="primary-btn" style="width:100%; display:flex; justify-content:center; align-items:center; gap:10px; padding:15px;" onclick="App.actionParkCart()">
                    <span class="material-symbols-rounded">move_to_inbox</span> พักบิลรายการปัจจุบันทันที (${App.state.cart.length} รายการ)
                </button>
                <div style="text-align:center; margin-top:5px; font-size:12px; color:#666;">(กดเพื่อพักรายการในตะกร้าและเคลียร์หน้าจอ)</div>
                <hr style="margin:15px 0; border:0; border-top:1px solid #eee;">
            </div>
            ` : ''}
            
            <div style="display:flex; flex-direction:column; gap:10px; margin-top:15px; max-height:400px; overflow-y:auto;">
                ${listToRender.length === 0 ? `<p style="text-align:center; color:#888;">${showTrash ? 'ถังขยะว่างเปล่า' : 'ไม่มีรายการพักบิล'}</p>` : ''}
                ${listToRender.map(cart => {
            let deliveryLabel = '';
            let bgColor = showTrash ? '#fff5f5' : '#fff';
            let borderColor = showTrash ? '#ffcdd2' : '#eee';

            if (cart.deliveryTime) {
                const timeDiff = new Date(cart.deliveryTime) - new Date();
                const minsLeft = Math.floor(timeDiff / 60000);
                const dDate = new Date(cart.deliveryTime);
                let timeStr = `${String(dDate.getHours()).padStart(2, '0')}:${String(dDate.getMinutes()).padStart(2, '0')}`;

                const today = new Date();
                if (dDate.getDate() !== today.getDate() || dDate.getMonth() !== today.getMonth()) {
                    timeStr = `${dDate.getDate()}/${dDate.getMonth() + 1} ${timeStr}`;
                }

                let statusColor = '#e65100'; // Default Orange
                let badgeText = `รอส่ง: ${timeStr} (${minsLeft} นาที)`;

                if (minsLeft < 0) {
                    statusColor = '#c62828'; // Red
                    badgeText = `เลยกำหนดส่ง: ${timeStr} (เลยมา ${Math.abs(minsLeft)} นาที)`;
                    bgColor = '#ffebee';
                    borderColor = '#ef9a9a';
                } else if (minsLeft <= 15) {
                    statusColor = '#f57f17'; // Yellow-Orange
                    badgeText = `ใกล้ถึงเวลาส่ง: ${timeStr} (อีก ${minsLeft} นาที)`;
                    bgColor = '#fffde7';
                    borderColor = '#fff59d';
                }

                deliveryLabel = `
                            <div style="font-size:12px; font-weight:bold; color:${statusColor}; margin-top:4px; display:flex; align-items:center; gap:4px;">
                                <span class="material-symbols-rounded" style="font-size:14px;">two_wheeler</span> ${badgeText}
                            </div>
                        `;
            }

            return `
                    <div style="border:1px solid ${borderColor}; padding:10px; border-radius:8px; display:flex; justify-content:space-between; align-items:center; background:${bgColor}; mb-2">
                        <div style="flex:1;">
                            <div style="display:flex; align-items:center; gap:5px;">
                                <div style="font-weight:bold; font-size:16px; color:var(--primary-color); cursor:pointer;" onclick="App.editParkedName('${cart.id}', '${cart.note || ''}', event)" title="แก้ไขชื่อ">
                                    ${cart.note ? cart.note : '<span style="color:#ccc;">(ไม่มีชื่อ)</span>'}
                                </div>
                                ${!showTrash ? `
                                <button class="icon-btn small" onclick="App.editParkedName('${cart.id}', '${cart.note || ''}', event)" title="เปลี่ยนชื่อ">
                                    <span class="material-symbols-rounded" style="font-size:16px;">edit</span>
                                </button>
                                ` : ''}
                            </div>
                            <div style="font-size:12px; color:#888;">
                                ${cart.id} | ${new Date(cart.timestamp).toLocaleString('th-TH')} <span style="color:blue;">(${typeof Utils !== 'undefined' && Utils.timeAgo ? Utils.timeAgo(cart.timestamp) : 'เพิ่งพัก'})</span>
                            </div>
                            <div style="font-size:12px;">${cart.items.length} รายการ - ${Utils.formatCurrency(cart.items.reduce((s, i) => s + (i.price * i.qty), 0))} บาท</div>
                            ${deliveryLabel}
                        </div>
                        <div style="margin-left:10px;">
                            ${showTrash ? `
                                <button class="primary-btn" onclick="App.restoreFromTrash('${cart.id}')">กู้คืน</button>
                                <button class="icon-btn dangerous" onclick="App.deleteParkedTrash('${cart.id}')" title="ลบถาวร" style="margin-left:5px;">
                                    <span class="material-symbols-rounded">delete</span>
                                </button>
                            ` : `
                                <button class="primary-btn" style="padding:5px 10px; font-size:14px;" onclick="App.restoreParked('${cart.id}')">เรียกคืน</button>
                                <button class="icon-btn dangerous" onclick="App.deleteParked('${cart.id}')">
                                    <span class="material-symbols-rounded">delete</span>
                                </button>
                            `}
                        </div>
                    </div>
                `}).join('')}
            </div>
            ${showTrash ? `
                <div style="margin-top:10px; border-top:1px solid #eee; padding-top:10px;">
                    <button class="secondary-btn dangerous" style="width:100%;" onclick="App.clearParkedTrash()">
                        <span class="material-symbols-rounded">delete_forever</span> ล้างถังขยะทั้งหมด
                    </button>
                </div>
            ` : ''}
            <button class="secondary-btn" style="width:100%; margin-top:15px;" onclick="App.closeModals()">ปิด</button>
        `;
        overlay.classList.remove('hidden');
        modal.classList.remove('hidden');
    },

    // --- Custom Modal Helpers ---
    _ensureConfirmationModal: () => {
        const modal = document.getElementById('confirmation-modal');
        if (!modal) return null; // Should exist from HTML

        // Check if content is missing (was wiped)
        if (!document.getElementById('confirm-input') || !document.getElementById('btn-confirm-ok')) {
            console.warn('Re-injecting confirmation modal content');
            modal.innerHTML = `
                <div style="font-size: 48px; margin-bottom: 10px;" id="confirm-icon">❓</div>
                <h3 id="confirm-title" style="margin-bottom:10px; font-size: 18px;">ยืนยัน</h3>
                <p id="confirm-message" style="margin-bottom:20px; color:#555; font-size: 16px;">ข้อความ</p>
                <input type="text" id="confirm-input" class="hidden" style="width:100%; padding:10px; margin-bottom:20px; border:1px solid #ddd; border-radius:4px; font-size:16px;">
                <div style="display:flex; gap:10px; justify-content:center;">
                    <button id="btn-confirm-cancel" class="secondary-btn" style="flex:1;">ยกเลิก</button>
                    <button id="btn-confirm-ok" class="primary-btn" style="flex:1;">ตกลง</button>
                </div>
             `;
        }
        return modal;
    },

    confirm: (message, title = 'ยืนยันการทำรายการ') => {
        return new Promise((resolve) => {
            try {
                App._ensureConfirmationModal();
                const modal = document.getElementById('confirmation-modal');
                const overlay = document.getElementById('modal-overlay');

                document.getElementById('confirm-title').textContent = title;
                document.getElementById('confirm-message').textContent = message;
                document.getElementById('confirm-icon').textContent = '❓';

                const btnOk = document.getElementById('btn-confirm-ok');
                const btnCancel = document.getElementById('btn-confirm-cancel');

                const input = document.getElementById('confirm-input');
                if (input) input.classList.add('hidden'); // Ensure input is hidden

                btnCancel.style.display = 'block';
                btnOk.textContent = 'ตกลง';
                btnOk.className = 'primary-btn';

                const close = (result) => {
                    modal.classList.add('hidden');

                    // Check if any OTHER modal is still open (e.g., price-check-modal for parked list)
                    const otherModals = Array.from(document.querySelectorAll('.modal:not(#confirmation-modal)')).some(m => !m.classList.contains('hidden'));

                    if (!otherModals) {
                        overlay.classList.add('hidden');
                    }

                    resolve(result);
                };

                // Clone buttons to remove old listeners
                const newBtnOk = btnOk.cloneNode(true);
                const newBtnCancel = btnCancel.cloneNode(true);
                btnOk.parentNode.replaceChild(newBtnOk, btnOk);
                btnCancel.parentNode.replaceChild(newBtnCancel, btnCancel);

                newBtnOk.onclick = () => close(true);
                newBtnCancel.onclick = () => close(false);

                modal.classList.remove('hidden');
                overlay.classList.remove('hidden');

                // Safe focus
                setTimeout(() => {
                    try { newBtnOk.focus(); } catch (e) { /* ignore */ }
                }, 100);
            } catch (e) {
                console.error('Confirm Modal Error:', e);
                resolve(false); // Fail safe
            }
        });
    },

    alert: (message, title = 'แจ้งเตือน') => {
        return new Promise((resolve) => {
            try {
                App._ensureConfirmationModal();
                const modal = document.getElementById('confirmation-modal');
                const overlay = document.getElementById('modal-overlay');

                document.getElementById('confirm-title').textContent = title;
                document.getElementById('confirm-message').textContent = message;
                document.getElementById('confirm-icon').textContent = 'ℹ️';

                const btnOk = document.getElementById('btn-confirm-ok');
                const btnCancel = document.getElementById('btn-confirm-cancel');

                const input = document.getElementById('confirm-input');
                if (input) input.classList.add('hidden');

                btnCancel.style.display = 'none';
                btnOk.textContent = 'รับทราบ';
                btnOk.className = 'primary-btn';

                const close = () => {
                    modal.classList.add('hidden');
                    overlay.classList.add('hidden');
                    resolve(true);
                };

                const newBtnOk = btnOk.cloneNode(true);
                btnOk.parentNode.replaceChild(newBtnOk, btnOk);

                newBtnOk.onclick = () => close();

                modal.classList.remove('hidden');
                overlay.classList.remove('hidden');

                setTimeout(() => {
                    try { newBtnOk.focus(); } catch (e) { /* ignore */ }
                }, 100);
            } catch (e) {
                console.error('Alert Modal Error:', e);
                resolve(true);
            }
        });
    },

    prompt: (message, defaultValue = '', title = 'กรอกข้อมูล') => {
        return new Promise((resolve) => {
            try {
                App._ensureConfirmationModal();
                const modal = document.getElementById('confirmation-modal');
                const overlay = document.getElementById('modal-overlay');

                document.getElementById('confirm-title').textContent = title;
                document.getElementById('confirm-message').textContent = message;
                document.getElementById('confirm-icon').textContent = '📝';

                const btnOk = document.getElementById('btn-confirm-ok');
                const btnCancel = document.getElementById('btn-confirm-cancel');
                btnCancel.style.display = 'block';
                btnOk.textContent = 'ตกลง';
                btnOk.className = 'primary-btn';

                // Input handling - DO NOT CLONE INPUT (Fixes mobile state issues)
                const input = document.getElementById('confirm-input');
                input.value = defaultValue;
                input.classList.remove('hidden');

                // Overlay handling helper
                const close = (result) => {
                    modal.classList.add('hidden');
                    input.classList.add('hidden');

                    // Check if any OTHER modal is still open
                    const otherModals = Array.from(document.querySelectorAll('.modal:not(#confirmation-modal)')).some(m => !m.classList.contains('hidden'));
                    if (!otherModals) {
                        overlay.classList.add('hidden');
                    }

                    resolve(result);
                };

                // Bind Events to NEW buttons (Clone buttons to clear old listeners)
                const newBtnOk = btnOk.cloneNode(true);
                const newBtnCancel = btnCancel.cloneNode(true);
                btnOk.parentNode.replaceChild(newBtnOk, btnOk);
                btnCancel.parentNode.replaceChild(newBtnCancel, btnCancel);

                newBtnOk.onclick = () => {
                    const finalValue = document.getElementById('confirm-input').value; // Read fresh from DOM
                    close(finalValue);
                };
                newBtnCancel.onclick = () => close(null);

                // Overwrite onkeydown directly (no need to clone input)
                input.onkeydown = (e) => {
                    if (e.key === 'Enter') {
                        const finalValue = document.getElementById('confirm-input').value;
                        close(finalValue);
                    }
                };

                modal.classList.remove('hidden');
                overlay.classList.remove('hidden');

                setTimeout(() => {
                    try { input.focus(); } catch (e) { /* ignore */ }
                }, 100);
            } catch (e) {
                console.error('Prompt Modal Error:', e);
                resolve(null);
            }
        });
    },

    toggleTrash: () => {
        App.state.showingTrash = !App.state.showingTrash;
        App.showParkedCartsModal();
    },
    safeReplaceCart: async (confirmMessage) => {
        if (App.state.cart.length > 0) {
            // Auto-park logic: If replacing, save current cart to parked bills
            let parkNote = 'บิลพักอัตโนมัติ (ระบบเปลี่ยนตะกร้า)';
            let parkTimestamp = Date.now();
            let parkId = null;
            let deliveryTime = null;
            let deliveryDetails = null;

            if (App.state.activeBill) {
                parkNote = App.state.activeBill.note || parkNote;
                parkTimestamp = App.state.activeBill.timestamp || parkTimestamp;
                parkId = App.state.activeBill.id;
                deliveryTime = App.state.activeBill.deliveryTime || null;
                deliveryDetails = App.state.activeBill.deliveryDetails || null;
            }

            // Check if user still wants to replace. If it's a silent replace, we can omit the prompt,
            // but for safety, we ask if a confirmMessage is provided.
            if (confirmMessage) {
                if (!await App.confirm(`${confirmMessage}\n(ตะกร้าปัจจุบันจะถูกนำไปพักไว้ใน "พักบิล" อัตโนมัติ เพื่อป้องกันข้อมูลสูญหาย)`)) {
                    return false;
                }
            }
            
            // Proceed to auto-park without user intervention
            DB.parkCart(App.state.cart, parkNote, parkTimestamp, parkId, deliveryTime, deliveryDetails);
            
            // Clear current cart so it's ready for the new data
            App.state.activeBill = null;
            App.state.cart = [];
            App.updateParkedBadge();
        }
        return true;
    },

    editParkedName: async (id, currentName, event) => {
        if (event) event.stopPropagation(); // Stop bubbling to prevent accidental clicks
        const newName = await App.prompt('แก้ไขชื่อบิล:', currentName);
        if (newName !== null) {
            DB.updateParkedNote(id, newName);
            App.showParkedCartsModal();
        }
    },

    restoreParked: async (id) => {
        if (!await App.safeReplaceCart()) return; // Silent auto-park

        // Note: retrieve logic in DB now returns the object but deletes it from DB
        // But we want to allow "re-parking" to same slot.
        const parkingData = DB.retrieveParkedCart(id);

        if (parkingData) {
            App.state.cart = parkingData.items.map(item => ({ ...item, originalQty: item.qty }));

            // Set Active Bill State for Smart Re-parking
            App.state.activeBill = {
                id: parkingData.id,
                note: parkingData.note,
                timestamp: parkingData.timestamp // Keep Original Queue Time!
            };

            App.renderCart();
            App.updateParkedBadge();
            App.closeModals();
        }
    },

    deleteParked: async (id) => {
        if (await App.confirm('ย้ายไปถังขยะ?')) {
            DB.removeParkedCart(id);
            App.showParkedCartsModal();
            App.updateParkedBadge();
        }
    },

    restoreFromTrash: (id) => {
        DB.restoreParkedFromTrash(id);
        App.showParkedCartsModal();
        App.updateParkedBadge();
    },

    deleteParkedTrash: async (id) => {
        if (await App.confirm('ต้องการลบรายการนี้ถาวรใช่หรือไม่?')) {
            DB.deleteParkedTrashItem(id);
            App.showParkedCartsModal();
        }
    },

    clearParkedTrash: async () => {
        if (await App.confirm('ต้องการล้างถังขยะทั้งหมดใช่หรือไม่?\nข้อมูลจะไม่สามารถกู้คืนได้')) {
            DB.clearParkedTrash();
            App.showParkedCartsModal();
        }
    },

    // --- Payment & Receipt ---
    // Helper to toggle mobile cart (defined here to be accessible)
    toggleMobileCart: (show) => {
        const cartPanel = document.getElementById('right-panel');
        const mobileOverlay = document.getElementById('mobile-cart-overlay');
        if (show) {
            cartPanel.classList.add('open');
            if (window.innerWidth <= 1024) mobileOverlay.style.display = 'block';
        } else {
            cartPanel.classList.remove('open');
            mobileOverlay.style.display = 'none';
        }
    },

    showPaymentModal: () => {
        App.closeModals(); // Prevent Overlap
        // Hide Mobile Cart for better view
        App.toggleMobileCart(false);

        const total = parseFloat(App.elements.cartTotal.textContent.replace(/,/g, ''));
        const overlay = document.getElementById('modal-overlay');
        const modal = document.getElementById('payment-modal');
        const prefs = DB.getPaymentPrefs(); // Load saved preferences

        modal.innerHTML = `
            <h2 style="text-align:center;">สรุปยอดชำระ</h2>
            <div style="text-align:center; font-size:48px; font-weight:bold; color:var(--primary-color); margin:20px 0;">
                ฿${Utils.formatCurrency(total)}
            </div>
            <label for="pay-method" style="display:block;font-weight:bold;margin-bottom:6px;">วิธีชำระเงิน</label>
            <select id="pay-method" style="width:100%;padding:11px;font-size:17px;border:1px solid #ccc;border-radius:9px;margin-bottom:12px;">
                <option value="cash">เงินสด</option>
                <option value="bank_qr">สแกน QR ธนาคาร</option>
                <option value="government_scheme">สิทธิ์โครงการรัฐ/คนละครึ่ง</option>
                <option value="mixed">ชำระหลายทาง</option>
            </select>
            <div style="display:flex; flex-direction:column; align-items:center;">
                <input type="text" id="pay-input" style="font-size:32px; padding:15px; width:100%; text-align:center; margin-bottom:10px; border:2px solid var(--primary-color); border-radius:8px; font-weight:bold;" placeholder="0.00" readonly>
                
                <!-- Quick Amounts -->
                <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:8px; width:100%; margin-bottom:10px;">
                    <button class="secondary-btn" style="padding:8px;" onclick="App.setPayAmount(${Math.ceil(total)})">พอดี</button>
                    <button class="secondary-btn" style="padding:8px;" onclick="App.setPayAmount(100)">100</button>
                    <button class="secondary-btn" style="padding:8px;" onclick="App.setPayAmount(500)">500</button>
                    <button class="secondary-btn" style="padding:8px;" onclick="App.setPayAmount(1000)">1000</button>
                </div>

                <!-- Numpad -->
                <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:10px; width:100%; max-width:300px;">
                    <button class="numpad-btn" onclick="App.appendPayKey('7')">7</button>
                    <button class="numpad-btn" onclick="App.appendPayKey('8')">8</button>
                    <button class="numpad-btn" onclick="App.appendPayKey('9')">9</button>
                    <button class="numpad-btn" onclick="App.appendPayKey('4')">4</button>
                    <button class="numpad-btn" onclick="App.appendPayKey('5')">5</button>
                    <button class="numpad-btn" onclick="App.appendPayKey('6')">6</button>
                    <button class="numpad-btn" onclick="App.appendPayKey('1')">1</button>
                    <button class="numpad-btn" onclick="App.appendPayKey('2')">2</button>
                    <button class="numpad-btn" onclick="App.appendPayKey('3')">3</button>
                    <button class="numpad-btn" style="color:red;" onclick="App.appendPayKey('C')">C</button>
                    <button class="numpad-btn" onclick="App.appendPayKey('0')">0</button>
                    <button class="numpad-btn" onclick="App.appendPayKey('.')">.</button>
                </div>
            </div>

            <div style="margin-top:20px; text-align:center; font-size:24px;" id="change-display">
                เงินทอน: -
            </div>

            <!-- Print Options Toggles -->
            <div style="display:flex; flex-wrap:wrap; gap:10px; margin-top:15px; justify-content:center; background:#f9f9f9; padding:10px; border-radius:8px;">
                <label style="display:flex; align-items:center; gap:5px; cursor:pointer;" title="พิมพ์โลโก้">
                    <input type="checkbox" id="pay-print-logo" ${prefs.printLogo ? 'checked' : ''}>
                    <span style="font-size:14px;">Logo</span>
                </label>
                <label style="display:flex; align-items:center; gap:5px; cursor:pointer;" title="พิมพ์ชื่อร้าน">
                    <input type="checkbox" id="pay-print-name" ${prefs.printName ? 'checked' : ''}>
                    <span style="font-size:14px;">ชื่อร้าน</span>
                </label>
                 <label style="display:flex; align-items:center; gap:5px; cursor:pointer;" title="พิมพ์ที่อยู่/เบอร์โทร">
                    <input type="checkbox" id="pay-print-contact" ${prefs.printContact ? 'checked' : ''}>
                    <span style="font-size:14px;">ที่อยู่/โทร</span>
                </label>
                <label style="display:flex; align-items:center; gap:5px; cursor:pointer;" title="พิมพ์ QR Code">
                    <input type="checkbox" id="pay-print-qr" ${prefs.printQr ? 'checked' : ''}>
                    <span style="font-size:14px;">QR Code</span>
                </label>
            </div>

            <div style="display:flex; gap:10px; margin-top:20px;">
                <button class="secondary-btn" style="flex:1; background:#f0f0f0; border:1px solid #ccc; color:#333;" onclick="App.cancelPayment()">กลับไปแก้ไข</button>
                <button class="primary-btn" style="flex:2;" id="btn-confirm-pay" disabled>ยืนยันการรับเงิน</button>
            </div>
        `;

        overlay.classList.remove('hidden');
        modal.classList.remove('hidden');

        // New helper methods for keypad (attached to App for inline onclicks)
        App.currentPayInput = '';

        App.cancelPayment = () => {
            App.closeModals();
            // Re-open mobile cart to allow editing
            if (App.toggleMobileCart) App.toggleMobileCart(true);
        };

        App.setPayAmount = (amount) => {
            App.currentPayInput = amount.toString();
            updateDisplay();
        };

        App.appendPayKey = (key) => {
            if (key === 'C') {
                App.currentPayInput = '';
            } else if (key === '.') {
                if (!App.currentPayInput.includes('.')) {
                    App.currentPayInput += key;
                }
            } else {
                App.currentPayInput += key;
            }
            updateDisplay();
        };

        const input = document.getElementById('pay-input');
        const confirmBtn = document.getElementById('btn-confirm-pay');
        const changeDisp = document.getElementById('change-display');

        const updateDisplay = () => {
            input.value = App.currentPayInput;
            const received = parseFloat(App.currentPayInput);

            if (!isNaN(received) && received >= total) {
                const change = received - total;
                changeDisp.innerHTML = `เงินทอน: <span style="color:var(--primary-color); font-weight:bold;">${Utils.formatCurrency(change)}</span>`;
                confirmBtn.disabled = false;
            } else {
                changeDisp.innerHTML = 'เงินทอน: -';
                confirmBtn.disabled = true;
            }
        };

        // Focus & Highlight Input (Visual only since read-only)
        setTimeout(() => {
            input.scrollIntoView({ behavior: 'smooth', block: 'center' });
            input.style.borderColor = 'var(--secondary-color)';
            input.style.boxShadow = '0 0 0 4px rgba(76, 175, 80, 0.2)'; // Green glow
        }, 100);



        const completeSale = async (shouldPrint) => {
            const received = parseFloat(App.currentPayInput);
            const change = received - total;

            // --- Persist Print Preferences before closing ---
            DB.savePaymentPrefs({
                printLogo: document.getElementById('pay-print-logo').checked,
                printName: document.getElementById('pay-print-name').checked,
                printContact: document.getElementById('pay-print-contact').checked,
                printQr: document.getElementById('pay-print-qr').checked
            });

            try {
                await DB.commitSale({
                billId: App.state.editingBillId || App.state.activeBill?.id || null, // Preserve active table/delivery ID
                date: App.state.editingSaleDate || new Date(), // Preserve Date if editing
                items: App.state.cart.map(item => ({ ...item, finalLineTotal: App.calcItemTotal(item) })),
                total: total,
                received: received,
                change: change,
                paymentMethod: document.getElementById('pay-method').value,
                paymentStatus: 'paid',
                orderType: App.state.activeBill?.deliveryTime ? 'delivery' : (App.state.activeBill ? 'table_or_parked' : 'walk_in'),
                customerId: App.state.activeBill?.customerId || null,
                customerSnapshot: App.state.activeBill ? { name: App.state.activeBill.note || '', phone: App.state.activeBill.customerPhone || '' } : null
                }, App.state.cart);
            } catch (error) {
                App.state.isProcessingPayment = false;
                await App.alert('บันทึกการขายไม่สำเร็จ ตะกร้ายังไม่ถูกล้าง กรุณาลองใหม่\n' + error.message);
                return;
            }

            // Paid table/delivery bills must disappear from the active queue and free the table.
            if (App.state.activeBill?.id) App.closeBillSession(App.state.activeBill.id, 'completed');

            // Clear Edit State
            App.state.editingBillId = null;
            App.state.editingSaleDate = null;

            App.state.cart = [];
            App.state.activeBill = null;
            DB.clearAutoCart();
            // Refresh Global State
            App.state.products = DB.getProducts();
            App.renderCart();
            App.renderProductGrid(); // Refresh Grid to show new stock
            App.closeModals();
            App.toggleMobileCart(false); // Ensure cart is closed after success
            App.state.isProcessingPayment = false; // Reset flag
        };

        document.getElementById('btn-confirm-pay').addEventListener('click', () => completeSale(false));
    },

    printReceiptFromHistory: (index) => {
        // 1. Close Modals first to ensure the UI is clean
        App.closeModals();

        // 2. Add small delay to allow modal transition to finish (optional but safe)
        setTimeout(() => {
            const sale = DB.getSales().sort((a, b) => new Date(b.date) - new Date(a.date))[index];
            App.printReceipt(sale);
        }, 100);
    },

    printReceipt: (sale) => {
        const area = document.getElementById('receipt-print-area');
        const settings = DB.getSettings();
        const prefs = DB.getPaymentPrefs(); // Load saved preferences

        // Grab Toggle States from Modal (if available, else default to saved prefs)
        const optsLogo = document.getElementById('pay-print-logo');
        const optsName = document.getElementById('pay-print-name');
        const optsContact = document.getElementById('pay-print-contact');
        const optsQr = document.getElementById('pay-print-qr');

        // Use Modal state if present, otherwise fall back to persisted prefs
        const showLogo = optsLogo ? optsLogo.checked : prefs.printLogo;
        const showName = optsName ? optsName.checked : prefs.printName;
        const showContact = optsContact ? optsContact.checked : prefs.printContact;
        const showQr = optsQr ? optsQr.checked : prefs.printQr;

        const storeName = settings.storeName;
        const received = sale.received || sale.total;
        const change = sale.change || 0;

        const receiptHtml = `
            ${showLogo && settings.logo ? `<div class="receipt-logo"><img src="${settings.logo}"></div>` : ''}
            
            <div class="receipt-header">
                ${showName ? `<h2>${storeName}</h2>` : ''}
                ${showContact && settings.address ? `<div style="font-size:14px; margin-bottom:2px;">${settings.address}</div>` : ''}
                ${showContact && settings.phone ? `<div>Tel: ${settings.phone}</div>` : ''}
                
                <div style="margin-top:5px; font-size:14px;">
                Bill ID: ${sale.billId}<br>
                    Date: ${new Date(sale.date).toLocaleString('th-TH')}
                </div>
            </div>
            <div class="receipt-divider"></div>
            <div style="display:flex; flex-direction:column; gap:8px;">
            ${sale.items.map(item => `
                <div class="receipt-item" style="display:block; margin-bottom:0;">
                    <div style="font-weight:bold; text-align:left; width:100%; line-height:1.2; word-break:break-word;">
                        ${Utils.escapeHTML(item.name)}
                    </div>
                    <div style="display:flex; justify-content:space-between; font-weight:normal; font-size:16px;">
                        <span>${item.qty} x ${Utils.formatCurrency(item.price)}</span>
                        <span style="font-weight:bold;">${Utils.formatCurrency(App.getLineTotal(item))}</span>
                    </div>
                </div>
            `).join('')}
            </div>
            <div class="receipt-divider"></div>
            <div class="receipt-total">
                <span>ยอดรวมสุทธิ</span>
                <span>${Utils.formatCurrency(sale.total)}</span>
            </div>
            <div style="margin-top:5px; font-size:16px;">
                <div style="display:flex; justify-content:space-between;">
                    <span>รับเงิน</span>
                    <span>${Utils.formatCurrency(received)}</span>
                </div>
                ${change > 0 ? `
                <div style="display:flex; justify-content:space-between;">
                    <span>เงินทอน</span>
                    <span>${Utils.formatCurrency(change)}</span>
                </div>
                ` : ''}
                ${received === sale.total ? `
                <div style="text-align:center; font-size:14px; color:gray; margin-top:2px;">(รับเงินพอดี)</div>
                ` : ''}
            </div>
            
            ${showQr && settings.qrCode ? `
                <div class="receipt-qr">
                    <img src="${settings.qrCode}">
                    <div style="font-size:12px; margin-top:2px;">Scan to Pay</div>
                </div>
            ` : ''}

            <div class="receipt-footer">
                <br>
                <p>ขอบคุณที่อุดหนุน</p>
                <!-- Feed for Cutter / Tearing -->
                ${Array(settings.printerFeedLines || 5).fill('<div style="color: white !important; font-size: 14px; user-select: none;">.</div>').join('')}
            </div>
        `;
        area.innerHTML = receiptHtml;

        // Add class to body to toggle visibility via CSS
        document.body.classList.add('is-printing');

        // --- Aggressive Hide (Nuclear Option) ---
        // Force hide elements via inline styles to bypass potential CSS specificity issues
        const uiElements = document.querySelectorAll('#app, #sidebar, #mobile-bottom-nav, #btn-mobile-cart, .modal, #modal-overlay, #mobile-cart-overlay, #app-version-display');
        const originalDisplays = new Map();

        uiElements.forEach(el => {
            originalDisplays.set(el, el.style.display);
            el.style.setProperty('display', 'none', 'important');
        });

        // Wait for images to render (base64 is fast, but just in case)
        setTimeout(() => {
            window.print();
            // Cleanup after print dialog closes (or 1s delay)
            setTimeout(() => {
                area.innerHTML = '';
                document.body.classList.remove('is-printing');

                // Restore Styles
                uiElements.forEach(el => {
                    el.style.display = originalDisplays.get(el);
                });
            }, 5000); // 5s is usually enough for dialog interaction
        }, 500); // Added delay before printing    }, 50);
    },


    // --- Tables / Dine-in View ---
    renderTablesView: (container) => {
        const tables = DB.getTables();
        const parkedBills = DB.getParkedCarts();

        // Filter out delivery bills to show separately
        const deliveryBills = parkedBills.filter(b => b.deliveryTime);

        container.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                <h2 style="margin:0;">จัดการโต๊ะ (Dine-in)</h2>
                <div style="display:flex; gap:10px;">
                    <button class="secondary-btn" onclick="App.renderView('customers')" style="display:flex; align-items:center; gap:5px; padding:8px 12px;">
                        <span class="material-symbols-rounded">contacts</span> ลูกค้า/ประวัติ
                    </button>
                    <button class="primary-btn" onclick="App.openNewDeliveryModal()" style="display:flex; align-items:center; gap:5px; padding:8px 15px;">
                        <span class="material-symbols-rounded">two_wheeler</span> ออเดอร์ส่ง/ล่วงหน้า
                    </button>
                </div>
            </div>
            
            <div class="tables-grid">
                ${tables.map(table => {
            const activeBill = table.billId ? parkedBills.find(b => b.id === table.billId) : null;
            const isOccupied = !!activeBill;
            const customerName = isOccupied ? (activeBill.note || 'ไม่มีชื่อ') : 'ว่าง';
            const itemCount = isOccupied ? activeBill.items.length : 0;
            const billTotal = isOccupied ? activeBill.items.reduce((s, i) => s + (i.price * i.qty), 0) : 0;

            return `
                        <div class="table-card ${isOccupied ? 'occupied' : ''}" onclick="App.handleTableClick(${table.id})" style="position:relative; box-sizing:border-box;">
                            ${!isOccupied && table.id > 4 ? `
                                <button class="icon-btn dangerous small" style="position:absolute; top:5px; right:5px; padding:2px;" onclick="event.stopPropagation(); App.removeTable(${table.id}, '${table.name}')" title="ลบโต๊ะ">
                                    <span class="material-symbols-rounded" style="font-size:16px;">close</span>
                                </button>
                            ` : ''}
                            <div style="font-size: 20px; font-weight: bold; margin-bottom: 5px;">${table.name}</div>
                            <div style="font-size: 14px; color: ${isOccupied ? 'var(--primary-color)' : '#999'}; margin-bottom: 5px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; width:100%;">
                                ${customerName}
                            </div>
                            ${isOccupied ? `
                                <div style="font-size: 13px; margin-bottom: 5px; color:#555;">${itemCount} รายการ</div>
                                <div style="font-size: 16px; font-weight: bold; color: var(--danger-color);">฿${Utils.formatCurrency(billTotal)}</div>
                                <div style="margin-top: 5px; display: flex; justify-content: center;" onclick="event.stopPropagation()">
                                    <button class="icon-btn small" onclick="App.editTableName(${table.id}, '${activeBill.note || ''}')" title="เปลี่ยนชื่อลูกค้า" style="padding:2px;">
                                        <span class="material-symbols-rounded" style="font-size: 16px;">edit</span>
                                    </button>
                                </div>
                            ` : `
                                <div style="font-size: 13px; color: #ccc;">กดเพื่อเปิดโต๊ะ</div>
                            `}
                        </div>
                    `;
        }).join('')}
                <!-- Add New Table Button inside the grid -->
                <div class="table-card" style="border: 2px dashed #ccc; background: transparent; display:flex; flex-direction:column; justify-content:center; align-items:center; cursor:pointer; box-sizing:border-box; padding:15px;" onclick="App.addNewTable()">
                    <span class="material-symbols-rounded" style="font-size:36px; color:#ccc; margin-bottom:5px;">add_circle</span>
                    <span style="color:#888; font-weight:bold; font-size:14px;">เพิ่มโต๊ะใหม่</span>
                </div>
            </div>

            <!-- Delivery Section -->
            <div style="margin-top: 30px;">
                <h3 style="margin-bottom:15px; display:flex; align-items:center; gap:5px; color:#e65100;">
                    <span class="material-symbols-rounded">two_wheeler</span> ออเดอร์ส่ง / นัดรับ (${deliveryBills.length})
                </h3>
                ${deliveryBills.length === 0 ? '<div style="text-align:center; padding:20px; color:#999; border:1px dashed #ddd; border-radius:8px;">ไม่มีออเดอร์จัดส่งในขณะนี้</div>' : ''}
                <div style="display:flex; flex-direction:column; gap:10px;">
                    ${deliveryBills.map(bill => {
            const timeDiff = new Date(bill.deliveryTime) - new Date();
            const minsLeft = Math.floor(timeDiff / 60000);

            let statusColor = '#333';
            let statusBg = '#fff';
            let statusBorder = '#eee';
            let urgencyIcon = 'schedule';

            if (minsLeft < 0) {
                statusColor = 'white';
                statusBg = '#e53935'; // Overdue - Red
                statusBorder = '#b71c1c';
                urgencyIcon = 'error';
            } else if (minsLeft <= 15) {
                statusColor = '#8a6d3b';
                statusBg = '#fcf8e3'; // Urgent - Yellow
                statusBorder = '#faebcc';
                urgencyIcon = 'warning';
            }

            const dDate = new Date(bill.deliveryTime);
            let timeStr = `${String(dDate.getHours()).padStart(2, '0')}:${String(dDate.getMinutes()).padStart(2, '0')}`;

            // Show Date if it's not today
            const today = new Date();
            if (dDate.getDate() !== today.getDate() || dDate.getMonth() !== today.getMonth()) {
                timeStr = `${dDate.getDate()}/${dDate.getMonth() + 1} ${timeStr}`;
            }

            return `
                <div class="table-card" style="flex-direction:row; justify-content:space-between; padding:15px; border-color:${statusBorder}; background:${statusBg}; text-align:left; flex-wrap:wrap; gap:10px;">
                    <div style="flex:1; min-width:200px;">
                        <div style="font-weight:bold; font-size:18px; margin-bottom:5px; color:${statusColor};">
                            ${bill.note || 'ไม่ระบุชื่อ'}
                        </div>
                        <div style="font-size:14px; color:#666; margin-bottom:5px;">
                            ${bill.items.length} รายการ - ฿${Utils.formatCurrency(bill.items.reduce((s, i) => s + (i.price * i.qty), 0))}
                        </div>
                        ${bill.deliveryDetails && bill.deliveryDetails.address ? `<div style="font-size:13px; color:#555; margin-bottom:5px; white-space:pre-wrap;"><span class="material-symbols-rounded" style="font-size:14px; vertical-align:middle;">location_on</span> ${bill.deliveryDetails.address}</div>` : ''}
                        ${(bill.deliveryDetails && bill.deliveryDetails.map) || (bill.deliveryDetails && bill.deliveryDetails.image) ? `
                        <div style="display:flex; gap:5px; margin-top:8px;">
                            ${bill.deliveryDetails && bill.deliveryDetails.map ? `<button class="secondary-btn" style="padding:4px 8px; font-size:12px; display:flex; align-items:center; gap:2px;" onclick="event.stopPropagation(); window.open('${bill.deliveryDetails.map}', '_blank')"><span class="material-symbols-rounded" style="font-size:14px;">map</span> แผนที่</button>` : ''}
                            ${bill.deliveryDetails && bill.deliveryDetails.image ? `<button class="secondary-btn" style="padding:4px 8px; font-size:12px; display:flex; align-items:center; gap:2px;" onclick="event.stopPropagation(); App.showDeliveryImage('${bill.id}')"><span class="material-symbols-rounded" style="font-size:14px;">image</span> รูปสถานที่</button>` : ''}
                        </div>` : ''}
                    </div>
                    <div style="display:flex; flex-direction:column; align-items:flex-end; gap:10px;">
                        <div style="display:flex; align-items:center; gap:5px; font-weight:bold; color:${statusColor}; font-size:18px;">
                            <span class="material-symbols-rounded" style="font-size:20px;">${urgencyIcon}</span> ${timeStr}
                        </div>
                        <div style="display:flex; gap:5px; flex-wrap:wrap; justify-content:flex-end;">
                            <button class="secondary-btn" style="padding:5px 10px; display:flex; align-items:center; gap:5px; background:#1da1f2; color:white; border:none;" onclick="event.stopPropagation(); App.shareDeliveryBill('${bill.id}')" title="แชร์ข้อมูลจัดส่ง">
                                <span class="material-symbols-rounded" style="font-size:18px;">share</span>
                            </button>
                            <button class="primary-btn" style="padding:5px 15px; display:flex; align-items:center; gap:5px;" onclick="event.stopPropagation(); App.restoreDelivery('${bill.id}')">
                                <span class="material-symbols-rounded" style="font-size:20px;">shopping_cart_checkout</span> จัดการ
                            </button>
                            <button class="secondary-btn" style="padding:5px 10px; display:flex; align-items:center; gap:5px; background:white; color:#c62828; border:1px solid #ef9a9a;" onclick="event.stopPropagation(); App.cancelDeliveryBill('${bill.id}')" title="ยกเลิกออเดอร์ส่ง">
                                <span class="material-symbols-rounded" style="font-size:18px;">delete</span>
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }).join('')}
                </div>
            </div>
        `;
    },

    addNewTable: async () => {
        const tables = DB.getTables();
        const nextNum = tables.length > 0 ? tables[tables.length - 1].id + 1 : 1;
        const name = await App.prompt('ตั้งชื่อโต๊ะใหม่:', `โต๊ะ ${nextNum} `);
        if (name) {
            DB.addTable(name);
            App.renderTablesView(App.elements.viewContainer);
        }
    },

    removeTable: async (id, name) => {
        if (await App.confirm(`ยืนยันการลบ "${name}" ออกจากระบบหรือไม่ ? `)) {
            const success = DB.deleteTable(id);
            if (success) {
                App.renderTablesView(App.elements.viewContainer);
            } else {
                await App.alert('ไม่สามารถลบโต๊ะที่มีออเดอร์ค้างอยู่ได้');
            }
        }
    },

    openNewDeliveryModal: async () => {
        // We need a customer name/phone and a time. 
        // We can do this simply by creating an empty cart logic linked to delivery Time.
        const title = "สร้างออเดอร์ส่ง/ล่วงหน้า";
        App.closeModals();

        let uploadedDeliveryImage = null;

        const overlay = document.getElementById('modal-overlay');
        const modal = document.getElementById('price-check-modal'); // reuse container

        // Helper: Format current time to input[type=time] default value
        const now = new Date();
        now.setMinutes(now.getMinutes() + 30); // Default to 30 mins from now
        const hrs = String(now.getHours()).padStart(2, '0');
        const mins = String(now.getMinutes()).padStart(2, '0');
        const defaultTime = `${hrs}:${mins} `;

        modal.innerHTML = `
            <h2>${title}</h2>
            <div style="margin-top: 15px;">
                <label style="display:block; margin-bottom:5px; font-weight:bold;">ชื่อลูกค้า / เบอร์โทร:</label>
                <input type="text" id="delivery-name" style="width:100%; padding:10px; font-size:16px; border:1px solid #ccc; border-radius:4px; box-sizing:border-box;" placeholder="เช่น คุณเอ 0812345678">
            </div>
            
            <div style="margin-top: 15px;">
                <label style="display:block; margin-bottom:5px; font-weight:bold;">เวลาจัดส่ง / นัดรับ <span style="font-size:14px; color:#e65100; font-weight:normal;">(กดที่ช่องเพื่อตั้งเวลา)</span>:</label>
                <div style="display:flex; gap:10px; align-items:center;">
                    <input type="time" id="delivery-time" value="${defaultTime}" style="flex:1; padding:10px; font-size:16px; border:1px solid #ccc; border-radius:4px; background-color:#fff; cursor:pointer; box-sizing:border-box;">
                </div>
            </div>

            <div style="margin-top: 15px;">
                <label style="display:flex; align-items:center; gap:10px; cursor:pointer; background-color: #f9f9f9; padding: 12px; border-radius: 4px; border: 1px solid #ddd;">
                    <input type="checkbox" id="delivery-date-toggle" style="width:24px; height:24px; cursor:pointer; accent-color: var(--primary-color);">
                    <span style="font-weight:bold; color:#333; font-size:16px;">กำหนดวันที่ส่ง (ล่วงหน้าหลายวัน)</span>
                </label>
                <div id="delivery-date-container" style="display:none; margin-top:10px;">
                    <label style="display:block; margin-bottom:5px; color:#666; font-weight:bold;">วันที่จัดส่ง <span style="font-size:14px; color:#e65100; font-weight:normal;">(กดที่ช่องเพื่อเลือกวันที่)</span>:</label>
                    <input type="date" id="delivery-date" style="width:100%; padding:10px; font-size:16px; border:1px solid #ccc; border-radius:4px; background-color:#fff; cursor:pointer; box-sizing:border-box;">
                </div>
            </div>

            <div style="margin-top: 15px;">
                <label style="display:block; margin-bottom:5px; font-weight:bold;">ที่อยู่จัดส่ง:</label>
                <div style="display:flex; gap:5px; align-items:flex-start;">
                    <textarea id="delivery-address" style="flex:1; padding:10px; font-size:16px; border:1px solid #ccc; border-radius:4px; box-sizing:border-box; resize:vertical; min-height:80px;" placeholder="บ้านเลขที่, ถนน, ซอย, จุดสังเกต..."></textarea>
                    <button class="secondary-btn" style="padding:10px; display:flex; flex-direction:column; align-items:center; justify-content:center; height:80px; width:70px; background-color:#e8f5e9; color:#2e7d32; border:1px solid #c8e6c9;" onclick="const addr = document.getElementById('delivery-address').value; if(addr) window.open('https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(addr), '_blank')" title="ค้นหาที่อยู่นี้บน Google Map">
                        <span class="material-symbols-rounded" style="font-size:24px; margin-bottom:4px;">search</span>
                        <span style="font-size:10px; line-height:1.2;">ค้นหาพิกัด</span>
                    </button>
                </div>
            </div>

            <div style="margin-top: 15px;">
                <label style="display:block; margin-bottom:5px; font-weight:bold;">ลิงก์ Google Map:</label>
                <div style="display:flex; gap:5px;">
                    <input type="url" id="delivery-map" style="flex:1; padding:10px; font-size:16px; border:1px solid #ccc; border-radius:4px; box-sizing:border-box;" placeholder="https://maps.app.goo.gl/...">
                    <button class="secondary-btn" style="padding:0 15px;" onclick="if(document.getElementById('delivery-map').value) window.open(document.getElementById('delivery-map').value, '_blank')" title="เปิดแผนที่">
                        <span class="material-symbols-rounded">map</span>
                    </button>
                </div>
            </div>

            <div style="margin-top: 15px;">
                <label style="display:block; margin-bottom:5px; font-weight:bold;">ภาพสถานที่ส่ง (ถ้ามี):</label>
                <input type="file" id="delivery-image-input" accept="image/*" style="display:none;">
                <div id="delivery-image-preview" style="width: 100%; min-height: 120px; border: 2px dashed #ccc; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: #888; cursor: pointer; background-size: contain; background-repeat: no-repeat; background-position: center; overflow: hidden; position: relative;" onclick="document.getElementById('delivery-image-input').click()">
                    <div id="delivery-image-placeholder" style="text-align: center; pointer-events: none;">
                        <span class="material-symbols-rounded" style="font-size: 32px; display: block;">add_a_photo</span>
                        <span style="font-size: 14px;">แตะเพื่อเพิ่มรูปภาพ</span>
                    </div>
                </div>
            </div>

            <div style="display:flex; gap:10px; margin-top:20px;">
                <button class="secondary-btn" style="flex:1;" onclick="App.closeModals()">ยกเลิก</button>
                <button class="primary-btn" style="flex:1; background:#1da1f2;" id="btn-share-delivery" title="แชร์/คัดลอก ข้อมูลจัดส่ง"><span class="material-symbols-rounded" style="vertical-align:middle; font-size:18px;">share</span> แชร์</button>
                <button class="primary-btn" style="flex:2;" id="btn-confirm-delivery">เริ่มออเดอร์</button>
            </div>
        `;

        overlay.classList.remove('hidden');
        modal.classList.remove('hidden');

        const dateToggle = document.getElementById('delivery-date-toggle');
        const dateContainer = document.getElementById('delivery-date-container');
        const dateInput = document.getElementById('delivery-date');

        dateToggle.addEventListener('change', (e) => {
            if (e.target.checked) {
                dateContainer.style.display = 'block';
            } else {
                dateContainer.style.display = 'none';
                dateInput.value = ''; // Clear value when hidden
            }
        });

        document.getElementById('delivery-name').focus();

        document.getElementById('delivery-image-input').addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (ev) => {
                    uploadedDeliveryImage = ev.target.result;
                    const preview = document.getElementById('delivery-image-preview');
                    const placeholder = document.getElementById('delivery-image-placeholder');
                    preview.style.backgroundImage = `url(${ev.target.result})`;
                    placeholder.style.display = 'none';
                };
                reader.readAsDataURL(file);
            }
        });

        const shareBtn = document.getElementById('btn-share-delivery');
        if (shareBtn) {
            shareBtn.addEventListener('click', async () => {
                const name = document.getElementById('delivery-name').value.trim();
                const time = document.getElementById('delivery-time').value;
                const dateVal = document.getElementById('delivery-date').value;
                const addr = document.getElementById('delivery-address').value.trim();
                const mapLink = document.getElementById('delivery-map').value.trim();

                let text = `ออเดอร์ส่ง: ${name || 'ไม่ระบุชื่อ'}\nเวลา: ${time}`;
                if (dateVal) text += `\nวันที่: ${dateVal}`;
                if (addr) text += `\nที่อยู่: ${addr}`;
                if (mapLink) text += `\nแผนที่: ${mapLink}`;

                if (navigator.share) {
                    try {
                        await navigator.share({ title: 'ข้อมูลจัดส่ง', text: text });
                    } catch (err) { console.log('Share canceled', err); }
                } else {
                    navigator.clipboard.writeText(text);
                    alert('คัดลอกข้อมูลจัดส่งแล้ว');
                }
            });
        }

        document.getElementById('btn-confirm-delivery').addEventListener('click', async () => {
            const name = document.getElementById('delivery-name').value.trim();
            const dateVal = document.getElementById('delivery-date').value;
            const timeVal = document.getElementById('delivery-time').value;

            if (!name || !timeVal) {
                alert('กรุณากรอกชื่อลูกค้าและเวลานัดรับ');
                return;
            }

            // Create target Date object based on today + timeVal
            const targetDate = dateVal ? new Date(dateVal) : new Date();
            const [tHrs, tMins] = timeVal.split(':').map(Number);
            targetDate.setHours(tHrs, tMins, 0, 0);

            // If no date was selected and time is earlier than now, assume it's for tomorrow.
            if (!dateVal && targetDate < new Date()) {
                targetDate.setDate(targetDate.getDate() + 1);
            }

            // check if cart has items
            if (App.state.cart.length > 0) {
                if (!await App.confirm('ตะกร้าปัจจุบันมีสินค้า ต้องการเอาสินค้าเหล่านี้ไปเข้าออเดอร์นี้หรือไม่?\\n(ตอบ ยกเลิก เพื่อล้างตะกร้าก่อนเปิดออเดอร์)')) {
                    App.state.cart = [];
                }
            }

            const newBillId = DB.generateBillId();
            const timestamp = Date.now();

            const addr = document.getElementById('delivery-address').value.trim();
            const mapLink = document.getElementById('delivery-map').value.trim();

            const deliveryDetails = {
                address: addr,
                map: mapLink,
                image: uploadedDeliveryImage
            };

            // Park immediately
            DB.parkCart(App.state.cart, name, timestamp, newBillId, targetDate.toISOString(), deliveryDetails);

            App.state.activeBill = {
                id: newBillId,
                note: name,
                timestamp: timestamp,
                deliveryTime: targetDate.toISOString(),
                deliveryDetails: deliveryDetails // active state metadata
            };

            App.closeModals();
            App.renderCart();
            App.updateParkedBadge();
            App.renderView('pos');
            if (window.innerWidth <= 1024) App.toggleMobileCart(true);
        });
    },

    showDeliveryImage: (billId) => {
        const parkedBills = DB.getParkedCarts();
        const bill = parkedBills.find(b => b.id === billId);
        if (bill && bill.deliveryDetails && bill.deliveryDetails.image) {
            App.closeModals();
            const overlay = document.getElementById('modal-overlay');
            const modal = document.getElementById('price-check-modal');
            modal.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                    <h3 style="margin:0;">รูปสถานที่ส่ง</h3>
                    <button class="icon-btn" onclick="App.closeModals()"><span class="material-symbols-rounded">close</span></button>
                </div>
                <img src="${bill.deliveryDetails.image}" style="width:100%; max-height:70vh; object-fit:contain; border-radius:8px;">
            `;
            overlay.classList.remove('hidden');
            modal.classList.remove('hidden');
        }
    },

    shareDeliveryBill: async (billId) => {
        const parkedBills = DB.getParkedCarts();
        const bill = parkedBills.find(b => b.id === billId);
        if (!bill) return;

        const dDate = new Date(bill.deliveryTime);
        let timeStr = `${String(dDate.getHours()).padStart(2, '0')}:${String(dDate.getMinutes()).padStart(2, '0')}`;
        const today = new Date();
        if (dDate.getDate() !== today.getDate() || dDate.getMonth() !== today.getMonth()) {
            timeStr = `${dDate.getDate()}/${dDate.getMonth() + 1} ${timeStr}`;
        }

        let text = `ออเดอร์ส่ง: ${bill.note || 'ไม่ระบุชื่อ'}\nเวลา: ${timeStr}`;
        if (bill.deliveryDetails) {
            if (bill.deliveryDetails.address) text += `\nที่อยู่: ${bill.deliveryDetails.address}`;
            if (bill.deliveryDetails.map) text += `\nแผนที่: ${bill.deliveryDetails.map}`;
        }

        if (navigator.share) {
            try {
                await navigator.share({ title: 'ข้อมูลจัดส่ง', text: text });
            } catch (err) { console.log('Share canceled', err); }
        } else {
            navigator.clipboard.writeText(text);
            alert('คัดลอกข้อมูลจัดส่งแล้ว');
        }
    },

    restoreDelivery: async (billId) => {
        const parkedBills = DB.getParkedCarts();
        const bill = parkedBills.find(b => b.id === billId);
        if (!bill) return;

        if (!await App.safeReplaceCart()) return; // Silent auto-park

        // Just like tables, we leave it "parked" until checked out 
        App.state.cart = JSON.parse(JSON.stringify(bill.items)).map(item => ({ ...item, originalQty: item.qty }));
        App.state.activeBill = {
            id: bill.id,
            note: bill.note,
            timestamp: bill.timestamp,
            deliveryTime: bill.deliveryTime,
            deliveryDetails: bill.deliveryDetails || null
        };

        App.renderCart();
        App.renderView('pos');
        if (window.innerWidth <= 1024) App.toggleMobileCart(true);
    },

    cancelDeliveryBill: async (billId) => {
        const bill = DB.getParkedCarts().find(item => String(item.id) === String(billId));
        if (!bill) return;
        const total = (bill.items || []).reduce((sum, item) => sum + App.calcItemTotal(item), 0);
        const scheduled = bill.deliveryTime ? new Date(bill.deliveryTime).toLocaleString('th-TH', {
            dateStyle: 'short', timeStyle: 'short'
        }) : 'ไม่ระบุเวลา';
        const confirmed = await App.confirm(
            `ยืนยันยกเลิกออเดอร์ส่ง\nลูกค้า: ${bill.note || 'ไม่ระบุชื่อ'}\nนัด: ${scheduled}\nยอดรวม ฿${Utils.formatCurrency(total)}\n\nออเดอร์จะย้ายไปถังขยะและสามารถกู้คืนได้`,
            'ยกเลิกออเดอร์ส่ง'
        );
        if (!confirmed) return;
        App.closeBillSession(bill.id, 'cancelled');
        App.renderView('tables');
        await App.alert('ยกเลิกออเดอร์ส่งแล้ว');
    },

    handleTableClick: async (tableId) => {
        const tables = DB.getTables();
        const table = tables.find(t => t.id === tableId);
        if (!table) return;

        if (table.billId) {
            // Occupied: Handle Merging Walk-in Cart OR Show Details
            const parkedBills = DB.getParkedCarts();
            const bill = parkedBills.find(b => b.id === table.billId);
            if (bill) {
                // Smart Merge Logic: If we have a walk-in cart (no active bill), ask to merge.
                if (App.state.cart.length > 0 && App.state.activeBill === null) {
                    if (await App.confirm(`ตะกร้าปัจจุบันมีสินค้า\nต้องการนำไป "เพิ่ม" ในโต๊ะ ${table.name} หรือไม่?`)) {
                        // Merge items into table bill
                        const mergedItems = [...bill.items];
                        App.state.cart.forEach(cartItem => {
                            const existing = mergedItems.find(i => i.id === cartItem.id);
                            if (existing) {
                                existing.qty += cartItem.qty;
                            } else {
                                mergedItems.push(cartItem);
                            }
                        });
                        
                        // Update parked bill in DB
                        DB.parkCart(mergedItems, bill.note, bill.timestamp, bill.id, bill.deliveryTime, bill.deliveryDetails);
                        
                        // Clear current cart since it's merged
                        App.state.cart = [];
                        App.state.activeBill = null;
                        App.renderCart();
                        App.updateParkedBadge();
                        
                        if (typeof App.alert === 'function') {
                            App.alert(`เพิ่มรายการเข้าโต๊ะ ${table.name} สำเร็จ`);
                        }
                    } else {
                        // User declined merge, so silently park the walk-in cart and view table
                        await App.safeReplaceCart();
                        App.showTableDetailsModal(table, bill);
                    }
                } else {
                    // No walk-in cart, or it's another table's cart. Silently park and show details.
                    if (App.state.cart.length > 0) {
                        await App.safeReplaceCart();
                    }
                    App.showTableDetailsModal(table, bill);
                }
            } else {
                // Orphaned table state (bill deleted or checked out)
                table.billId = null;
                DB.saveTables(tables);
                App.renderTablesView(App.elements.viewContainer);
            }
        } else {
            // Empty table: Initialize new bill
            const customerName = await App.prompt('ชื่อลูกค้า / หมายเหตุ (เปิดโต๊ะใหม่):');
            if (customerName === null) return; // cancelled

            if (App.state.cart.length > 0) {
                if (App.state.activeBill === null) {
                   if (!await App.confirm(`ตะกร้าปัจจุบันมีสินค้า\nต้องการนำไปเปิด "โต๊ะใหม่" นี้หรือไม่?`)) {
                       await App.safeReplaceCart(); // Auto-park silently
                   }
                } else {
                   // Another table's cart, silently auto-park to avoid confusion
                   await App.safeReplaceCart();
                }
            }

            const newBillId = DB.generateBillId();
            const timestamp = Date.now();

            table.billId = newBillId;
            DB.saveTables(tables);
            DB.parkCart(App.state.cart, customerName, timestamp, newBillId);

            // Set as active session
            App.state.activeBill = {
                id: newBillId,
                note: customerName,
                timestamp: timestamp
            };
            App.renderTablesView(App.elements.viewContainer);
            App.renderCart();
            App.renderView('pos');
            if (window.innerWidth <= 1024) App.toggleMobileCart(true);
        }
    },

    editTableName: async (tableId, currentName) => {
        const newName = await App.prompt('แก้ไขชื่อลูกค้า / หมายเหตุ:', currentName);
        if (newName !== null) {
            const tables = DB.getTables();
            const table = tables.find(t => t.id === tableId);
            if (table && table.billId) {
                DB.updateParkedNote(table.billId, newName);

                // If it's currently active in POS, update the active state too
                if (App.state.activeBill && App.state.activeBill.id === table.billId) {
                    App.state.activeBill.note = newName;
                    App.renderCart();
                }

                App.renderTablesView(App.elements.viewContainer);
            }
        }
    },

    showTableDetailsModal: (table, bill) => {
        App.closeModals();
        const overlay = document.getElementById('modal-overlay');
        const modal = document.getElementById('table-detail-modal');

        const itemCount = bill.items.length;
        const billTotal = bill.items.reduce((sum, item) => sum + (item.price * item.qty), 0);

        modal.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px; border-bottom: 1px solid #eee; padding-bottom: 10px;">
                <h3 style="margin:0; font-size: 20px;">${table.name}</h3>
                <button class="icon-btn" onclick="App.closeModals()"><span class="material-symbols-rounded">close</span></button>
            </div>
            
            <div style="margin-bottom: 15px;">
                <div style="font-weight: bold; color: var(--primary-color); font-size: 16px;">ลูกค้า: ${bill.note || 'ไม่มีชื่อ'}</div>
                <div style="font-size: 14px; color: #666; margin-top: 5px;">รายการอาหาร (${itemCount} รายการ)</div>
            </div>
            
            <div style="max-height: 250px; overflow-y: auto; background: #f9f9f9; padding: 10px; border-radius: 8px; margin-bottom: 15px;">
                ${bill.items.length > 0 ? bill.items.map(item => `
                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 14px; border-bottom: 1px dashed #ddd; padding-bottom: 5px;">
                        <span style="flex: 1; word-break: break-word; padding-right: 10px;">${item.qty}x ${Utils.escapeHTML(item.name)}</span>
                        <span style="font-weight: bold; white-space: nowrap;">฿${Utils.formatCurrency(item.qty * item.price)}</span>
                    </div>
                `).join('') : '<div style="text-align: center; color: #999;">ไม่มีรายการ</div>'}
            </div>
            
            <div style="display: flex; justify-content: space-between; align-items: center; font-size: 20px; font-weight: bold; margin-bottom: 20px;">
                <span>ยอดรวม</span>
                <span style="color: var(--danger-color);">฿${Utils.formatCurrency(billTotal)}</span>
            </div>
            
            <div style="display: flex; flex-direction: column; gap: 10px;">
                <button class="primary-btn" onclick="App.loadTableAndGoToPos(${table.id})" style="width: 100%; display: flex; align-items: center; justify-content: center; gap: 8px;">
                    <span class="material-symbols-rounded">add_circle</span> สั่งอาหารเพิ่ม
                </button>
                <button class="primary-btn" onclick="App.checkoutTableDirectly(${table.id})" style="width: 100%; display: flex; align-items: center; justify-content: center; gap: 8px; background: #4caf50;">
                    <span class="material-symbols-rounded">payments</span> เช็คบิล / รับเงิน
                </button>
                <button class="secondary-btn" onclick="App.cancelTableBill(${table.id})" style="width:100%; color:#c62828; border-color:#ef9a9a; display:flex; align-items:center; justify-content:center; gap:8px;">
                    <span class="material-symbols-rounded">delete</span> ยกเลิกและล้างบิลโต๊ะ
                </button>
            </div>
        `;

        overlay.classList.remove('hidden');
        modal.classList.remove('hidden');
    },

    loadTableAndGoToPos: async (tableId) => {
        const tables = DB.getTables();
        const table = tables.find(t => t.id === tableId);
        if (!table || !table.billId) return;

        const parkedBills = DB.getParkedCarts();
        const bill = parkedBills.find(b => b.id === table.billId);
        if (!bill) return;

        if (!await App.safeReplaceCart()) return; // Silent auto-park

        App.state.cart = JSON.parse(JSON.stringify(bill.items)).map(item => ({ ...item, originalQty: item.qty }));
        App.state.activeBill = {
            id: bill.id,
            note: bill.note,
            timestamp: bill.timestamp
        };

        App.closeModals();
        App.renderCart();
        App.renderView('pos');
        if (window.innerWidth <= 1024) App.toggleMobileCart(true);
    },

    checkoutTableDirectly: async (tableId) => {
        // Load table to cart, then directly open payment modal
        const tables = DB.getTables();
        const table = tables.find(t => t.id === tableId);
        if (!table || !table.billId) return;

        const parkedBills = DB.getParkedCarts();
        const bill = parkedBills.find(b => b.id === table.billId);
        if (!bill) return;

        if (!await App.safeReplaceCart()) return; // Silent auto-park

        App.state.cart = JSON.parse(JSON.stringify(bill.items)).map(item => ({ ...item, originalQty: item.qty }));
        App.state.activeBill = {
            id: bill.id,
            note: bill.note,
            timestamp: bill.timestamp
        };

        App.closeModals();
        App.renderCart();
        App.renderView('pos');

        // Ensure total is recalculated before showing payment modal
        const total = App.state.cart.reduce((sum, item) => sum + App.calcItemTotal(item), 0);
        if (total > 0) {
            App.showPaymentModal();
        }
    },

    cancelTableBill: async (tableId) => {
        const tables = DB.getTables();
        const table = tables.find(item => item.id === tableId);
        if (!table?.billId) return;
        const bill = DB.getParkedCarts().find(item => String(item.id) === String(table.billId));
        const total = (bill?.items || []).reduce((sum, item) => sum + App.calcItemTotal(item), 0);
        const confirmed = await App.confirm(
            `ยืนยันยกเลิกบิล ${table.name}\n${bill?.note ? `ลูกค้า: ${bill.note}\n` : ''}ยอดรวม ฿${Utils.formatCurrency(total)}\n\nบิลจะออกจากโต๊ะและย้ายไปถังขยะเพื่อให้กู้คืนได้`,
            'ยกเลิกบิลโต๊ะ'
        );
        if (!confirmed) return;
        App.closeBillSession(table.billId, 'cancelled');
        App.closeModals();
        App.renderView('tables');
        await App.alert(`ล้างบิล ${table.name} แล้ว`);
    },

    // --- Price Check ---
    addPriceCheckItem: (product, isPack = false) => {
        const qty = isPack ? (Number(product.wholesaleQty || product.unitsPerBox) || 1) : 1;
        const existing = App.state.priceCheckCart.find(item => item.id === product.id);
        if (existing) existing.qty += qty;
        else App.state.priceCheckCart.push({ ...product, qty });
    },

    updatePriceCheckItem: (productId, change) => {
        const item = App.state.priceCheckCart.find(entry => entry.id === productId);
        if (!item) return;
        item.qty += change;
        if (item.qty <= 0) App.state.priceCheckCart = App.state.priceCheckCart.filter(entry => entry.id !== productId);
        const product = App.state.products.find(entry => entry.id === productId) || item;
        App.showScannerPriceResult(product, product.barcode || 'รายการด่วน');
    },

    clearPriceCheckCart: () => {
        App.state.priceCheckCart = [];
        App.closeModals();
    },

    startPriceCheckCheckout: async () => {
        if (!App.state.priceCheckCart.length) return;
        App.state.cart = App.state.priceCheckCart.map(item => ({ ...item }));
        App.state.priceCheckCart = [];
        await DB.saveSettings({ scannerPriceCheckMode: false });
        App.updateScannerPriceCheckButton();
        await App.releasePriceCheckWakeLock();
        App.renderCart();
        App.showPaymentModal();
    },

    showScannerPriceResult: (product, barcode, options = {}) => {
        App.closeModals();
        const overlay = document.getElementById('modal-overlay');
        const modal = document.getElementById('price-check-modal');
        const unitLabel = product.unitLabel || 'ชิ้น';
        const stock = Number(product.stock) || 0;
        const packQty = Number(product.wholesaleQty || product.unitsPerBox) || 1;
        const isPack = options.isPack === true;
        const price = isPack
            ? (Number(product.wholesalePrice) > 0 ? Number(product.wholesalePrice) : Number(product.price || 0) * packQty)
            : Number(product.price) || 0;
        const priceLabel = isPack ? `ราคาลัง/แพ็ก (${packQty} ${unitLabel})` : `ราคาต่อ ${unitLabel}`;
        const imageHtml = product.image
            ? `<img src="${product.image}" alt="รูป ${Utils.escapeHTML(product.name)}">`
            : '<span class="material-symbols-rounded">inventory_2</span>';
        const quickItem = App.state.priceCheckCart.find(item => item.id === product.id);
        const quickQty = quickItem?.qty || 0;
        const quickCount = App.state.priceCheckCart.reduce((sum, item) => sum + item.qty, 0);
        const quickTotal = App.state.priceCheckCart.reduce((sum, item) => sum + App.calcItemTotal(item), 0);

        modal.className = 'modal scanner-price-result';
        modal.innerHTML = `
            <div class="scanner-price-mode-badge">
                <span class="material-symbols-rounded">price_check</span>
                โหมดเช็กราคา · ไม่เข้าบิล
            </div>
            <button class="scanner-price-close" type="button" onclick="App.closeModals()" aria-label="ปิด">
                <span class="material-symbols-rounded">close</span>
            </button>
            <div class="scanner-price-image">${imageHtml}</div>
            <div class="scanner-price-body">
                <div class="scanner-price-name">${Utils.escapeHTML(product.name)}</div>
                <div class="scanner-price-code">อ่านได้: ${Utils.escapeHTML(barcode)}</div>
                <div class="scanner-price-label">${priceLabel}</div>
                <div class="scanner-price-value">฿${Utils.formatCurrency(price)}</div>
                <div class="scanner-price-facts">
                    <span class="${stock <= 0 ? 'danger' : ''}">คงเหลือ ${stock} ${unitLabel}</span>
                    ${packQty > 1 ? `<span>ประมาณ ${Math.floor(stock / packQty)} กล่อง ${stock % packQty} ${unitLabel}</span>` : ''}
                    ${product.location ? `<span>จุดวาง: ${Utils.escapeHTML(product.location)}</span>` : ''}
                </div>
                <div class="scanner-price-quick-bill">
                    <div><small>รายการนี้</small><strong>${quickQty} ${unitLabel}</strong></div>
                    <div class="scanner-price-stepper">
                        <button type="button" onclick="App.updatePriceCheckItem('${product.id}', -1)" aria-label="ลดจำนวน">−</button>
                        <button type="button" onclick="App.updatePriceCheckItem('${product.id}', 1)" aria-label="เพิ่มจำนวน">+</button>
                    </div>
                    <div class="scanner-price-total"><small>${quickCount} ชิ้น · ยอดรวม</small><strong>฿${Utils.formatCurrency(quickTotal)}</strong></div>
                </div>
                <div class="scanner-price-actions">
                    <button type="button" class="scanner-price-reset" onclick="App.clearPriceCheckCart()">เริ่มยอดใหม่</button>
                    <button type="button" class="primary-btn" onclick="App.startPriceCheckCheckout()">รับเงิน</button>
                </div>
                <div class="scanner-price-ready"><span class="material-symbols-rounded">barcode_scanner</span> พร้อมสแกนชิ้นต่อไป</div>
            </div>`;
        overlay.classList.remove('hidden');
        modal.classList.remove('hidden');
    },

    showScannerPriceNotFound: (barcode) => {
        App.closeModals();
        const overlay = document.getElementById('modal-overlay');
        const modal = document.getElementById('price-check-modal');
        modal.className = 'modal scanner-price-result scanner-price-not-found';
        modal.innerHTML = `
            <div class="scanner-price-mode-badge"><span class="material-symbols-rounded">price_check</span> โหมดเช็กราคา · ไม่เข้าบิล</div>
            <button class="scanner-price-close" type="button" onclick="App.closeModals()" aria-label="ปิด"><span class="material-symbols-rounded">close</span></button>
            <div class="scanner-price-image"><span class="material-symbols-rounded">barcode_off</span></div>
            <div class="scanner-price-body">
                <div class="scanner-price-name">ไม่พบสินค้าในสต็อก</div>
                <div class="scanner-price-code">อ่านได้: ${Utils.escapeHTML(barcode)}</div>
                <div class="scanner-price-ready"><span class="material-symbols-rounded">barcode_scanner</span> สแกนใหม่ได้ทันที</div>
            </div>`;
        overlay.classList.remove('hidden');
        modal.classList.remove('hidden');
    },

    showPriceCheckModal: () => {
        App.closeModals(); // Prevent Overlap
        const overlay = document.getElementById('modal-overlay');
        const modal = document.getElementById('price-check-modal');
        modal.innerHTML = `
            <div style="text-align:center;">
                <span class="material-symbols-rounded" style="font-size:64px; color:var(--secondary-color);">price_check</span>
                <h2>เช็คราคาสินค้า</h2>
                <p>ยิงบาร์โค้ด หรือ พิมพ์ค้นหา</p>
                <input type="text" id="check-input" style="font-size:24px; padding:10px; width:100%; text-align:center; margin-top:20px;" autofocus placeholder="รหัสสินค้า">
                <div id="check-result" style="margin-top:20px; min-height:100px;"></div>
                <button class="secondary-btn" style="width:100%; margin-top:20px;" onclick="App.closeModals()">ปิด</button>
            </div>
`;
        overlay.classList.remove('hidden');
        modal.classList.remove('hidden');

        const input = document.getElementById('check-input');
        const result = document.getElementById('check-result');
        input.focus();

        // Blur global search to avoid conflict
        App.elements.globalSearch.blur();

        let timeout;
        input.addEventListener('input', (e) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => {
                const val = e.target.value;
                if (!val) { result.innerHTML = ''; return; }

                const match = DB.getProductByBarcode(val);
                const product = match ? match.product : App.state.products.find(p => p.name.includes(val));

                if (product) {
                    result.innerHTML = `
                        <div style="font-size:24px; font-weight:bold;">${Utils.escapeHTML(product.name)}</div>
                        ${product.image && product.image.startsWith('data:image/') ? '<img src="' + Utils.escapeHTML(product.image) + '" style="max-height:100px; margin:10px 0;" alt="">' : ''}
                        <div style="font-size:48px; color:var(--primary-color);">฿${Utils.formatCurrency(product.price)}</div>
                        <div style="color:${product.stock < 5 ? 'red' : 'gray'}">คงเหลือ: ${product.stock}</div>
`;
                    input.value = '';
                } else {
                    if (val.length > 8) result.innerHTML = '<div style="color:red; font-size:20px;">ไม่พบสินค้า</div>';
                }
            }, 300);
        });
    },

    closeModals: () => {
        document.getElementById('modal-overlay').classList.add('hidden');
        document.querySelectorAll('.modal').forEach(m => {
            m.classList.add('hidden');
            if (m.id !== 'security-modal' && m.id !== 'confirmation-modal' && m.id !== 'table-detail-modal') {
                m.innerHTML = '';
            }
        });
    },

    // --- APPROVALS VIEW ---
    renderApprovalsView: async (container) => {
        container.innerHTML = `<div style="padding:20px;"><h2>รายการรออนุมัติ</h2><p>กำลังโหลดข้อมูล...</p></div>`;
        if (typeof dbFirestore === 'undefined' || !dbFirestore) {
            container.innerHTML = `<div style="padding:20px;"><h2>รายการรออนุมัติ</h2><p>ไม่ได้เชื่อมต่อคลาวด์</p></div>`;
            return;
        }

        try {
            const snapshot = await dbFirestore.collection('pending_approvals').orderBy('timestamp', 'desc').get();
            if (snapshot.empty) {
                container.innerHTML = `<div style="padding:20px;"><h2>รายการรออนุมัติ</h2><p>ไม่มีรายการรออนุมัติ</p></div>`;
                return;
            }

            let html = `<div style="padding:20px;"><h2>รายการรออนุมัติ</h2>
                <div style="display:flex; flex-direction:column; gap:15px; margin-top:20px;">`;

            snapshot.forEach(doc => {
                const data = doc.data();
                const typeText = data.type === 'EDIT_PRICE' ? 'ขอแก้ไขราคา' : 'ขอเพิ่มสินค้าใหม่';
                
                html += `<div style="background:white; padding:15px; border-radius:8px; box-shadow:var(--shadow-sm); display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <div style="font-weight:bold; font-size:16px;">${typeText} - ${data.data.name}</div>
                        <div style="color:#666; font-size:14px; margin-top:5px;">
                            ${data.type === 'EDIT_PRICE' ? `ขอเปลี่ยนจาก <b>${data.data.oldPrice}</b> เป็น <b>${data.data.newPrice}</b> บาท` : `เพิ่มสินค้าบาร์โค้ด: ${data.data.barcode} ราคา: ${data.data.price}`}
                        </div>
                        <div style="color:#999; font-size:12px; margin-top:5px;">โดยพนักงาน: ${data.requestedBy}</div>
                    </div>
                    <div style="display:flex; gap:10px;">
                        <button class="primary-btn" onclick="App.approvePending('${doc.id}')" style="padding:8px 15px;">อนุมัติ</button>
                        <button class="secondary-btn" onclick="App.rejectPending('${doc.id}')" style="padding:8px 15px; border-color:#ffcdd2; color:#d32f2f;">ปฏิเสธ</button>
                    </div>
                </div>`;
            });

            html += `</div></div>`;
            container.innerHTML = html;

        } catch (e) {
            console.error(e);
            container.innerHTML = `<div style="padding:20px;"><h2>รายการรออนุมัติ</h2><p>เกิดข้อผิดพลาดในการโหลดข้อมูล: ${e.message}</p></div>`;
        }
    },

    approvePending: async (docId) => {
        if (!confirm("ยืนยันการอนุมัติคำขอนี้ใช่หรือไม่?")) return;
        try {
            const docRef = dbFirestore.collection('pending_approvals').doc(docId);
            const doc = await docRef.get();
            if (doc.exists) {
                const req = doc.data();
                if (req.type === 'EDIT_PRICE') {
                    const products = DB.getProducts();
                    const idx = products.findIndex(p => p.id === req.data.id);
                    if (idx >= 0) {
                        products[idx].price = req.data.newPrice;
                        DB.saveProduct(products[idx]);
                    }
                } else if (req.type === 'ADD_PRODUCT') {
                    DB.saveProduct(req.data);
                }
                await docRef.delete();
                App.alert("อนุมัติสำเร็จ!");
                App.renderApprovalsView(document.getElementById('view-container'));
            }
        } catch (e) {
            App.alert("เกิดข้อผิดพลาด: " + e.message);
        }
    },

    rejectPending: async (docId) => {
        if (!confirm("ต้องการปฏิเสธและลบคำขอนี้ทิ้งใช่หรือไม่?")) return;
        try {
            await dbFirestore.collection('pending_approvals').doc(docId).delete();
            App.alert("ลบคำขอสำเร็จ!");
            App.renderApprovalsView(document.getElementById('view-container'));
        } catch (e) {
            App.alert("เกิดข้อผิดพลาด: " + e.message);
        }
    },

    checkDeliveryAlerts: () => {
        const parkedBills = DB.getParkedCarts();
        const deliveryBills = parkedBills.filter(b => b.deliveryTime);
        if (deliveryBills.length === 0) return;

        let hasUrgent = false;
        let hasOverdue = false;

        deliveryBills.forEach(bill => {
            const timeDiff = new Date(bill.deliveryTime) - new Date();
            const minsLeft = Math.floor(timeDiff / 60000);

            if (minsLeft < 0) hasOverdue = true;
            else if (minsLeft <= 15) hasUrgent = true;
        });

        // Flash or alert based on severity
        const tablesNavBtn = document.querySelector('[data-view="tables"]');
        if (tablesNavBtn) {
            // Remove old classes
            tablesNavBtn.classList.remove('alert-urgent', 'alert-overdue');

            if (hasOverdue) {
                tablesNavBtn.classList.add('alert-overdue');
                // Optional: Play sound or show toast
            } else if (hasUrgent) {
                tablesNavBtn.classList.add('alert-urgent');
            }
        }
    }
};

// Global expose
window.App = App;

// EMERGENCY FIX: Robust Touch/Click Handler
window.handleParkInteraction = function (e) {
    // Critical: Prevent ghost clicks if touch fired
    if (e && e.type === 'touchstart') {
        e.preventDefault(); // Prevents mouse emulation
    }
    if (e && e.stopPropagation) e.stopPropagation();

    console.log('Park Interaction:', e ? e.type : 'manual');

    // 1. Force Close All Overlays (The "Nuclear" Close)
    const overlay = document.getElementById('modal-overlay');
    if (overlay) overlay.classList.add('hidden');

    document.querySelectorAll('.modal').forEach(m => {
        m.classList.add('hidden');
    });

    const cartPanel = document.getElementById('right-panel');
    const mobileOverlay = document.getElementById('mobile-cart-overlay');
    if (cartPanel) cartPanel.classList.remove('open');
    if (mobileOverlay) mobileOverlay.style.display = 'none';

    // 2. Trigger Logic Securely
    setTimeout(() => {
        // EMERGENCY POLYFILL: Force Utils.timeAgo if missing (Fixes Caching Issues)
        if (typeof Utils !== 'undefined' && !Utils.timeAgo) {
            console.warn('Polyfilling Utils.timeAgo');
            Utils.timeAgo = (timestamp) => {
                const seconds = Math.floor((new Date() - new Date(timestamp)) / 1000);
                if (seconds < 60) return Math.floor(seconds) + " วินาทีที่แล้ว";
                const minutes = Math.floor(seconds / 60);
                if (minutes < 60) return minutes + " นาทีที่แล้ว";
                const hours = Math.floor(minutes / 60);
                if (hours < 24) return hours + " ชม. ที่แล้ว";
                return Math.floor(hours / 24) + " วันที่แล้ว";
            };
        }

        if (typeof App !== 'undefined' && App.showParkedCartsModal) {
            App.showParkedCartsModal();
        } else {
            console.error('App not ready');
            window.location.reload();
        }
    }, 50);
};

document.addEventListener('DOMContentLoaded', App.init);
