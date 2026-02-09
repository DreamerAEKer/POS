/**
 * Main Application Logic
 */

const App = {
    state: {
        cart: [],
        activeBill: null, // Track currently active restored bill
        currentView: 'pos', // 'pos', 'stock', 'suppliers', 'settings'
        products: [],
        searchQuery: ''
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
        const allSales = DB.getSales().sort((a, b) => new Date(b.date) - new Date(a.date)); // Newest first

        // Filter for Today (Simple logic for now, can be expanded to date picker later)
        const today = new Date().toDateString();
        const todaysSales = allSales.filter(s => new Date(s.date).toDateString() === today);
        const todayTotal = todaysSales.reduce((sum, s) => sum + s.total, 0);

        container.innerHTML = `
            <h2>ยอดขาย</h2>
            
            <!-- Dashboard -->
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:20px; margin-top:20px;">
                <div style="background:var(--primary-color); color:white; padding:20px; border-radius:12px; box-shadow:var(--shadow-md);">
                    <div style="font-size:14px; opacity:0.8;">ยอดขายวันนี้ (Today)</div>
                    <div style="font-size:36px; font-weight:bold;">฿${Utils.formatCurrency(todayTotal)}</div>
                </div>
                <div style="background:white; padding:20px; border-radius:12px; box-shadow:var(--shadow-sm); display:flex; flex-direction:column; justify-content:center;">
                    <div style="font-size:14px; color:#666;">จำนวนบิลวันนี้</div>
                    <div style="font-size:36px; font-weight:bold; color:var(--neutral-900);">${todaysSales.length}</div>
                </div>
            </div>

            <!-- Transaction List -->
            <div style="margin-top:20px; background:white; border-radius:12px; overflow:hidden; box-shadow:var(--shadow-sm);">
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
                        ${allSales.map((sale, index) => `
                            <tr style="border-bottom:1px solid #eee; cursor:pointer;" onclick="App.showBillDetail(${index})">
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
                        `).join('')}
                    </tbody>
                </table>
                ${allSales.length === 0 ? '<div style="padding:40px; text-align:center; color:#999;">ยังไม่มีรายการขาย</div>' : ''}
            </div>
        `;
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
                            <td style="text-align:right;">${Utils.formatCurrency(item.price * item.qty)}</td>
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

    // --- Settings View ---
    renderSettingsView: (container) => {
        const settings = DB.getSettings();
        container.innerHTML = `
            <h2>ตั้งค่าระบบ</h2>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:20px; margin-top:20px;">
                <!-- Store Config -->
                <div style="background:white; padding:20px; border-radius:8px; box-shadow:var(--shadow-sm);">
                    <h3>ข้อมูลร้านค้า</h3>
                    <p style="color:#666; font-size:14px; margin-bottom:15px;">ชื่อนี้จะปรากฏบนใบเสร็จ (ไม่มีผลกับบิลเก่า)</p>
                    <label>ชื่อร้าน</label>
                    <input type="text" id="set-store-name" value="${settings.storeName}" style="width:100%; padding:10px; font-size:18px; margin-bottom:10px;">
                    <button class="primary-btn" onclick="App.saveStoreName()">บันทึกชื่อร้าน</button>
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
            <div style="margin-top:40px; text-align:center;">
                 <p style="color:#999;">Grocery POS v1.2.0 (Secured & Safe)</p>
            </div>
        `;
    },

    saveStoreName: () => {
        const nameInput = document.getElementById('set-store-name');
        const name = nameInput.value;
        if (!name) {
            App.alert('กรุณาใส่ชื่อร้าน');
            return;
        }

        App.checkPin(async () => {
            DB.saveSettings({ storeName: name });
            await App.alert('บันทึกชื่อร้านเรียบร้อยแล้ว!');
            App.renderView('settings');
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
            <h2>ขายสินค้า</h2>
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
            displayProducts = displayProducts.filter(p =>
                p.name.includes(App.state.searchQuery) ||
                p.barcode.includes(App.state.searchQuery) ||
                (p.group && p.group.includes(App.state.searchQuery))
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
        const groupHtml = Object.keys(groups).map(groupName => {
            const items = groups[groupName];
            // Use the image of the first item as the folder cover
            const coverImage = items[0].image;
            return `
                <div class="product-card" onclick="App.openVariantModal('${groupName}')" style="border: 2px solid var(--primary-color);">
                    <div style="height:120px; background:#e0ecff; display:flex; align-items:center; justify-content:center; overflow:hidden; position:relative;">
                        ${coverImage ? `<img src="${coverImage}" style="width:100%; height:100%; object-fit:cover; opacity:0.8;">` : ''}
                        <div style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; background:rgba(255,255,255,0.3);">
                            <span class="material-symbols-rounded" style="font-size:48px; color:var(--primary-color);">folder</span>
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
                    <div class="p-stock">${displayStock} items</div>
                </div>
            </div>
            `;
        }).join('');

        grid.innerHTML = groupHtml + singleHtml;
    },

    // --- Stock View ---
    renderStockView: (container) => {
        const totalValue = App.state.products.reduce((sum, p) => sum + (p.stock * (p.cost || 0)), 0);
        const totalItems = App.state.products.reduce((sum, p) => sum + p.stock, 0);

        container.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <h2>จัดการสต็อก</h2>
                <div style="text-align:right;">
                    <button class="primary-btn" onclick="App.openProductModal()">+ เพิ่มสินค้า</button>
                </div>
            </div>
            
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:15px; margin-top:15px;">
                 <div style="background:white; padding:15px; border-radius:8px; box-shadow:var(--shadow-sm); display:flex; justify-content:space-between; align-items:center;">
                    <span style="color:#666;">จำนวนสินค้าทั้งหมด</span>
                    <span style="font-weight:bold; font-size:20px;">${totalItems} ชิ้น</span>
                 </div>
                 <div style="background:white; padding:15px; border-radius:8px; box-shadow:var(--shadow-sm); display:flex; justify-content:space-between; align-items:center;">
                    <span style="color:#666;">มูลค่าสต็อกรวม (Cost)</span>
                    <span style="font-weight:bold; font-size:20px; color:var(--primary-color);">฿${Utils.formatCurrency(totalValue)}</span>
                 </div>
            </div>

            <div style="margin-top:20px; overflow-x:auto;">
                <table style="width:100%; border-collapse:collapse; background:white; border-radius:8px; overflow:hidden;">
                    <thead>
                        <tr style="background:var(--neutral-100); text-align:left;">
                            <th style="padding:15px;">รูป</th>
                            <th style="padding:15px;">สินค้า</th>
                            <th style="padding:15px;">ราคา/ต้นทุน</th>
                            <th style="padding:15px;">สต็อก</th>
                            <th style="padding:15px;">สถานะ</th>
                            <th style="padding:15px;">จัดการ</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${App.state.products.map(p => {
            let statusHtml = '';
            if (p.expiryDate) {
                const daysLeft = Math.ceil((new Date(p.expiryDate) - new Date()) / (1000 * 60 * 60 * 24));
                if (daysLeft <= 0) statusHtml = '<span style="color:red; font-weight:bold;">หมดอายุ!</span>';
                else if (daysLeft <= 7) statusHtml = `<span style="color:red;">Exp: ${daysLeft} วัน</span>`;
                else if (daysLeft <= 30) statusHtml = `<span style="color:#ffc107;">Exp: ${daysLeft} วัน</span>`;
                else statusHtml = `<span style="color:green;">ปกติ</span>`;
            } else {
                statusHtml = '<span style="color:#ccc;">-</span>';
            }

            return `
                            <tr style="border-bottom:1px solid #eee;">
                                <td style="padding:10px;">
                                    <div style="width:50px; height:50px; background:#eee; border-radius:4px; overflow:hidden;">
                                        ${p.image ? `<img src="${p.image}" style="width:100%; height:100%; object-fit:cover;">` : ''}
                                    </div>
                                </td>
                                <td style="padding:10px;">
                                    <div style="font-weight:bold;">${p.name}</div>
                                    <div style="font-size:12px; color:#666;">${p.barcode}</div>
                                </td>
                                <td style="padding:10px;">
                                    <div>ขาย: ${Utils.formatCurrency(p.price)}</div>
                                    <div style="font-size:12px; color:#888;">ทุน: ${p.cost ? Utils.formatCurrency(p.cost) : '-'}</div>
                                </td>
                                <td style="padding:10px;">
                                    <span style="color:${p.stock < 5 ? 'var(--danger-color)' : 'black'}; font-weight:${p.stock < 5 ? 'bold' : 'normal'};">
                                        ${p.stock}
                                    </span>
                                </td>
                                <td style="padding:10px; font-size:14px;">${statusHtml}</td>
                                <td style="padding:10px;">
                                    <button class="icon-btn" onclick="App.openProductModal('${p.id}')">
                                        <span class="material-symbols-rounded">edit</span>
                                    </button>
                                    <button class="icon-btn dangerous" onclick="App.deleteProduct('${p.id}')">
                                        <span class="material-symbols-rounded">delete</span>
                                    </button>
                                </td>
                            </tr>
                        `}).join('')}
                    </tbody>
                </table>
            </div>
        `;
    },

    // --- Supplier View ---
    renderSupplierView: (container) => {
        const suppliers = DB.getSuppliers();
        container.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <h2>ร้านส่ง / Supplier</h2>
                <button class="primary-btn" onclick="App.openSupplierModal()">+ เพิ่มร้านค้า</button>
            </div>
            <div class="supplier-list" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(300px, 1fr)); gap:20px; margin-top:20px;">
                ${suppliers.map(s => `
                    <div class="supplier-card" style="background:white; padding:20px; border-radius:var(--radius-md); box-shadow:var(--shadow-sm); cursor:pointer;" onclick="App.renderSupplierDetail('${s.id}')">
                        <div style="font-weight:bold; font-size:18px;">${s.name}</div>
                        <div style="color:#666; margin-top:5px;">${s.contact}</div>
                        <div style="color:var(--primary-color); margin-top:5px;">📞 ${s.phone}</div>
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
                         <button class="icon-btn" onclick="App.openSupplierModal('${supplier.id}')"><span class="material-symbols-rounded">edit</span></button>
                         <button class="icon-btn dangerous" onclick="App.deleteSupplier('${supplier.id}')"><span class="material-symbols-rounded">delete</span></button>
                    </div>
                </div>
                <p>ผู้ติดต่อ: ${supplier.contact} | โทร: ${supplier.phone}</p>
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
            document.getElementById('product-form').addEventListener('submit', (e) => {
                e.preventDefault();
                const id = document.getElementById('p-id').value || Utils.generateId();
                const barcode = document.getElementById('p-barcode').value;
                const group = document.getElementById('p-group').value.trim();
                const name = document.getElementById('p-name').value;
                const price = parseFloat(document.getElementById('p-price').value);
                const stock = parseInt(document.getElementById('p-stock').value) || 0;

                // New Fields
                const cost = parseFloat(document.getElementById('p-cost').value) || 0;
                const expiryDate = document.getElementById('p-expiry').value;
                const tags = Array.from(document.querySelectorAll('input[name="p-tags"]:checked')).map(cb => cb.value);

                // --- Duplicate Barcode Check ---
                const existingProduct = App.state.products.find(p => p.barcode === barcode && p.id !== id);

                if (existingProduct) {
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

                const newProduct = {
                    id, barcode, group, name, price, stock, image: newImage,
                    cost, expiryDate, tags,
                    parentId, packSize,
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
            <form id="supplier-form" style="display:flex; flex-direction:column; gap:10px; margin-top:15px;">
                <label>ชื่อร้านค้า</label>
                <input type="text" id="s-name" value="${s ? s.name : ''}" required style="padding:10px;">
                <label>ผู้ติดต่อ</label>
                <input type="text" id="s-contact" value="${s ? s.contact : ''}" style="padding:10px;">
                <label>เบอร์โทร</label>
                <input type="tel" id="s-phone" value="${s ? s.phone : ''}" required style="padding:10px;">
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

            if (!/^0\d{8,9}$/.test(phone)) {
                await App.alert('เบอร์โทรศัพท์ไม่ถูกต้อง!\n- ต้องขึ้นต้นด้วย 0\n- มีความยาว 9 หรือ 10 หลัก\n- เป็นตัวเลขเท่านั้น');
                return;
            }

            DB.saveSupplier({ id, name, contact, phone });
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

    openLinkProductModal: (supplierId) => {
        App.closeModals(); // Prevent Overlap
        const modal = document.getElementById('product-modal');
        const overlay = document.getElementById('modal-overlay');
        const allProducts = DB.getProducts();

        modal.innerHTML = `
            <h2>เพิ่มสินค้าให้ร้านค้า</h2>
            <form id="link-form" style="display:flex; flex-direction:column; gap:10px; margin-top:15px;">
                <label>เลือกสินค้าในร้าน</label>
                <select id="l-product" style="width:100%;">
                    ${allProducts.map(p => `<option value="${p.id}">${p.name} (ขาย: ${p.price})</option>`).join('')}
                </select>
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

    // --- Variant Modal (Groups) ---
    openVariantModal: (groupName) => {
        const modal = document.getElementById('product-modal'); // reuse generic modal container
        const overlay = document.getElementById('modal-overlay');

        const variants = App.state.products.filter(p => p.group === groupName);

        modal.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                <h2>${groupName}</h2>
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

    // --- Search & Scan Logic ---
    setupGlobalInput: () => {
        const input = App.elements.globalSearch;
        let timeout = null;
        input.addEventListener('input', (e) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => {
                const val = e.target.value;
                App.state.searchQuery = val;
                if (/^\d{8,14}$/.test(val)) {
                    App.handleBarcodeScan(val);
                    input.value = '';
                    App.state.searchQuery = '';
                } else {
                    if (App.state.currentView === 'pos') App.renderProductGrid();
                }
            }, 300);
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !document.querySelector('.modal:not(.hidden)')) {
                input.focus();
            }
        });

        document.getElementById('btn-scan-trigger').addEventListener('click', async () => {
            input.focus();
            await App.alert('ใช้เครื่องสแกน ยิงบาร์โค้ดได้เลย\n(Focus on search box)');
        });
    },

    handleBarcodeScan: async (barcode) => {
        const product = DB.getProductByBarcode(barcode);
        if (product) {
            if (App.state.currentView === 'pos') {
                App.addToCart(product);
            } else if (App.state.currentView === 'stock') {
                App.openProductModal(product.id);
            }
        } else {
            if (await App.confirm(`ไม่พบสินค้า ${barcode}\nต้องการเพิ่มสินค้าใหม่หรือไม่?`)) {
                // Navigate to stock > Add
                App.renderView('stock');
                setTimeout(() => {
                    App.openProductModal();
                    setTimeout(() => document.getElementById('p-barcode').value = barcode, 200);
                }, 100);
            }
        }
    },

    // --- Cart Logic ---
    addToCart: async (product) => {
        if (product.stock <= 0) {
            await App.alert('สินค้าหมดสต็อก!');
            return;
        }
        const existing = App.state.cart.find(item => item.id === product.id);
        if (existing) {
            if (existing.qty + 1 > product.stock) {
                await App.alert('จำนวนสินค้าเกินสต็อกที่มี');
                return;
            }
            existing.qty++;
        } else {
            App.state.cart.push({ ...product, qty: 1 });
        }
        App.renderCart();
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
                note = App.state.activeBill.note;
                timestamp = App.state.activeBill.timestamp; // REUSE OLD TIMESTAMP
            } else {
                note = await App.prompt('ตั้งชื่อบิลพักนี้ (เช่น โต๊ะ 5, คุณสมชาย):', '') || '';
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
        App.elements.cartItemsContainer.innerHTML = App.state.cart.map((item, index) => `
            <div class="cart-item">
                <div style="flex:1;">
                    <div style="font-weight:bold;">${item.name}</div>
                    <div style="font-size:14px; color:#666;">@${Utils.formatCurrency(item.price)}</div>
                </div>
                
                <div style="display:flex; align-items:center; gap:5px;">
                    <!-- Qty Controls -->
                    <div style="display:flex; align-items:center; background:#f0f0f0; border-radius:20px; padding:2px;">
                        <button class="icon-btn small" onclick="App.updateCartQty(${index}, -1)" style="width:28px; height:28px;">-</button>
                        <span style="font-weight:bold; min-width:24px; text-align:center;">${item.qty}</span>
                        <button class="icon-btn small" onclick="App.updateCartQty(${index}, 1)" style="width:28px; height:28px;">+</button>
                    </div>

                    <!-- Line Total -->
                    <div style="font-weight:bold; width:50px; text-align:right; font-size:14px;">
                        ${Utils.formatCurrency(item.price * item.qty)}
                    </div>
                    
                    <!-- Delete Button -->
                    <button class="icon-btn dangerous" onclick="App.removeCartItem(${index})" title="ลบรายการนี้">
                        <span class="material-symbols-rounded" style="font-size:20px;">delete</span>
                    </button>
                </div>
            </div>
        `).join('');

        const total = App.state.cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
        App.elements.cartTotal.textContent = Utils.formatCurrency(total);
        App.updateMobileCartBadge();
    },

    removeCartItem: async (index) => {
        // Confirmation for accidental clicks is good UX
        if (await App.confirm('ต้องการลบรายการนี้ออกจากตะกร้า?')) {
            App.state.cart.splice(index, 1);
            App.renderCart();
        }
    },

    updateCartQty: async (index, change) => {
        const item = App.state.cart[index];
        const newQty = item.qty + change;
        if (newQty <= 0) {
            App.state.cart.splice(index, 1);
        } else {
            const product = DB.getProducts().find(p => p.id === item.id);
            if (newQty > product.stock) {
                await App.alert('เกินจำนวนสต็อก');
                return;
            }
            item.qty = newQty;
        }
        App.renderCart();
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
                App.renderCart();
            }
        });
        document.getElementById('btn-park-cart').addEventListener('click', App.actionParkCart);
        document.getElementById('btn-parked-carts').addEventListener('click', App.showParkedCartsModal);
        document.getElementById('btn-checkout').addEventListener('click', () => {
            if (App.state.cart.length === 0) return;
            App.showPaymentModal();
        });

        // --- Mobile Cart Toggle ---
        // --- Mobile Cart Toggle ---
        const mobileCartBtn = document.getElementById('btn-mobile-cart');
        const mobileOverlay = document.getElementById('mobile-cart-overlay');

        if (mobileCartBtn) {
            mobileCartBtn.addEventListener('click', () => {
                App.toggleMobileCart(true);
            });
        }

        if (mobileOverlay) {
            mobileOverlay.addEventListener('click', () => {
                App.toggleMobileCart(false);
            });
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
                                <div style="font-weight:bold; font-size:16px; color:var(--primary-color);">
                                    ${cart.note ? cart.note : '<span style="color:#ccc;">(ไม่มีชื่อ)</span>'}
                                </div>
                                ${!showTrash ? `
                                <button class="icon-btn small" onclick="App.editParkedName('${cart.id}', '${cart.note || ''}')" title="เปลี่ยนชื่อ">
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
            App._ensureConfirmationModal();
            const modal = document.getElementById('confirmation-modal');
            const overlay = document.getElementById('modal-overlay');

            document.getElementById('confirm-title').textContent = title;
            document.getElementById('confirm-message').textContent = message;
            document.getElementById('confirm-icon').textContent = '❓';

            const btnOk = document.getElementById('btn-confirm-ok');
            const btnCancel = document.getElementById('btn-confirm-cancel');

            btnCancel.style.display = 'block'; // Ensure cancel is visible
            btnOk.textContent = 'ตกลง';
            btnOk.className = 'primary-btn';

            const close = (result) => {
                modal.classList.add('hidden');
                overlay.classList.add('hidden');
                resolve(result);
            };

            btnOk.onclick = () => close(true);
            btnCancel.onclick = () => close(false);

            modal.classList.remove('hidden');
            overlay.classList.remove('hidden');
            setTimeout(() => btnOk.focus(), 100);
        });
    },

    alert: (message, title = 'แจ้งเตือน') => {
        return new Promise((resolve) => {
            App._ensureConfirmationModal();
            const modal = document.getElementById('confirmation-modal');
            const overlay = document.getElementById('modal-overlay');

            document.getElementById('confirm-title').textContent = title;
            document.getElementById('confirm-message').textContent = message;
            document.getElementById('confirm-icon').textContent = 'ℹ️';

            const btnOk = document.getElementById('btn-confirm-ok');
            const btnCancel = document.getElementById('btn-confirm-cancel');

            btnCancel.style.display = 'none'; // Hide cancel for alerts
            btnOk.textContent = 'รับทราบ';
            btnOk.className = 'primary-btn';

            const close = () => {
                modal.classList.add('hidden');
                overlay.classList.add('hidden');
                resolve(true);
            };

            btnOk.onclick = () => close();

            modal.classList.remove('hidden');
            overlay.classList.remove('hidden');
            setTimeout(() => btnOk.focus(), 100);
        });
    },

    prompt: (message, defaultValue = '', title = 'กรอกข้อมูล') => {
        return new Promise((resolve) => {
            App._ensureConfirmationModal();
            const modal = document.getElementById('confirmation-modal');
            const overlay = document.getElementById('modal-overlay');

            document.getElementById('confirm-title').textContent = title;
            document.getElementById('confirm-message').textContent = message;
            document.getElementById('confirm-icon').textContent = '📝';

            const input = document.getElementById('confirm-input');
            input.value = defaultValue;
            input.classList.remove('hidden'); // Show input

            const btnOk = document.getElementById('btn-confirm-ok');
            const btnCancel = document.getElementById('btn-confirm-cancel');

            btnCancel.style.display = 'block';
            btnOk.textContent = 'ตกลง';
            btnOk.className = 'primary-btn';

            const close = (result) => {
                modal.classList.add('hidden');
                overlay.classList.add('hidden');
                input.classList.add('hidden'); // Hide input again
                resolve(result);
            };

            btnOk.onclick = () => close(input.value);
            btnCancel.onclick = () => close(null);

            // Enter key support
            input.onkeydown = (e) => {
                if (e.key === 'Enter') close(input.value);
            };

            modal.classList.remove('hidden');
            overlay.classList.remove('hidden');
            setTimeout(() => input.focus(), 100);
        });
    },

    toggleTrash: () => {
        App.state.showingTrash = !App.state.showingTrash;
        App.showParkedCartsModal();
    },

    editParkedName: async (id, currentName) => {
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
                items: App.state.cart,
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
        };

        document.getElementById('btn-confirm-pay').addEventListener('click', () => completeSale(false));
    },

    printReceiptFromHistory: (index) => {
        const sale = DB.getSales().sort((a, b) => new Date(b.date) - new Date(a.date))[index];
        // Calculate change (Assuming exact/cash - logic for historical change not stored? 
        // Actually recordSale doesn't store 'received' and 'change'. 
        // For reprint, we might just show Total. Or we should update recordSale to store payment details.
        // For now, let's just print Total. User didn't ask for change tracking on reprint.
        App.printReceipt(sale);
    },

    printReceipt: (sale) => {
        const storeName = DB.getSettings().storeName;
        const received = sale.received || sale.total; // Fallback for old records
        const change = sale.change || 0;

        const receiptHtml = `
            <div class="receipt-header">
                <h2>${storeName}</h2>
                <p>ใบเสร็จรับเงินอย่างย่อ</p>
                <p>${new Date(sale.date).toLocaleString('th-TH')}</p>
            </div>
            <div class="receipt-divider"></div>
            ${sale.items.map(item => `
                <div class="receipt-item">
                    <span>${item.name} (${item.qty})</span>
                    <span>${Utils.formatCurrency(item.price * item.qty)}</span>
                </div>
            `).join('')}
            <div class="receipt-divider"></div>
            <div class="receipt-total">
                <span>รวมทั้งสิ้น</span>
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
            <div class="receipt-footer">
                <br>
                <p>ขอบคุณที่อุดหนุน</p>
            </div>
        `;
        App.elements.receiptArea.innerHTML = receiptHtml;
        window.print();
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

                const product = DB.getProductByBarcode(val) || App.state.products.find(p => p.name.includes(val));
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

    toggleMobileCart: (show) => {
        const cartPanel = document.getElementById('right-panel');
        const mobileOverlay = document.getElementById('mobile-cart-overlay');

        if (show) {
            cartPanel.classList.add('open');
            if (mobileOverlay) mobileOverlay.style.display = 'block';
        } else {
            cartPanel.classList.remove('open');
            if (mobileOverlay) mobileOverlay.style.display = 'none';
        }
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
