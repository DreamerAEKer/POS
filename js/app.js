/**
 * Main Application Logic
 */

const App = {
    state: {
        cart: [],
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

    init: () => {
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
            alert('ระบบเกิดข้อผิดพลาด: ' + e.message);
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
                    App.setActiveNav(view);
                    App.renderView(view);
                }
                // 3. Special Buttons
                else if (item.id === 'btn-check-price') {
                    App.showPriceCheckModal();
                } else if (item.id === 'btn-parked-mobile' || item.id === 'btn-parked-mobile-2') {
                    App.showParkedCartsModal();
                }
            });
        });
    },

    setActiveNav: (viewName) => {
        document.querySelectorAll('.nav-item').forEach(n => {
            n.classList.remove('active');
            if (n.dataset.view === viewName) n.classList.add('active');
        });
    },

    // --- Security Logic ---
    // --- Security Logic ---
    checkPin: (onSuccess) => {
        const modal = document.getElementById('security-modal');
        const overlay = document.getElementById('modal-overlay');
        const input = document.getElementById('security-pin-input');
        const confirmBtn = document.getElementById('btn-security-confirm');

        // Reset UI
        input.value = '';
        overlay.classList.remove('hidden');
        modal.classList.remove('hidden');
        input.focus();

        // Core Logic
        const submitPin = () => {
            if (DB.validatePin(input.value)) {
                App.closeModals();

                // Cleanup to prevent memory leaks/double-firing
                confirmBtn.onclick = null;
                input.onkeydown = null;

                onSuccess();
            } else {
                alert('รหัสผ่านไม่ถูกต้อง!');
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
        }
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
        if (!name) return alert('กรุณาใส่ชื่อร้าน');

        App.checkPin(() => {
            DB.saveSettings({ storeName: name });
            alert('บันทึกชื่อร้านเรียบร้อยแล้ว!');
            App.renderView('settings');
        });
    },

    changePin: () => {
        const newPin = document.getElementById('set-new-pin').value;
        if (!/^\d{4}$/.test(newPin)) return alert('รหัสผ่านต้องเป็นตัวเลข 4 หลัก');
        App.checkPin(() => {
            DB.saveSettings({ pin: newPin });
            alert('เปลี่ยนรหัสผ่านเรียบร้อยแล้ว!');
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
        reader.onload = (e) => {
            const success = DB.importData(e.target.result);
            if (success) {
                alert('กู้คืนข้อมูลสำเร็จ!');
                location.reload();
            } else {
                alert('กู้คืนข้อมูลไม่สำเร็จ ไฟล์อาจเสียหาย');
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
        const singleHtml = singles.map(p => `
            <div class="product-card" onclick="App.addToCart(App.state.products.find(x => x.id === '${p.id}'))">
                ${p.stock <= 5 ? '<div class="stock-badge low">Low Stock</div>' : ''}
                <div style="height:120px; background:#f0f0f0; display:flex; align-items:center; justify-content:center; overflow:hidden;">
                    ${p.image ? `<img src="${p.image}" style="width:100%; height:100%; object-fit:cover;">` : '<span class="material-symbols-rounded" style="font-size:48px; color:#ccc;">image</span>'}
                </div>
                <div class="p-info">
                    <div class="p-name">${p.name}</div>
                    <div class="p-price">฿${Utils.formatCurrency(p.price)}</div>
                    <div class="p-stock">${p.stock} items</div>
                </div>
            </div>
        `).join('');

        grid.innerHTML = groupHtml + singleHtml;
    },

    // --- Stock View ---
    renderStockView: (container) => {
        container.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <h2>จัดการสต็อก</h2>
                <button class="primary-btn" onclick="App.openProductModal()">+ เพิ่มสินค้า</button>
            </div>
            <div style="margin-top:20px; overflow-x:auto;">
                <table style="width:100%; border-collapse:collapse; background:white; border-radius:8px; overflow:hidden;">
                    <thead>
                        <tr style="background:var(--neutral-100); text-align:left;">
                            <th style="padding:15px;">รูป</th>
                            <th style="padding:15px;">บาร์โค้ด</th>
                            <th style="padding:15px;">ชื่อสินค้า</th>
                            <th style="padding:15px;">ราคา</th>
                            <th style="padding:15px;">สต็อก</th>
                            <th style="padding:15px;">จัดการ</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${App.state.products.map(p => `
                            <tr style="border-bottom:1px solid #eee;">
                                <td style="padding:10px;">
                                    <div style="width:50px; height:50px; background:#eee; border-radius:4px; overflow:hidden;">
                                        ${p.image ? `<img src="${p.image}" style="width:100%; height:100%; object-fit:cover;">` : ''}
                                    </div>
                                </td>
                                <td style="padding:10px;">${p.barcode}</td>
                                <td style="padding:10px;">${p.name}</td>
                                <td style="padding:10px;">${Utils.formatCurrency(p.price)}</td>
                                <td style="padding:10px;">
                                    <span style="color:${p.stock < 5 ? 'var(--danger-color)' : 'black'}; font-weight:${p.stock < 5 ? 'bold' : 'normal'};">
                                        ${p.stock}
                                    </span>
                                </td>
                                <td style="padding:10px;">
                                    <button class="icon-btn" onclick="App.openProductModal('${p.id}')">
                                        <span class="material-symbols-rounded">edit</span>
                                    </button>
                                    <button class="icon-btn dangerous" onclick="App.deleteProduct('${p.id}')">
                                        <span class="material-symbols-rounded">delete</span>
                                    </button>
                                </td>
                            </tr>
                        `).join('')}
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
        const product = editId ? App.state.products.find(p => p.id === editId) : null;
        const modal = document.getElementById('product-modal');
        const overlay = document.getElementById('modal-overlay');

        // Initial Groups for Autocomplete
        const existingGroups = [...new Set(App.state.products.map(p => p.group).filter(g => g))];

        modal.innerHTML = `
            <h2>${product ? 'แก้ไขสินค้า' : 'เพิ่มสินค้าใหม่'}</h2>
            <form id="product-form" style="display:flex; flex-direction:column; gap:10px; margin-top:15px;">
                <input type="hidden" id="p-id" value="${product ? product.id : ''}">
                
                <label>บาร์โค้ด (Scan หรือ พิมพ์)</label>
                <div style="display:flex; gap:5px;">
                    <input type="text" id="p-barcode" value="${product ? product.barcode : ''}" required style="flex:1; padding:8px; font-size:18px;">
                    <button type="button" class="secondary-btn" onclick="document.getElementById('p-barcode').focus()">Scan</button>
                </div>
                
                <!-- Grouping Field -->
                <label>หมวดหมู่/กลุ่ม (ปล่อยว่างถ้าไม่มี)</label>
                <input type="text" id="p-group" list="group-list" value="${product && product.group ? product.group : ''}" 
                    placeholder="เช่น น้ำอัดลม, ไข่ไก่" style="padding:8px; font-size:18px;">
                <datalist id="group-list">
                    ${existingGroups.map(g => `<option value="${g}">`).join('')}
                </datalist>

                <label>ชื่อสินค้า (ระบุรสชาติ/ขนาด)</label>
                <input type="text" id="p-name" value="${product ? product.name : ''}" required style="padding:8px; font-size:18px;" placeholder="เช่น โค้ก (กระป๋อง), เบอร์ 0 (10 ฟอง)">
                
                <div style="display:flex; gap:10px;">
                    <div style="flex:1;">
                        <label>ราคา (บาท)</label>
                        <input type="number" id="p-price" value="${product ? product.price : ''}" required style="width:100%; padding:8px; font-size:18px;">
                    </div>
                    <div style="flex:1;">
                        <label>จำนวนสต็อก (ชิ้น/หน่วยย่อย)</label>
                        <div style="display:flex; gap:5px;">
                            <input type="number" id="p-stock" value="${product ? product.stock : ''}" required style="flex:1; padding:8px; font-size:18px;">
                            <button type="button" class="secondary-btn" onclick="App.openStockCalc()" title="เครื่องคิดเลขสต็อก" style="padding:0 10px;">
                                <span class="material-symbols-rounded">calculate</span>
                            </button>
                        </div>
                    </div>
                </div>
                <label>รูปภาพ</label>
                <input type="file" id="p-image-input" accept="image/*">
                <div id="p-image-preview" style="width:100px; height:100px; background:#eee; margin-top:5px; border-radius:8px; overflow:hidden;">
                    ${product && product.image ? `<img src="${product.image}" style="width:100%;height:100%;object-fit:cover;">` : ''}
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
                const stock = parseInt(document.getElementById('p-stock').value);
                const existingImage = product ? product.image : null;
                const newImage = preview.dataset.base64 || existingImage;

                const newProduct = { id, barcode, group, name, price, stock, image: newImage };
                DB.saveProduct(newProduct);
                App.closeModals();
                App.renderView('stock');
            });
        }, 100);

        overlay.classList.remove('hidden');
        modal.classList.remove('hidden');
    },

    openStockCalc: () => {
        const packs = prompt('จำนวนกี่ลัง/แพ็ค?');
        if (!packs) return;
        const perPack = prompt('จำนวนกี่ชิ้นต่อลัง/แพ็ค?');
        if (!perPack) return;

        const total = parseInt(packs) * parseInt(perPack);
        if (isNaN(total)) return alert('ใส่ตัวเลขไม่ถูกต้อง');

        const current = parseInt(document.getElementById('p-stock').value) || 0;
        // Ask if replace or add
        if (current > 0) {
            if (confirm(`มีของเดิม ${current} ชิ้น\nต้องการ "บวกเพิ่ม" หรือ "แทนที่"?\n(OK = บวกเพิ่ม ${total} เป็น ${current + total})\n(Cancel = แทนที่ด้วย ${total})`)) {
                document.getElementById('p-stock').value = current + total;
            } else {
                document.getElementById('p-stock').value = total;
            }
        } else {
            document.getElementById('p-stock').value = total;
        }
    },

    deleteProduct: (id) => {
        if (confirm('ต้องการลบสินค้านี้ใช่หรือไม่?')) {
            DB.deleteProduct(id);
            App.renderView('stock');
        }
    },

    openSupplierModal: (editId = null) => {
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

        document.getElementById('supplier-form').addEventListener('submit', (e) => {
            e.preventDefault();
            const id = editId || Utils.generateId();
            const name = document.getElementById('s-name').value;
            const contact = document.getElementById('s-contact').value;
            const phone = document.getElementById('s-phone').value.trim();

            if (!/^0\d{8,9}$/.test(phone)) {
                alert('เบอร์โทรศัพท์ไม่ถูกต้อง!\n- ต้องขึ้นต้นด้วย 0\n- มีความยาว 9 หรือ 10 หลัก\n- เป็นตัวเลขเท่านั้น');
                return;
            }

            DB.saveSupplier({ id, name, contact, phone });
            App.closeModals();
            App.renderView('suppliers');
        });

        overlay.classList.remove('hidden');
        modal.classList.remove('hidden');
    },

    deleteSupplier: (id) => {
        if (confirm('ลบร้านค้านี้? ข้อมูลราคาที่ผูกไว้จะหายไปด้วย')) {
            DB.deleteSupplier(id);
            App.renderView('suppliers');
        }
    },

    openLinkProductModal: (supplierId) => {
        const modal = document.getElementById('product-modal');
        const overlay = document.getElementById('modal-overlay');
        const allProducts = DB.getProducts();

        modal.innerHTML = `
            <h2>เพิ่มสินค้าให้ร้านค้า</h2>
            <form id="link-form" style="display:flex; flex-direction:column; gap:10px; margin-top:15px;">
                <label>เลือกสินค้าในร้าน</label>
                <select id="l-product" style="padding:10px; font-size:16px;">
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
                    <input type="number" step="0.01" id="l-buy-price" required style="width:100%; padding:10px; font-size:18px;">
                    
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

        document.getElementById('btn-scan-trigger').addEventListener('click', () => {
            input.focus();
            alert('ใช้เครื่องสแกน ยิงบาร์โค้ดได้เลย\n(Focus on search box)');
        });
    },

    handleBarcodeScan: (barcode) => {
        const product = DB.getProductByBarcode(barcode);
        if (product) {
            if (App.state.currentView === 'pos') {
                App.addToCart(product);
            } else if (App.state.currentView === 'stock') {
                App.openProductModal(product.id);
            }
        } else {
            if (confirm(`ไม่พบสินค้า ${barcode}\nต้องการเพิ่มสินค้าใหม่หรือไม่?`)) {
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
    addToCart: (product) => {
        if (product.stock <= 0) return alert('สินค้าหมดสต็อก!');
        const existing = App.state.cart.find(item => item.id === product.id);
        if (existing) {
            if (existing.qty + 1 > product.stock) return alert('จำนวนสินค้าเกินสต็อกที่มี');
            existing.qty++;
        } else {
            App.state.cart.push({ ...product, qty: 1 });
        }
        App.renderCart();
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

    removeCartItem: (index) => {
        // Confirmation for accidental clicks is good UX
        if (confirm('ต้องการลบรายการนี้ออกจากตะกร้า?')) {
            App.state.cart.splice(index, 1);
            App.renderCart();
        }
    },

    updateCartQty: (index, change) => {
        const item = App.state.cart[index];
        const newQty = item.qty + change;
        if (newQty <= 0) {
            App.state.cart.splice(index, 1);
        } else {
            const product = DB.getProducts().find(p => p.id === item.id);
            if (newQty > product.stock) return alert('เกินจำนวนสต็อก');
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
        document.getElementById('btn-clear-cart').addEventListener('click', () => {
            if (confirm('ล้างตะกร้าสินค้า?')) {
                App.state.cart = [];
                App.renderCart();
            }
        });
        document.getElementById('btn-park-cart').addEventListener('click', () => {
            if (App.state.cart.length === 0) return;
            DB.parkCart(App.state.cart);
            App.state.cart = [];
            App.renderCart();
            App.updateParkedBadge();
            alert('พักบิลเรียบร้อย');
        });
        document.getElementById('btn-parked-carts').addEventListener('click', App.showParkedCartsModal);
        document.getElementById('btn-checkout').addEventListener('click', () => {
            if (App.state.cart.length === 0) return;
            App.showPaymentModal();
        });
    },

    updateParkedBadge: () => {
        const count = DB.getParkedCarts().length;
        App.elements.parkedCount.textContent = count;
        App.elements.parkedCount.style.display = count > 0 ? 'inline-block' : 'none';
    },

    showParkedCartsModal: () => {
        const parked = DB.getParkedCarts();
        const overlay = document.getElementById('modal-overlay');
        const modal = document.getElementById('price-check-modal'); // reuse

        modal.innerHTML = `
            <h2>รายการพักบิล (${parked.length})</h2>
            <div style="display:flex; flex-direction:column; gap:10px; margin-top:15px; max-height:300px; overflow-y:auto;">
                ${parked.length === 0 ? '<p>ไม่มีรายการพักบิล</p>' : ''}
                ${parked.map(cart => `
                    <div style="border:1px solid #eee; padding:10px; border-radius:8px; display:flex; justify-content:space-between; align-items:center;">
                        <div>
                            <div style="font-weight:bold;">บิล: ${cart.id.substr(0, 8)}</div>
                            <div style="font-size:12px; color:#888;">${new Date(cart.timestamp).toLocaleTimeString('th-TH')} - ${cart.items.length} รายการ</div>
                        </div>
                        <div>
                            <button class="primary-btn" style="padding:5px 10px; font-size:14px;" onclick="App.restoreParked('${cart.id}')">เรียกคืน</button>
                            <button class="icon-btn dangerous" onclick="App.deleteParked('${cart.id}')">
                                <span class="material-symbols-rounded">delete</span>
                            </button>
                        </div>
                    </div>
                `).join('')}
            </div>
            <button class="secondary-btn" style="width:100%; margin-top:15px;" onclick="App.closeModals()">ปิด</button>
        `;
        overlay.classList.remove('hidden');
        modal.classList.remove('hidden');
    },

    restoreParked: (id) => {
        if (App.state.cart.length > 0) {
            if (!confirm('ตะกร้าปัจจุบันมีสินค้า ต้องการแทนที่หรือไม่?')) return;
        }
        const items = DB.retrieveParkedCart(id);
        if (items) {
            App.state.cart = items;
            App.renderCart();
            App.updateParkedBadge();
            App.closeModals();
        }
    },

    deleteParked: (id) => {
        if (confirm('ลบบิลนี้?')) {
            DB.removeParkedCart(id);
            App.showParkedCartsModal();
            App.updateParkedBadge();
        }
    },

    // --- Payment & Receipt ---
    showPaymentModal: () => {
        const total = parseFloat(App.elements.cartTotal.textContent.replace(/,/g, ''));
        const overlay = document.getElementById('modal-overlay');
        const modal = document.getElementById('payment-modal');

        modal.innerHTML = `
            <h2 style="text-align:center;">สรุปยอดชำระ</h2>
            <div style="text-align:center; font-size:48px; font-weight:bold; color:var(--primary-color); margin:20px 0;">
                ฿${Utils.formatCurrency(total)}
            </div>
            <label>รับเงินมา (บาท)</label>
            <input type="number" id="pay-input" style="font-size:24px; padding:10px; width:100%; text-align:center;" placeholder="จำนวนเงิน">
            <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:10px; margin-top:10px;">
                <button class="secondary-btn" onclick="document.getElementById('pay-input').value = ${Math.ceil(total)}">พอดี</button>
                <button class="secondary-btn" onclick="document.getElementById('pay-input').value = 100">100</button>
                <button class="secondary-btn" onclick="document.getElementById('pay-input').value = 500">500</button>
                <button class="secondary-btn" onclick="document.getElementById('pay-input').value = 1000">1000</button>
            </div>
            <div style="margin-top:20px; text-align:center; font-size:24px;" id="change-display">
                เงินทอน: -
            </div>
            <div style="display:flex; gap:10px; margin-top:20px;">
                <button class="secondary-btn" style="flex:1;" onclick="App.closeModals()">ยกเลิก</button>
                <button class="primary-btn" style="flex:2;" id="btn-confirm-pay" disabled>ยืนยัน & พิมพ์</button>
            </div>
        `;

        overlay.classList.remove('hidden');
        modal.classList.remove('hidden');

        const input = document.getElementById('pay-input');
        const confirmBtn = document.getElementById('btn-confirm-pay');
        const changeDisp = document.getElementById('change-display');

        const calculate = () => {
            const received = parseFloat(input.value);
            if (!isNaN(received) && received >= total) {
                const change = received - total;
                changeDisp.innerHTML = `เงินทอน: <span style="color:var(--primary-color); font-weight:bold;">${Utils.formatCurrency(change)}</span>`;
                confirmBtn.disabled = false;
            } else {
                changeDisp.textContent = 'ยอดเงินไม่พอ';
                confirmBtn.disabled = true;
            }
        };

        input.addEventListener('input', calculate);
        input.focus();
        modal.querySelectorAll('.secondary-btn').forEach(btn => btn.addEventListener('click', () => setTimeout(calculate, 0)));

        const completeSale = () => {
            const received = parseFloat(input.value);
            const change = received - total;
            // Deduct Stock & Record
            App.state.cart.forEach(item => DB.updateStock(item.id, item.qty));
            DB.recordSale({ date: new Date(), items: App.state.cart, total: total });

            App.printReceipt(total, received, change);

            App.state.cart = [];
            App.renderCart();
            App.renderView('pos'); // refresh stock
            App.closeModals();
        };

        confirmBtn.addEventListener('click', completeSale);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !confirmBtn.disabled) completeSale();
        });
    },

    printReceipt: (total, received, change) => {
        const storeName = DB.getSettings().storeName;
        const receiptHtml = `
            <div class="receipt-header">
                <h2>${storeName}</h2>
                <p>ใบเสร็จรับเงินอย่างย่อ</p>
                <p>${new Date().toLocaleString('th-TH')}</p>
            </div>
            <div class="receipt-divider"></div>
            ${App.state.cart.map(item => `
                <div class="receipt-item">
                    <span>${item.name} (${item.qty})</span>
                    <span>${Utils.formatCurrency(item.price * item.qty)}</span>
                </div>
            `).join('')}
            <div class="receipt-divider"></div>
            <div class="receipt-total">
                <span>รวมทั้งสิ้น</span>
                <span>${Utils.formatCurrency(total)}</span>
            </div>
            <div class="receipt-item">
                <span>รับเงิน</span>
                <span>${Utils.formatCurrency(received)}</span>
            </div>
            <div class="receipt-item">
                <span>เงินทอน</span>
                <span>${Utils.formatCurrency(change)}</span>
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

    closeModals: () => {
        document.getElementById('modal-overlay').classList.add('hidden');
        document.querySelectorAll('.modal').forEach(m => {
            m.classList.add('hidden');
            // FIX: Do not wipe security-modal content as it is static
            if (m.id !== 'security-modal') {
                m.innerHTML = '';
            }
        });
    }
};

// Global expose
window.App = App;
document.addEventListener('DOMContentLoaded', App.init);
