/**
 * Main Application Logic
 */

const App = {
    state: {
        cart: [],
        currentView: 'pos', // 'pos', 'stock'
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
    },

    startClock: () => {
        setInterval(() => {
            App.elements.clock.textContent = Utils.getCurrentTime();
        }, 1000);
        App.elements.clock.textContent = Utils.getCurrentTime();
    },

    // --- Navigation & Views ---
    setupNavigation: () => {
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const view = item.dataset.view;
                if (view) {
                    // Update Active Class
                    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
                    item.classList.add('active');
                    App.renderView(view);
                } else if (item.id === 'btn-check-price') {
                    App.showPriceCheckModal();
                }
            });
        });
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

    // --- Settings View (Backup/Restore) ---
    renderSettingsView: (container) => {
        container.innerHTML = `
            <h2>ตั้งค่าระบบ</h2>
            
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:20px; margin-top:20px;">
                <!-- Backup -->
                <div style="background:white; padding:20px; border-radius:8px; box-shadow:var(--shadow-sm); text-align:center;">
                    <span class="material-symbols-rounded" style="font-size:64px; color:var(--primary-color);">cloud_download</span>
                    <h3>สำรองข้อมูล (Backup)</h3>
                    <p style="color:#666; margin:10px 0;">ดาวน์โหลดข้อมูลทั้งหมดเก็บไว้ในเครื่อง</p>
                    <button class="primary-btn" onclick="App.backupData()">ดาวน์โหลดไฟล์ Backup</button>
                </div>

                <!-- Restore -->
                <div style="background:white; padding:20px; border-radius:8px; box-shadow:var(--shadow-sm); text-align:center;">
                    <span class="material-symbols-rounded" style="font-size:64px; color:var(--warning-color);">cloud_upload</span>
                    <h3>เรียกคืนข้อมูล (Restore)</h3>
                    <p style="color:#666; margin:10px 0;">นำข้อมูลกลับมา (ข้อมูลปัจจุบันจะถูกทับ)</p>
                    <input type="file" id="restore-input" accept=".json" style="display:none;" onchange="App.restoreData(this)">
                    <button class="secondary-btn" onclick="document.getElementById('restore-input').click()">เลือกไฟล์ Backup</button>
                </div>
            </div>

            <div style="margin-top:40px; text-align:center;">
                 <p style="color:#999;">Grocery POS v1.0.0 (Offline Mode)</p>
            </div>
        `;
    },

    backupData: () => {
        const json = DB.exportData();
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        const date = new Date().toISOString().slice(0, 10);
        a.href = url;
        a.download = `pos_backup_${date}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    },

    restoreData: (input) => {
        const file = input.files[0];
        if (!file) return;

        if (!confirm('คำเตือน: ข้อมูลปัจจุบันทั้งหมดจะถูกลบและแทนที่ด้วยไฟล์นี้\nคุณแน่ใจหรือไม่?')) {
            input.value = ''; // Reset
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const success = DB.importData(e.target.result);
            if (success) {
                alert('นำเข้าข้อมูลสำเร็จ! ระบบจะรีโหลด');
                location.reload();
            } else {
                alert('ผิดพลาด: ไฟล์ไม่ถูกต้อง');
            }
        };
        reader.readAsText(file);
    },

    // --- Suppliers View (Wholesale) ---
    renderSupplierView: (container) => {
        const suppliers = DB.getSuppliers();
        container.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">
                <h2>รายชื่อร้านค้าส่ง</h2>
                <button class="primary-btn" onclick="App.openSupplierModal()">+ เพิ่มร้านค้าส่ง</button>
            </div>
            
            <div class="product-grid">
                ${suppliers.map(sup => `
                    <div class="product-card" onclick="App.renderSupplierDetail('${sup.id}')" style="min-height:150px; justify-content:center;">
                        <div class="product-info" style="text-align:center;">
                            <span class="material-symbols-rounded" style="font-size:48px; color:var(--secondary-color);">store</span>
                            <div class="product-name" style="font-size:20px; margin-top:10px;">${sup.name}</div>
                            <div style="color:#666;">ติดต่อ: ${sup.contact}</div>
                            <div style="color:#666;">โทร: ${sup.phone}</div>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    },

    renderSupplierDetail: (supplierId) => {
        const suppliers = DB.getSuppliers();
        const supplier = suppliers.find(s => s.id === supplierId);
        if (!supplier) return;

        App.state.currentView = 'supplier-detail'; // Sub-view
        const container = App.elements.viewContainer;

        // Get linked products
        const myPrices = DB.getPricesBySupplier(supplierId);
        const allProducts = DB.getProducts();

        container.innerHTML = `
            <div style="display:flex; align-items:center; gap:10px; margin-bottom:1rem;">
                <button class="icon-btn" onclick="App.renderView('suppliers')">
                    <span class="material-symbols-rounded">arrow_back</span>
                </button>
                <h2>${supplier.name}</h2>
                <div style="flex:1;"></div>
                <button class="icon-btn" onclick="App.openSupplierModal('${supplier.id}')"><span class="material-symbols-rounded">edit</span></button>
                <button class="icon-btn dangerous" onclick="App.deleteSupplier('${supplier.id}')"><span class="material-symbols-rounded">delete</span></button>
            </div>

            <div style="background:white; padding:15px; border-radius:8px; display:flex; gap:20px; margin-bottom:20px; flex-wrap:wrap;">
                <div><strong>ผู้ติดต่อ:</strong> ${supplier.contact}</div>
                <div><strong>โทร:</strong> ${supplier.phone}</div>
            </div>

            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                <h3>สินค้าที่สั่งจากร้านนี้ (${myPrices.length})</h3>
                <button class="secondary-btn" onclick="App.openLinkProductModal('${supplier.id}')">+ เพิ่มรายการสินค้า</button>
            </div>

            <table style="width:100%; border-collapse: collapse; background:white; border-radius:8px; overflow:hidden;">
                <thead style="background:var(--neutral-200); text-align:left;">
                    <tr>
                        <th style="padding:10px;">สินค้า</th>
                        <th style="padding:10px;">ราคาขายหน้าร้าน</th>
                        <th style="padding:10px;">ต้นทุน (ร้านนี้)</th>
                        <th style="padding:10px;">กำไร</th>
                        <th style="padding:10px;">เปรียบเทียบ</th>
                        <th style="padding:10px;">ลบ</th>
                    </tr>
                </thead>
                <tbody>
                    ${myPrices.map(price => {
            const product = allProducts.find(p => p.id === price.productId);
            if (!product) return ''; // Zombie record

            const profit = product.price - price.cost;

            // Compare Logic
            const allSupplierCosts = DB.getPricesByProduct(product.id);
            const otherBetter = allSupplierCosts.filter(p => p.cost < price.cost && p.supplierId !== supplierId);

            let badge = '<span style="color:var(--primary-color); font-weight:bold;">★ ดีที่สุด</span>';
            if (otherBetter.length > 0) {
                const best = otherBetter.sort((a, b) => a.cost - b.cost)[0];
                const bestSup = suppliers.find(s => s.id === best.supplierId);
                // Highlight cheaper option
                badge = `<span style="color:red; font-size:14px;">ถูกกว่าที่ ${bestSup ? bestSup.name : 'อื่น'} (${Utils.formatCurrency(best.cost)})</span>`;
            } else if (allSupplierCosts.length > 1) {
                // Only this price or this is equal best
                badge = '<span style="color:var(--primary-color); font-weight:bold;">★ ดีที่สุด</span>';
            } else {
                badge = '(เจ้าเดียว)';
            }


            return `
                        <tr style="border-bottom:1px solid #eee;">
                            <td style="padding:10px;">${product.name}</td>
                            <td style="padding:10px;">${Utils.formatCurrency(product.price)}</td>
                            <td style="padding:10px; font-weight:bold;">${Utils.formatCurrency(price.cost)}</td>
                            <td style="padding:10px; color:${profit > 0 ? 'green' : 'red'};">${Utils.formatCurrency(profit)}</td>
                            <td style="padding:10px;">${badge}</td>
                            <td style="padding:10px;">
                                <button class="icon-btn dangerous" onclick="App.deleteSupplierPrice('${supplier.id}', '${product.id}')">
                                    <span class="material-symbols-rounded" style="font-size:18px;">close</span>
                                </button>
                            </td>
                        </tr>`;
        }).join('')}
                </tbody>
            </table>
        `;
    },

    openSupplierModal: (editId = null) => {
        const suppliers = DB.getSuppliers();
        const supplier = editId ? suppliers.find(s => s.id === editId) : null;

        const overlay = document.getElementById('modal-overlay');
        const modal = document.getElementById('product-modal'); // Reuse this container

        modal.innerHTML = `
            <h2>${supplier ? 'แก้ไขข้อมูลผู้ขาย' : 'เพิ่มร้านค้าส่ง'}</h2>
            <form id="supplier-form" style="display:flex; flex-direction:column; gap:10px; margin-top:15px;">
                <input type="hidden" id="s-id" value="${supplier ? supplier.id : ''}">
                
                <label>ชื่อร้าน</label>
                <input type="text" id="s-name" value="${supplier ? supplier.name : ''}" required style="padding:8px; font-size:18px;">

                <label>ชื่อคนติดต่อ</label>
                <input type="text" id="s-contact" value="${supplier ? supplier.contact : ''}" style="padding:8px; font-size:18px;">

                <label>เบอร์โทร</label>
                <input type="tel" id="s-phone" value="${supplier ? supplier.phone : ''}" style="padding:8px; font-size:18px;">

                <div style="display:flex; gap:10px; margin-top:15px;">
                    <button type="button" class="secondary-btn" style="flex:1;" onclick="App.closeModals()">ยกเลิก</button>
                    <button type="submit" class="primary-btn" style="flex:1;">บันทึก</button>
                </div>
            </form>
        `;

        document.getElementById('supplier-form').addEventListener('submit', (e) => {
            e.preventDefault();
            const id = document.getElementById('s-id').value || Utils.generateId();
            const name = document.getElementById('s-name').value;
            const contact = document.getElementById('s-contact').value;
            const phone = document.getElementById('s-phone').value;

            DB.saveSupplier({ id, name, contact, phone });
            App.closeModals();
            App.renderView('suppliers');
        });

        overlay.classList.remove('hidden');
        modal.classList.remove('hidden');
    },

    deleteSupplier: (id) => {
        if (confirm('ลบข้อมูลร้านค้านี้ และรายการราคาทั้งหมด?')) {
            DB.deleteSupplier(id);
            App.renderView('suppliers');
        }
    },

    openLinkProductModal: (supplierId) => {
        const overlay = document.getElementById('modal-overlay');
        const modal = document.getElementById('product-modal');
        const allProducts = DB.getProducts();

        modal.innerHTML = `
            <h2>เพิ่มสินค้าให้ร้านค้า</h2>
            <form id="link-form" style="display:flex; flex-direction:column; gap:10px; margin-top:15px;">
                <label>เลือกสินค้าในร้าน</label>
                <select id="l-product" style="padding:10px; font-size:16px;">
                    ${allProducts.map(p => `<option value="${p.id}">${p.name} (ขาย: ${p.price})</option>`).join('')}
                </select>

                <label>ราคาทุน (จากร้านนี้)</label>
                <input type="number" step="0.01" id="l-cost" required style="padding:10px; font-size:18px;">

                <div style="display:flex; gap:10px; margin-top:15px;">
                    <button type="button" class="secondary-btn" style="flex:1;" onclick="App.closeModals()">ยกเลิก</button>
                    <button type="submit" class="primary-btn" style="flex:1;">บันทึก</button>
                </div>
            </form>
        `;

        document.getElementById('link-form').addEventListener('submit', (e) => {
            e.preventDefault();
            const productId = document.getElementById('l-product').value;
            const cost = parseFloat(document.getElementById('l-cost').value);

            DB.saveSupplierPrice({ supplierId, productId, cost });
            App.closeModals();
            // Re-render the detail view
            App.renderSupplierDetail(supplierId);
        });

        overlay.classList.remove('hidden');
        modal.classList.remove('hidden');
    },

    deleteSupplierPrice: (supplierId, productId) => {
        if (confirm('นำรายการสินค้านี้ออกจากร้านส่งนี้?')) {
            DB.deleteSupplierPrice(supplierId, productId);
            App.renderSupplierDetail(supplierId);
        }
    },

    // --- POS View ---
    renderPOSView: (container) => {
        const grid = document.createElement('div');
        grid.className = 'product-grid';

        // Filter Products
        const query = App.state.searchQuery.toLowerCase();
        const filtered = App.state.products.filter(p =>
            p.name.toLowerCase().includes(query) ||
            p.barcode.includes(query)
        );

        if (filtered.length === 0) {
            container.innerHTML = `<div style="text-align:center; padding: 2rem; color: #888;">
                <span class="material-symbols-rounded" style="font-size: 48px;">search_off</span>
                <p>ไม่พบสินค้า</p>
            </div>`;
            return;
        }

        filtered.forEach(product => {
            const card = document.createElement('div');
            card.className = `product-card ${product.stock < 5 ? 'low-stock' : ''}`;
            card.onclick = () => App.addToCart(product);

            const imgUrl = product.image || 'assets/placeholder.png'; // Fallback would be good
            // Use a colored placeholder if no image
            const imgContent = product.image
                ? `<img src="${product.image}" class="product-img" alt="${product.name}">`
                : `<div class="product-img" style="display:flex;align-items:center;justify-content:center;color:#aaa;background:#eee;">
                        <span class="material-symbols-rounded">image</span>
                   </div>`;

            card.innerHTML = `
                ${imgContent}
                <div class="product-info">
                    <div class="product-name">${product.name}</div>
                    <div class="product-meta">
                        <div class="product-price">฿${Utils.formatCurrency(product.price)}</div>
                        <div class="stock-badge ${product.stock < 5 ? 'badge' : ''}">${product.stock} items</div>
                    </div>
                </div>
            `;
            grid.appendChild(card);
        });

        container.appendChild(grid);
    },

    // --- Stock View ---
    renderStockView: (container) => {
        container.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">
                <h2>จัดการสต็อกสินค้า</h2>
                <button class="primary-btn" onclick="App.openProductModal()">+ เพิ่มสินค้าใหม่</button>
            </div>
            <table style="width:100%; border-collapse: collapse; background:white; border-radius:8px; overflow:hidden;">
                <thead style="background:var(--neutral-200); text-align:left;">
                    <tr>
                        <th style="padding:10px;">รูป</th>
                        <th style="padding:10px;">บาร์โค้ด</th>
                        <th style="padding:10px;">ชื่อสินค้า</th>
                        <th style="padding:10px;">ราคา</th>
                        <th style="padding:10px;">คงเหลือ</th>
                        <th style="padding:10px;">จัดการ</th>
                    </tr>
                </thead>
                <tbody>
                    ${App.state.products.map(p => `
                        <tr style="border-bottom:1px solid #eee;">
                            <td style="padding:10px;">
                                <div style="width:40px;height:40px;background:#eee;border-radius:4px;overflow:hidden;">
                                    ${p.image ? `<img src="${p.image}" style="width:100%;height:100%;object-fit:cover;">` : ''}
                                </div>
                            </td>
                            <td style="padding:10px;">${p.barcode}</td>
                            <td style="padding:10px;">${p.name}</td>
                            <td style="padding:10px;">${Utils.formatCurrency(p.price)}</td>
                            <td style="padding:10px; color:${p.stock < 5 ? 'red' : 'black'}; font-weight:${p.stock < 5 ? 'bold' : 'normal'}">${p.stock}</td>
                            <td style="padding:10px;">
                                <button class="icon-btn" onclick="App.openProductModal('${p.id}')">
                                    <span class="material-symbols-rounded" style="font-size:18px;">edit</span>
                                </button>
                                <button class="icon-btn dangerous" onclick="App.deleteProduct('${p.id}')">
                                    <span class="material-symbols-rounded" style="font-size:18px;">delete</span>
                                </button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    },

    // --- Product Management (CRUD) ---
    openProductModal: (editId = null) => {
        const product = editId ? App.state.products.find(p => p.id === editId) : null;
        const modal = document.getElementById('product-modal');
        const overlay = document.getElementById('modal-overlay');

        modal.innerHTML = `
            <h2>${product ? 'แก้ไขสินค้า' : 'เพิ่มสินค้าใหม่'}</h2>
            <form id="product-form" style="display:flex; flex-direction:column; gap:10px; margin-top:15px;">
                <input type="hidden" id="p-id" value="${product ? product.id : ''}">
                
                <label>บาร์โค้ด (Scan หรือ พิมพ์)</label>
                <div style="display:flex; gap:5px;">
                    <input type="text" id="p-barcode" value="${product ? product.barcode : ''}" required style="flex:1; padding:8px; font-size:18px;">
                    <button type="button" class="secondary-btn" onclick="document.getElementById('p-barcode').focus()">Scan</button>
                </div>

                <label>ชื่อสินค้า</label>
                <input type="text" id="p-name" value="${product ? product.name : ''}" required style="padding:8px; font-size:18px;">

                <div style="display:flex; gap:10px;">
                    <div style="flex:1;">
                        <label>ราคา (บาท)</label>
                        <input type="number" id="p-price" value="${product ? product.price : ''}" required style="width:100%; padding:8px; font-size:18px;">
                    </div>
                    <div style="flex:1;">
                        <label>จำนวนสต็อก</label>
                        <input type="number" id="p-stock" value="${product ? product.stock : ''}" required style="width:100%; padding:8px; font-size:18px;">
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

        // Handle Image Preview
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

            // Handle Submit
            document.getElementById('product-form').addEventListener('submit', (e) => {
                e.preventDefault();
                const id = document.getElementById('p-id').value || Utils.generateId();
                const barcode = document.getElementById('p-barcode').value;
                const name = document.getElementById('p-name').value;
                const price = parseFloat(document.getElementById('p-price').value);
                const stock = parseInt(document.getElementById('p-stock').value);
                const existingImage = product ? product.image : null;
                const newImage = preview.dataset.base64 || existingImage;

                const newProduct = { id, barcode, name, price, stock, image: newImage };
                DB.saveProduct(newProduct);
                App.closeModals();
                App.renderView('stock'); // Refresh
            });
        }, 100);

        overlay.classList.remove('hidden');
        modal.classList.remove('hidden');
    },

    deleteProduct: (id) => {
        if (confirm('ต้องการลบสินค้านี้ใช่หรือไม่?')) {
            DB.deleteProduct(id);
            App.renderView('stock');
        }
    },

    // --- Global Search & Scan Logic ---
    setupGlobalInput: () => {
        const input = App.elements.globalSearch;
        let timeout = null;

        // Search Filter (Debounced)
        input.addEventListener('input', (e) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => {
                const val = e.target.value;
                App.state.searchQuery = val;

                // If it looks like a barcode (digits > 8), try to act on it
                if (/^\d{8,14}$/.test(val)) {
                    App.handleBarcodeScan(val);
                    input.value = ''; // Clear after scan
                    App.state.searchQuery = '';
                } else {
                    // Just filter view
                    if (App.state.currentView === 'pos') App.renderView('pos');
                }
            }, 300); // Wait for scanner to finish typing potentially
        });

        // Focus search when pressing Enter anywhere (optional, maybe not for iPad)
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !document.querySelector('.modal:not(.hidden)')) {
                input.focus();
            }
        });

        // Scan Trigger Button (for mobile camera - mock for now or focus input)
        document.getElementById('btn-scan-trigger').addEventListener('click', () => {
            input.focus();
            // In a real PWA on mobile, this could open camera stream
            alert('ใช้เครื่องสแกน ยิงบาร์โค้ดได้เลย\n(Focus on search box)');
        });
    },

    handleBarcodeScan: (barcode) => {
        const product = DB.getProductByBarcode(barcode);
        if (product) {
            if (App.state.currentView === 'pos') {
                App.addToCart(product);
                // Visual feedback?
            } else if (App.state.currentView === 'stock') {
                App.openProductModal(product.id);
            }
        } else {
            // Product not found
            if (confirm(`ไม่พบสินค้า ${barcode}\nต้องการเพิ่มสินค้าใหม่หรือไม่?`)) {
                // Switch to stock and open add modal
                // Set nav to stock
                document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
                document.querySelector('[data-view="stock"]').classList.add('active');
                App.renderView('stock');

                setTimeout(() => { // Wait for view render
                    App.openProductModal();
                    // Pre-fill barcode
                    setTimeout(() => {
                        document.getElementById('p-barcode').value = barcode;
                    }, 200);
                }, 100);
            }
        }
    },

    // --- Cart Logic ---
    addToCart: (product) => {
        const existing = App.state.cart.find(item => item.id === product.id);

        if (product.stock <= 0) {
            alert('สินค้าหมดสตรอก!');
            return;
        }

        if (existing) {
            if (existing.qty + 1 > product.stock) {
                alert('จำนวนสินค้าเกินสต็อกที่มี');
                return;
            }
            existing.qty++;
        } else {
            App.state.cart.push({ ...product, qty: 1 });
        }
        App.renderCart();
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

        document.getElementById('btn-parked-carts').addEventListener('click', () => {
            App.showParkedCartsModal();
        });

        document.getElementById('btn-checkout').addEventListener('click', () => {
            if (App.state.cart.length === 0) return;
            App.showPaymentModal();
        });
    },

    renderCart: () => {
        const container = App.elements.cartItemsContainer;
        const totalEl = App.elements.cartTotal;

        if (App.state.cart.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <span class="material-symbols-rounded" style="font-size:48px; color:#ccc;">shopping_cart_off</span>
                    <p style="color:#aaa;">ยังไม่มีสินค้า</p>
                </div>`;
            totalEl.textContent = '0.00';
            return;
        }

        container.innerHTML = '';
        let total = 0;

        App.state.cart.forEach((item, index) => {
            const itemTotal = item.price * item.qty;
            total += itemTotal;

            const div = document.createElement('div');
            div.className = 'cart-item';
            div.innerHTML = `
                <div class="cart-item-info">
                    <h4>${item.name}</h4>
                    <div style="font-size:14px; color:#888;">฿${Utils.formatCurrency(item.price)} x ${item.qty}</div>
                </div>
                <div style="text-align:right;">
                    <div style="font-weight:bold;">${Utils.formatCurrency(itemTotal)}</div>
                    <div class="cart-item-controls">
                        <button class="qty-btn" onclick="App.updateCartQty(${index}, -1)">-</button>
                        <span>${item.qty}</span>
                        <button class="qty-btn" onclick="App.updateCartQty(${index}, 1)">+</button>
                    </div>
                </div>
            `;
            container.appendChild(div);
        });

        totalEl.textContent = Utils.formatCurrency(total);
    },

    updateCartQty: (index, change) => {
        const item = App.state.cart[index];
        const newQty = item.qty + change;

        // Check stock
        const product = App.state.products.find(p => p.id === item.id);
        if (newQty > product.stock) {
            alert('เกินจำนวนสต็อก');
            return;
        }

        if (newQty <= 0) {
            App.state.cart.splice(index, 1);
        } else {
            item.qty = newQty;
        }
        App.renderCart();
    },

    // --- Parked Carts Logic ---
    updateParkedBadge: () => {
        const parked = DB.getParkedCarts();
        const count = parked.length;
        App.elements.parkedCount.textContent = count;
        App.elements.parkedCount.style.display = count > 0 ? 'inline-block' : 'none';
    },

    showParkedCartsModal: () => {
        const parked = DB.getParkedCarts();
        const overlay = document.getElementById('modal-overlay');
        const modal = document.getElementById('price-check-modal'); // Reusing or create generic modal container?
        // Let's use generic approach

        // Clear previous content
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
            App.showParkedCartsModal(); // Re-render logic inside would be better, but this works strictly
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
            
            <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px; margin-top:10px;">
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
                <button class="primary-btn" style="flex:2;" id="btn-confirm-pay" disabled>ยืนยัน & พิมพ์ (Enter)</button>
            </div>
        `;

        overlay.classList.remove('hidden');
        modal.classList.remove('hidden');

        // Logic for input
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

        // Quick button handlers already inline, but they need to trigger calculate
        modal.querySelectorAll('.secondary-btn').forEach(btn => {
            btn.addEventListener('click', () => setTimeout(calculate, 0));
        });

        const completeSale = () => {
            const received = parseFloat(input.value);
            const change = received - total;

            // 1. Deduct Stock
            App.state.cart.forEach(item => {
                DB.updateStock(item.id, item.qty);
            });

            // 2. Record Sale (Optional logging)
            DB.recordSale({
                date: new Date(),
                items: App.state.cart,
                total: total
            });

            // 3. Print
            App.printReceipt(total, received, change);

            // 4. Reset
            App.state.cart = [];
            App.renderCart();
            App.state.products = DB.getProducts(); // Refresh stock in memory
            if (App.state.currentView === 'pos') App.renderPOSView(App.elements.viewContainer);

            App.closeModals();
        };

        confirmBtn.addEventListener('click', completeSale);

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !confirmBtn.disabled) {
                completeSale();
            }
        });
    },

    printReceipt: (total, received, change) => {
        const receiptHtml = `
            <div class="receipt-header">
                <h2>ร้านชำขายดี</h2>
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
        // Blur bg input to prevent conflict
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
                        <img src="${product.image || ''}" style="max-height:100px; margin:10px 0;">
                        <div style="font-size:48px; color:var(--primary-color);">฿${Utils.formatCurrency(product.price)}</div>
                        <div style="color:${product.stock < 5 ? 'red' : 'gray'}">คงเหลือ: ${product.stock}</div>
                    `;
                    input.value = ''; // Prepare for next scan
                } else {
                    if (val.length > 8) { // Only show not found for long strings to avoid noise while typing
                        result.innerHTML = '<div style="color:red; font-size:20px;">ไม่พบสินค้า</div>';
                    }
                }
            }, 300);
        });
    },

    // --- Utils ---
    closeModals: () => {
        document.getElementById('modal-overlay').classList.add('hidden');
        document.querySelectorAll('.modal').forEach(m => {
            m.classList.add('hidden');
            m.innerHTML = ''; // Cleanup
        });
        App.renderView(App.state.currentView); // Refresh view to ensure consistency
    }
};

// Global expose for event handlers in HTML strings
window.App = App;

// Start
document.addEventListener('DOMContentLoaded', App.init);
