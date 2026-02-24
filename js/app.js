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
        stockSort: { column: 'name', direction: 'asc' }, // New Sorting State
        salesReport: {
            startDate: new Date().toISOString().split('T')[0], // Default Today
            endDate: new Date().toISOString().split('T')[0]
        }
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
            // Load Data
            App.state.products = DB.getProducts();
            App.updateParkedBadge();

            // Setup Event Listeners
            App.setupNavigation();
            App.setupGlobalInput();
            App.setupCartActions();

            // Initial Render
            App.renderView('pos');
            App.startClock();

            // Set Global Version Display
            const versionEl = document.getElementById('app-version-display');
            if (versionEl) versionEl.textContent = 'v' + App.VERSION;

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
            App.renderSettingsView(container);
        } else if (viewName === 'sales') {
            App.renderSalesView(container);
        }
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
                                ${sale.items.length} รายการ
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
            <div style="display:flex; justify-content:space-between; color:#666; font-size:14px; margin-bottom:15px;">
                <span>${new Date(sale.date).toLocaleString('th-TH')}</span>
                <span style="font-weight:bold;">${sale.billId}</span>
            </div>
            
            <div style="max-height:300px; overflow-y:auto; border-top:1px solid #eee; border-bottom:1px solid #eee; padding:10px 0;">
                <table style="width:100%;">
                    ${sale.items.map(item => `
                        <tr>
                            <td style="padding:5px 0;">${item.name} <span style="font-size:12px; color:#999;">x${item.qty}</span></td>
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

        // 2. Load to Cart
        App.state.cart = JSON.parse(JSON.stringify(sale.items)); // Deep copy
        App.state.editingBillId = sale.billId;
        App.state.editingSaleDate = sale.date;

        // 3. Switch View
        App.renderCart();
        App.closeModals();
        App.renderView('pos');

        await App.alert(`โหลดบิล ${billId} เรียบร้อย\nแก้ไขรายการแล้วกด "ชำระเงิน" เพื่อบันทึกทับบิลเดิม`);
    },

    VERSION: '0.89.23', // Update Version

    // --- Settings View ---
    renderSettingsView: (container) => {
        const settings = DB.getSettings();
        container.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:flex-end;">
                <h2>ตั้งค่าระบบ</h2>
                <div style="font-size:14px; color:#888; margin-bottom:5px;">เวอร์ชัน ${App.VERSION}</div>
            </div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:20px; margin-top:20px;">
                <!-- Store Config -->
                <div style="background:white; padding:20px; border-radius:8px; box-shadow:var(--shadow-sm);">
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
                <div style="background:white; padding:20px; border-radius:8px; box-shadow:var(--shadow-sm);">
                    <h3>ความปลอดภัย</h3>
                    <div style="margin-bottom:15px;">
                        <label>เปลี่ยนรหัสผ่าน (PIN)</label>
                        <input type="password" id="set-new-pin" placeholder="รหัสใหม่ 4 หลัก" maxlength="4" style="width:100%; padding:10px; font-size:18px; letter-spacing:2px; margin-top:5px;">
                    </div>
                    <button class="secondary-btn" onclick="App.changePin()">เปลี่ยนรหัสผ่าน</button>
                </div>
                <!-- Backup -->
                <div style="background:white; padding:20px; border-radius:8px; box-shadow:var(--shadow-sm); text-align:center;">
                    <span class="material-symbols-rounded" style="font-size:48px; color:var(--primary-color);">cloud_download</span>
                    <h3>สำรองข้อมูล</h3>
                    <button class="primary-btn" onclick="App.backupData()">Download Backup</button>
                </div>
                <!-- Restore -->
                <div style="background:white; padding:20px; border-radius:8px; box-shadow:var(--shadow-sm); text-align:center;">
                    <span class="material-symbols-rounded" style="font-size:48px; color:var(--warning-color);">cloud_upload</span>
                    <h3>เรียกคืนข้อมูล</h3>
                    <input type="file" id="restore-input" accept=".json" style="display:none;" onchange="App.restoreData(this)">
                    <button class="secondary-btn" onclick="document.getElementById('restore-input').click()">Upload Backup</button>
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
                    <div style="flex:1; min-width:300px;">
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
                    <div style="flex:1; min-width:300px;">
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
            DB.saveSettings(settings);

            await App.alert('บันทึกข้อมูลร้านเรียบร้อยแล้ว!');
            App.renderSettingsView(document.getElementById('view-container'));
        });
    },

    changePin: () => {
        const newPin = document.getElementById('set-new-pin').value;
        if (!/^\d{4}$/.test(newPin)) {
            App.alert('รหัสผ่านต้องเป็นตัวเลข 4 หลัก');
            return;
        }
        App.checkPin(async () => {
            DB.saveSettings({ pin: newPin });
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
                updates.logo = await Utils.fileToBase64(logoInput.files[0]);
            }
            if (qrInput.files[0]) {
                updates.qrCode = await Utils.fileToBase64(qrInput.files[0]);
            }

            DB.saveSettings(updates);
            await App.alert('บันทึกตั้งค่าเครื่องพิมพ์เรียบร้อย!');
            App.renderView('settings');
        } catch (e) {
            await App.alert('เกิดข้อผิดพลาดในการบันทึกภาพ (อาจใหญ่เกินไป): ' + e.message);
        }
    },

    handleGroupImageUpload: (input, groupName) => {
        if (input.files && input.files[0]) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const base64 = e.target.result;
                DB.setGroupImage(groupName, base64);
                App.renderView('settings'); // Re-render to show new image
            };
            reader.readAsDataURL(input.files[0]);
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
            const base64 = await Utils.fileToBase64(input.files[0]);
            const preview = document.getElementById(previewId);
            if (preview) {
                preview.innerHTML = `<img src="${base64}" style="width:100%; height:100%; object-fit:contain;">`;
            }
        }
    },

    clearImage: async (type) => {
        if (!await App.confirm('ต้องการลบรูปภาพนี้ใช่หรือไม่?')) return;

        const updates = {};
        updates[type] = null;
        DB.saveSettings(updates);
        App.renderView('settings');
    },

    restoreData: (input) => {
        const file = input.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (e) => {
            const result = DB.importData(e.target.result);
            if (result.success) {
                await App.alert('กู้คืนข้อมูลสำเร็จ!');
                location.reload();
            } else {
                await App.alert('เกิดข้อผิดพลาด: ' + result.message);
            }
        };
        reader.readAsText(file);
    },

    // --- POS View ---
    renderPOSView: (container) => {
        container.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <h2>ขายสินค้า</h2>
                <button class="secondary-btn" style="display:flex; align-items:center; gap:5px;" onclick="App.showManualEntryModal()">
                    <span class="material-symbols-rounded">edit_square</span> พิมพ์รายการเอง
                </button>
            </div>
            <div class="product-grid" id="product-grid">
                <!-- Products will be injected here -->
            </div>
        `;
        App.renderProductGrid();
    },

    renderProductGrid: () => {
        const grid = document.getElementById('product-grid');
        if (!grid) return;

        let displayProducts = App.state.products;
        if (App.state.searchQuery) {
            const query = App.state.searchQuery.toLowerCase();
            displayProducts = displayProducts.filter(p =>
                (p.name && p.name.toLowerCase().includes(query)) ||
                (p.barcode && p.barcode.includes(query)) ||
                (p.packBarcode && p.packBarcode.includes(query)) ||
                (p.group && p.group.toLowerCase().includes(query))
            );
        }

        // Aggregate by Group
        const groups = {};
        const singles = [];

        displayProducts.forEach(p => {
            if (p.group) {
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
        const singleHtml = singles.map(p => {
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

            return `
            <div class="product-card" onclick="App.addToCart(App.state.products.find(x => x.id === '${p.id}'))" style="${p.tags && p.tags.includes('promo') ? 'border:2px solid var(--danger-color);' : ''}">
                ${displayStock <= 5 ? '<div class="stock-badge low">Low Stock</div>' : ''}
                ${badgeHtml}
                <div style="height:120px; background:#f0f0f0; display:flex; align-items:center; justify-content:center; overflow:hidden;">
                    ${p.image ? `<img src="${p.image}" style="width:100%; height:100%; object-fit:cover;">` : '<span class="material-symbols-rounded" style="font-size:48px; color:#ccc;">image</span>'}
                </div>
                <div class="p-info">
                    <div class="p-name">${p.name}</div>
                    <div class="p-price">฿${Utils.formatCurrency(p.price)}</div>
                    <div class="p-stock">${displayStock} ชิ้น</div>
                    ${p.wholesaleQty > 0 ? `
                    <div style="font-size:10px; color:#888; text-align:center; margin-top:2px;">
                        (${Math.floor(displayStock / p.wholesaleQty)} ลัง ${displayStock % p.wholesaleQty} ชิ้น)
                    </div>
                    ` : ''}
                </div>
            </div>
            `;
        }).join('');

        grid.innerHTML = groupHtml + singleHtml;
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

        container.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <h2>จัดการสต็อก</h2>
                <div style="text-align:right;">
                    <button class="primary-btn" onclick="App.openProductModal()">+ เพิ่มสินค้า</button>
                </div>
            </div>
            
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
                <button class="filter-btn ${App.state.stockTab === 'groups' ? 'active' : ''}" onclick="App.setStockTab('groups')">แยกหมวดหมู่</button>
            </div>

            <div style="margin-top:10px; overflow-x:auto;">
                ${App.state.stockTab === 'groups' ? App.renderStockGroups(products) : App.renderStockTable(products)}
            </div>
        `;
    },

    setStockTab: (tab) => {
        App.state.stockTab = tab;
        App.renderView('stock');
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

        return `
            <div style="padding-bottom:20px;">
                <!-- Scroll Hint -->
                <div style="font-size:10px; color:#999; text-align:right; margin-bottom:5px; display:flex; align-items:center; justify-content:flex-end; gap:4px;">
                    <span class="material-symbols-rounded" style="font-size:12px;">arrow_forward</span> เลื่อนขวาเพื่อจัดการ
                </div>
                
                <div style="overflow-x:auto; -webkit-overflow-scrolling:touch; border-radius:8px; border:1px solid #eee; background:white;">
                    <table style="width:100%; min-width:600px; border-collapse:collapse; overflow:hidden;">
                    <thead>
                        <tr style="background:var(--neutral-100); text-align:left; font-size:13px; color:#666;">
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
                                <tr style="border-bottom:1px solid #eee;">
                                    <td style="padding:10px;">
                                        <div style="display:flex; align-items:center; gap:10px;">
                                            <div style="width:36px; height:36px; background:#eee; border-radius:4px; overflow:hidden; flex-shrink:0;">
                                                ${p.image ? `<img src="${p.image}" style="width:100%; height:100%; object-fit:cover;">` : ''}
                                            </div>
                                            <div style="min-width:0;">
                                                <div style="font-weight:bold; font-size:14px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${p.name}</div>
                                                <div style="font-size:11px; color:#888;">${p.barcode}</div>
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
                                            ${p.stock} ชิ้น
                                        </span>
                                        ${p.wholesaleQty > 0 ? `
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
                <p style="color:#666; margin-bottom:15px;">สินค้า: <strong>${product.name}</strong></p>
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
            DB.saveProducts(App.state.products); // Save to DB
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
                            <td style="padding:10px;">${product.name}</td>
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
                        <label>บาร์โค้ด (Scan หรือ พิมพ์)</label>
                        <div style="display:flex; gap:5px;">
                            <input type="text" id="p-barcode" value="${product ? product.barcode : ''}" required style="flex:1;">
                            <button type="button" class="secondary-btn" onclick="document.getElementById('p-barcode').focus()">Scan</button>
                        </div>
                    </div>
                     <div style="flex: 1 1 200px;">
                        <label>หมวดหมู่ (ปล่อยว่างถ้าไม่มี)</label>
                        <input type="text" id="p-group" list="group-list" value="${product && product.group ? product.group : ''}" 
                            placeholder="เช่น น้ำอัดลม, ไข่ไก่" style="width:100%;">
                        <datalist id="group-list">
                            ${existingGroups.map(g => `<option value="${g}">`).join('')}
                        </datalist>
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

                        <div>
                            <label>รูปภาพ</label>
                            <div style="display:flex; gap:10px; align-items:center;">
                                <div id="p-image-preview" style="width:60px; height:60px; background:#eee; border-radius:8px; overflow:hidden; flex-shrink:0;">
                                    ${product && product.image ? `<img src="${product.image}" style="width:100%;height:100%;object-fit:cover;">` : ''}
                                </div>
                                <input type="file" id="p-image-input" accept="image/*" style="width:100%;">
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
                    const base64 = await Utils.fileToBase64(e.target.files[0]);
                    preview.innerHTML = `<img src="${base64}" style="width:100%;height:100%;object-fit:cover;">`;
                    preview.dataset.base64 = base64;
                }
            });
            document.getElementById('product-form').addEventListener('submit', async (e) => {
                e.preventDefault();
                const id = document.getElementById('p-id').value || Utils.generateId();
                const barcode = document.getElementById('p-barcode').value;
                const group = document.getElementById('p-group').value.trim();
                const name = document.getElementById('p-name').value;
                const price = parseFloat(document.getElementById('p-price').value);
                let stock = parseInt(document.getElementById('p-stock').value) || 0;

                // New Fields
                const cost = parseFloat(document.getElementById('p-cost').value) || 0;
                const location = document.getElementById('p-location').value.trim(); // Get Location
                const entryDate = document.getElementById('p-entry-date').value; // Get Entry Date
                const expiryDate = document.getElementById('p-expiry').value;
                const tags = Array.from(document.querySelectorAll('input[name="p-tags"]:checked')).map(cb => cb.value);

                // --- Duplicate Barcode Check ---
                const existingProduct = App.state.products.find(p => p.barcode === barcode && p.id !== id && barcode.trim() !== '');

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
                    cost, expiryDate, tags, location, entryDate, // Save Location & Entry Date
                    parentId, packSize, wholesaleQty, wholesalePrice, packBarcode,
                    updatedAt: Date.now() // Auto-Timestamp
                };

                DB.saveProduct(newProduct);
                App.closeModals();
                App.renderView('stock');
            });
        }, 100);

        overlay.classList.remove('hidden');
        modal.classList.remove('hidden');
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
    setupGlobalInput: () => {
        const input = App.elements.globalSearch;

        // 1. Standard Search Box Input
        let timeout = null;
        input.addEventListener('input', (e) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => {
                const val = e.target.value;
                App.state.searchQuery = val;
                // If pasted or typed manually fully
                if (/^\d{8,14}$/.test(val)) {
                    App.handleBarcodeScan(val);
                    input.value = '';
                    App.state.searchQuery = '';
                } else {
                    if (App.state.currentView === 'pos') App.renderProductGrid();
                }
            }, 300);
        });

        // 2. Global Keydown Listener (Robust Speed-Based)
        // Works even if input is focused (e.g. on-screen keyboard involved)
        let scanBuffer = '';
        let lastKeyTime = 0;
        let isScanning = false;

        document.addEventListener('keydown', (e) => {
            const now = Date.now();
            const timeDiff = now - lastKeyTime;
            lastKeyTime = now;

            // Scanners send keys very fast (usually < 50ms)
            // Humans usually type > 100ms
            if (!isScanning && timeDiff > 200) {
                scanBuffer = ''; // Reset if too slow (likely human start)
                isScanning = false;
            }

            if (e.key === 'Enter') {
                // Check if buffer looks like a barcode
                if (scanBuffer.length >= 8 && /^\d+$/.test(scanBuffer)) {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('Global Scan Captured:', scanBuffer);

                    // Clear any focused input to prevent double entry (optional but good)
                    if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) {
                        document.activeElement.value = '';
                        document.activeElement.blur(); // Close keyboard? Maybe better to keep focus? 
                        // Let's just blur to be safe and hide keyboard if possible
                        document.activeElement.blur();
                    }

                    App.handleBarcodeScan(scanBuffer);
                }
                scanBuffer = '';
                isScanning = false;
                return;
            }

            // Printable chars
            if (e.key.length === 1) {
                // If fast typing detected, assume scanning
                if (timeDiff < 60) {
                    isScanning = true;
                }

                // Allow buffer to grow even if slow initially (first char)
                scanBuffer += e.key;
            }
        }, true); // Capture phase to intervene early

        // 3. Manual Trigger Button
        document.getElementById('btn-scan-trigger').addEventListener('click', async () => {
            input.focus();
            await App.alert('ใช้เครื่องสแกน ยิงบาร์โค้ดได้เลย\n(Focus on search box)');
        });
    },

    handleBarcodeScan: async (barcode) => {
        const match = DB.getProductByBarcode(barcode);

        if (match) {
            const product = match.product;
            const isPack = match.isPack;

            // GLOBAL: Always show Flash Popup (Price & Location)
            App.showProductFlash(product);

            if (App.state.currentView === 'pos') {
                if (isPack) {
                    // Safe UX: Prompt before adding massive amounts
                    const packQty = product.wholesaleQty || 1;
                    if (await App.confirm(`🛒 คุณสแกนบาร์โค้ดลัง:\n\nต้องการเพิ่ม "${product.name}"\nจำนวน 1 ลัง (${packQty} ชิ้น) ลงตะกร้าใช่หรือไม่?`)) {
                        for (let i = 0; i < packQty; i++) {
                            App.addToCart(product, true);
                        }
                    }
                } else {
                    // Normal piece scan
                    App.addToCart(product, true); // True = fromScan
                }
            }
            // In Stock/Other views: Just Flash (as requested), no modal opening
        } else {
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
            <div style="font-size: 24px; font-weight: bold; margin-bottom: 10px; color: #fff;">${product.name}</div>
            <div style="font-size: 48px; font-weight: bold; color: #4caf50; margin-bottom: 10px;">
                ฿${Utils.formatCurrency(product.price)}
            </div>
            ${product.location ? `
                <div style="font-size: 20px; color: #ffeb3b; background: rgba(255,255,255,0.1); padding: 5px 15px; border-radius: 20px; display: inline-block;">
                    📍 ${product.location}
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
            App.toggleMobileCart(true, 2000); // Open for 2s then close
        }
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
            DB.parkCart(App.state.cart, note, timestamp);

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
            <div class="cart-item" draggable="true" ondragstart="App.cartDragStart(event, ${index})" ondragover="App.cartDragOver(event)" ondrop="App.cartDrop(event, ${index})" ondragend="App.cartDragEnd(event)">
                <div style="cursor:grab; margin-right:5px; color:#ccc; display:flex; align-items:center;">
                    <span class="material-symbols-rounded" style="font-size:20px;">drag_indicator</span>
                </div>
                <div style="flex:1;">
                    <div style="font-weight:bold; display:flex; align-items:center; gap:5px;">
                        ${item.name} 
                        ${product.isQuick || item.id.startsWith('M') ? `<span class="material-symbols-rounded" style="font-size:16px; color:var(--primary-color); cursor:pointer;" onclick="App.editCartItemName(${index})" title="แก้ไขชื่อ">edit</span>` : ''}
                    </div>
                    <div style="font-size:14px; color:#666;">@${Utils.formatCurrency(item.price)} ${item.wholesaleQty > 0 && item.wholesalePrice > 0 ? `<span style="font-size:10px;color:var(--primary-color);">(${item.wholesaleQty}ชิ้น=${item.wholesalePrice}฿)</span>` : ''}</div>
                    ${stockWarning}
                </div>
                
                <div style="display:flex; align-items:center; gap:5px;">
                    <!-- Qty Controls -->
                    <div style="display:flex; align-items:center; background:#f0f0f0; border-radius:20px; padding:2px;">
                        <button class="icon-btn small" onclick="App.updateCartQty(${index}, -1)" style="width:28px; height:28px;">-</button>
                        <input type="number" class="hide-arrows" value="${item.qty}" min="1" max="${product.stock}" onchange="App.setCartQty(${index}, this.value)" style="width:45px; text-align:center; border:1px solid #ddd; border-radius:4px; font-weight:bold; height:28px; background:white; margin:0 2px; font-size:16px;">
                        <button class="icon-btn small" onclick="App.updateCartQty(${index}, 1)" style="width:28px; height:28px;">+</button>
                    </div>

                    <!-- Line Total -->
                    <div style="font-weight:bold; width:60px; text-align:right; font-size:14px;">
                        ${Utils.formatCurrency(App.calcItemTotal(item))}
                    </div>
                    
                    <!-- Delete Button -->
                    <button class="icon-btn dangerous" onclick="App.removeCartItem(${index})" title="ลบรายการนี้" style="padding:4px;">
                        <span class="material-symbols-rounded" style="font-size:22px;">delete</span>
                    </button>
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
    },

    removeCartItem: async (index) => {
        // Confirmation for accidental clicks is good UX
        if (await App.confirm('ต้องการลบรายการนี้ออกจากตะกร้า?')) {
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

    setCartQty: async (index, newQtyStr) => {
        const item = App.state.cart[index];
        let newQty = parseInt(newQtyStr);
        if (isNaN(newQty) || newQty <= 0) {
            newQty = 1;
        }

        const product = DB.getProducts().find(p => p.id === item.id);

        // Allowed to exceed stock
        if (newQty !== item.qty) {
            item.qty = newQty;
            await App.checkWholesalePrompt(item);
        }
        App.renderCart();
    },

    updateCartQty: async (index, change) => {
        const item = App.state.cart[index];
        const newQty = item.qty + change;
        if (newQty <= 0) {
            if (await App.confirm(`ต้องการลบ "${item.name}" ออกจากตะกร้าหรือไม่?`)) {
                App.state.cart.splice(index, 1);
            } else {
                return; // User cancelled the deletion
            }
        } else {
            item.qty = newQty;
            await App.checkWholesalePrompt(item);
        }
        App.renderCart();
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
        const badge = document.getElementById('mobile-cart-count');
        if (badge) badge.textContent = count;
    },

    setupCartActions: () => {
        document.getElementById('btn-clear-cart').addEventListener('click', async () => {
            if (await App.confirm('ต้องการล้างตะกร้าสินค้าทั้งหมด?', 'ล้างตะกร้า')) {
                App.state.cart = [];
                App.state.activeBill = null; // Reset tracker
                App.renderCart();
            }
        });
        document.getElementById('btn-park-cart').addEventListener('click', App.actionParkCart);
        document.getElementById('btn-parked-carts').addEventListener('click', App.showParkedCartsModal);
        document.getElementById('btn-checkout').addEventListener('click', () => {
            if (App.state.cart.length === 0) return;
            App.showPaymentModal();
        });
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

    quickCheckoutAndPrint: async () => {
        if (App.state.cart.length === 0) return;

        if (await App.confirm('ต้องการปิดบิล (รับเงินพอดี) และพิมพ์ใบเสร็จทันทีหรือไม่?')) {
            if (App.state.isProcessingPayment) return;
            App.state.isProcessingPayment = true;

            const total = App.state.cart.reduce((sum, item) => sum + App.calcItemTotal(item), 0);

            // Deduct Stock
            App.state.cart.forEach(item => {
                if (item.parentId && item.packSize) {
                    DB.updateStock(item.parentId, item.qty * item.packSize);
                } else {
                    DB.updateStock(item.id, item.qty);
                }
            });

            // Record Sale
            const saleData = {
                billId: App.state.editingBillId || null,
                date: App.state.editingSaleDate || new Date(),
                items: App.state.cart.map(item => ({ ...item, finalLineTotal: App.calcItemTotal(item) })),
                total: total,
                received: total,
                change: 0
            };
            DB.recordSale(saleData);

            // Clear Edit State
            App.state.editingBillId = null;
            App.state.editingSaleDate = null;

            App.state.cart = [];
            App.state.activeBill = null; // Clear tracker after print
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
        const count = DB.getParkedCarts().length;
        App.elements.parkedCount.textContent = count;
        App.elements.parkedCount.style.display = count > 0 ? 'inline-block' : 'none';
    },

    showParkedCartsModal: () => {
        App.closeModals(); // Prevent Overlap
        const parked = DB.getParkedCarts(); // Sorted by DB
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
                ${listToRender.map(cart => `
                    <div style="border:1px solid #eee; padding:10px; border-radius:8px; display:flex; justify-content:space-between; align-items:center; background:${showTrash ? '#fff5f5' : '#fff'};">
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
                `).join('')}
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

    editParkedName: async (id, currentName, event) => {
        if (event) event.stopPropagation(); // Stop bubbling to prevent accidental clicks
        const newName = await App.prompt('แก้ไขชื่อบิล:', currentName);
        if (newName !== null) {
            DB.updateParkedNote(id, newName);
            App.showParkedCartsModal();
        }
    },

    restoreParked: async (id) => {
        if (App.state.cart.length > 0) {
            if (!await App.confirm('ตะกร้าปัจจุบันมีสินค้า ต้องการแทนที่หรือไม่?')) return;
        }

        // Note: retrieve logic in DB now returns the object but deletes it from DB
        // But we want to allow "re-parking" to same slot.
        const parkingData = DB.retrieveParkedCart(id);

        if (parkingData) {
            App.state.cart = parkingData.items;

            // Set Active Bill State for Smart Re-parking
            App.state.activeBill = {
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



        const completeSale = (shouldPrint) => {
            const received = parseFloat(App.currentPayInput);
            const change = received - total;

            // --- Persist Print Preferences before closing ---
            DB.savePaymentPrefs({
                printLogo: document.getElementById('pay-print-logo').checked,
                printName: document.getElementById('pay-print-name').checked,
                printContact: document.getElementById('pay-print-contact').checked,
                printQr: document.getElementById('pay-print-qr').checked
            });

            // Deduct Stock & Record
            App.state.cart.forEach(item => {
                if (item.parentId && item.packSize) {
                    // Deduct from Parent (Bundle)
                    DB.updateStock(item.parentId, item.qty * item.packSize);
                } else {
                    // Deduct Normal
                    DB.updateStock(item.id, item.qty);
                }
            });

            DB.recordSale({
                billId: App.state.editingBillId || null, // Preserve ID if editing
                date: App.state.editingSaleDate || new Date(), // Preserve Date if editing
                items: App.state.cart.map(item => ({ ...item, finalLineTotal: App.calcItemTotal(item) })),
                total: total,
                received: received,
                change: change
            });

            // Clear Edit State
            App.state.editingBillId = null;
            App.state.editingSaleDate = null;

            App.state.cart = [];
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
                        ${item.name}
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
                ${Array(settings.printerFeedLines || 5).fill('<div style="color: white !important;">&nbsp;</div>').join('')}
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



    // --- Price Check ---
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
                         <div style="font-size:24px; font-weight:bold;">${product.name}</div>
                         ${product.image ? `<img src="${product.image}" style="max-height:100px; margin:10px 0;">` : ''}
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
            // FIX: Do not wipe security-modal or confirmation-modal content as they are static
            if (m.id !== 'security-modal' && m.id !== 'confirmation-modal') {
                m.innerHTML = '';
            }
        });
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
