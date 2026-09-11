// ============================================================================
// MEAT CITY Web ERP & Finance Management System Logic
// ============================================================================

// Global State
let activeTab = 'dashboard';
let globalItems = [];
let globalCounterparties = [];
let globalAccounts = [];
let globalBOMs = [];
let globalDashboardData = null;
let globalSupplierGroups = [];
let globalItemGroups = [];

let salesChartInstance = null;
let topProductsChartInstance = null;

// Currency & Number Formatter (1C Style)
function formatUzs(amount, showSymbol = false) {
  if (typeof currentUser !== 'undefined' && currentUser && typeof hasPerm === 'function' && !hasPerm('view_prices')) {
    return showSymbol ? '*** UZS' : '***';
  }
  if (amount === undefined || amount === null || isNaN(amount)) return '0,00';
  const num = Number(amount);
  const parts = num.toFixed(2).split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const formatted = parts.join(',');
  return showSymbol ? `${formatted} UZS` : formatted;
}

// Xavfsiz HTML & JavaScript string escaping
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeJs(str) {
  if (str === null || str === undefined) return '';
  return encodeURIComponent(String(str)).replace(/'/g, '%27');
}

// Sahifa yuklanganda ishga tushirish
document.addEventListener('DOMContentLoaded', () => {
  // Bugungi sanani inputlarga o'rnatish
  const today = new Date().toISOString().slice(0, 10);
  const dateInputs = ['pur-doc-date', 'sale-doc-date', 'prod-doc-date', 'mo-date'];
  dateInputs.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = today;
  });

  // Taktil va interaktiv harakatlarni ishga tushirish
  initKineticInteractions();

  // Kirishdagi premium splash animatsiyasini boshlash
  initSplashScreen();

  // RBAC & Foydalanuvchi tizimini ishga tushirish
  initAuthAndRbac();

  // Hamma ma'lumotlarni yuklash
  refreshAllData();
});

// Barcha ma'lumotlarni serverdan qayta yuklash
async function refreshAllData() {
  await Promise.all([
    fetchDashboardData(),
    fetchItems(),
    fetchCounterparties(),
    fetchAccounts(),
    fetchBOMs(),
    fetchPurchases(),
    fetchSales(),
    fetchProductions(),
    fetchMoneyMovements(),
    fetchReports(),
    fetchCatalogGroups()
  ]);
}

// Katalog guruhlarini serverdan olish
async function fetchCatalogGroups() {
  try {
    const [resSup, resItem] = await Promise.all([
      fetch('/api/groups?type=supplier'),
      fetch('/api/groups?type=item')
    ]);
    const supData = await resSup.json();
    const itemData = await resItem.json();

    if (supData.success) globalSupplierGroups = supData.data || [];
    if (itemData.success) globalItemGroups = itemData.data || [];

    populateGroupSelects();
  } catch (err) {
    console.warn('Guruhlarni yuklashda xatolik:', err);
  }
}

function populateGroupSelects() {
  // 1. cp-group select (modal-counterparty)
  const cpGroupSelect = document.getElementById('cp-group');
  if (cpGroupSelect) {
    const currVal = cpGroupSelect.value;
    let html = '<option value="">-- Guruhsiz (Umumiy) --</option>';
    globalSupplierGroups.forEach(g => {
      html += `<option value="${g.name}">${g.name}</option>`;
    });
    cpGroupSelect.innerHTML = html;
    if (currVal) cpGroupSelect.value = currVal;
  }

  // 2. item-group select (modal-item)
  const itemGroupSelect = document.getElementById('item-group');
  if (itemGroupSelect) {
    const currVal = itemGroupSelect.value;
    let html = '<option value="">-- Guruhsiz (Papkaga kirmagan) --</option>';
    globalItemGroups.forEach(g => {
      html += `<option value="${g.name}">${g.name}</option>`;
    });
    itemGroupSelect.innerHTML = html;
    if (currVal) itemGroupSelect.value = currVal;
  }
}

// Tablarni almashtirish (1C bo'limlari o'rtasida navigatsiya)
function switchTab(tabId) {
  if (typeof hasPerm === 'function' && !hasPerm(tabId)) {
    alert(`Ruxsat cheklangan: Ushbu "${tabId}" bo'limiga kirish uchun sizning rolingizda ruxsat yo'q!`);
    return;
  }
  activeTab = tabId;

  // Barcha bo'limlarni yashirish
  const sections = ['dashboard', 'purchases', 'production', 'sales', 'money', 'stock', 'reports', 'catalogs'];
  sections.forEach(s => {
    const secEl = document.getElementById(`section-${s}`);
    const navEl = document.getElementById(`nav-${s}`);
    if (secEl) secEl.classList.add('hidden');
    if (navEl) {
      navEl.classList.remove('bg-rose-600', 'text-white', 'shadow-md', 'shadow-rose-950/40', 'border-amber-400', 'font-bold');
      navEl.classList.add('text-gray-400', 'border-transparent');
    }
  });

  // Tanlangan bo'limni chiroyli glide effekti bilan ko'rsatish
  const targetSection = document.getElementById(`section-${tabId}`);
  const targetNav = document.getElementById(`nav-${tabId}`);
  if (targetSection) {
    targetSection.classList.remove('hidden');
    targetSection.classList.remove('animate-section-enter');
    void targetSection.offsetWidth; // Force CSS reflow
    targetSection.classList.add('animate-section-enter');
  }
  if (targetNav) {
    targetNav.classList.remove('text-gray-400', 'border-transparent');
    targetNav.classList.add('bg-rose-600', 'text-white', 'shadow-md', 'shadow-rose-950/40', 'border-amber-400', 'font-bold');
    
    // Tab ichidagi belgiga (icon) kichik harakat berish
    const icon = targetNav.querySelector('i');
    if (icon) {
      icon.classList.remove('text-jiggle');
      void icon.offsetWidth;
      icon.classList.add('text-jiggle');
    }
  }

  // Yuqori paneldagi sarlavhani yangilash
  const topbarTitle = document.getElementById('topbar-active-module-title');
  if (topbarTitle && targetNav) {
    const iconCls = targetNav.querySelector('i')?.className || 'fa-solid fa-chart-pie';
    const text = targetNav.querySelector('span')?.innerText || tabId;
    topbarTitle.innerHTML = `<i class="${iconCls} text-rose-500 text-sm"></i> <span class="font-bold text-white text-sm">${escapeHtml(text)}</span>`;
  }

  // Mobil qurilmalarda menyuni avtomatik yopish
  if (typeof closeMobileSidebar === 'function' && window.innerWidth < 768) {
    closeMobileSidebar();
  }

  // Tovush effekti
  if (typeof playOpenSound === 'function') {
    playOpenSound();
  }

  // Agar grafikli bo'lim ochilsa, qayta chizish
  if (tabId === 'dashboard' && globalDashboardData) {
    renderCharts(globalDashboardData);
  }

  // Agar spravochniklar bo'limi ochilsa, jadvallarni chizish
  if (tabId === 'catalogs') {
    renderCatalogs();
  }
}

// Mobil chap menyuni ochish/yopish (Mobile Sidebar Drawer)
function toggleMobileSidebar() {
  const sidebar = document.getElementById('main-sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  if (!sidebar) return;
  const isClosed = sidebar.classList.contains('-translate-x-full');
  if (isClosed) {
    sidebar.classList.remove('-translate-x-full');
    if (backdrop) backdrop.classList.remove('hidden');
  } else {
    sidebar.classList.add('-translate-x-full');
    if (backdrop) backdrop.classList.add('hidden');
  }
}

function closeMobileSidebar() {
  const sidebar = document.getElementById('main-sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  if (sidebar) sidebar.classList.add('-translate-x-full');
  if (backdrop) backdrop.classList.add('hidden');
}

// ----------------------------------------------------------------------------
// 1. DASHBOARD VA ASOSIY KARTALAR
// ----------------------------------------------------------------------------
async function fetchDashboardData() {
  try {
    const res = await fetch('/api/dashboard');
    const result = await res.json();
    if (result.success && result.data) {
      globalDashboardData = result.data;
      renderDashboard(result.data);
    }
  } catch (err) {
    console.error('Dashboard ma\'lumotlarini yuklashda xato:', err);
  }
}

function renderDashboard(data) {
  // 4 ta asosiy karta
  document.getElementById('kpi-kassa').innerText = formatUzs(data.kassa_total);
  document.getElementById('kpi-bank').innerText = formatUzs(data.bank_total);
  document.getElementById('kpi-usd-kassa').innerText = `$${formatUzs(data.usd_kassa).split(',')[0]}`;
  document.getElementById('kpi-debitor').innerText = formatUzs(data.debitor_total);
  document.getElementById('kpi-kreditor').innerText = formatUzs(data.kreditor_total);

  // Grafiklar
  renderCharts(data);

  // Chuqur analitika: Top tovarlar, Muzlagan tovarlar, Top xomashyolar, Muzlagan xomashyolar
  renderAnalytics(data.analytics);
}

// ----------------------------------------------------------------------------
// CHUQUR ANALITIKA VIDJETLARINI CHIZISH
// ----------------------------------------------------------------------------
function renderAnalytics(analytics) {
  if (!analytics) return;

  // Jami muzlagan mablag'
  const frozenTotalEl = document.getElementById('analytics-total-frozen');
  if (frozenTotalEl) {
    frozenTotalEl.innerText = `${formatUzs(analytics.total_frozen_sum)} UZS`;
  }

  // 1. Top Sotuvdagi Tovarlar
  const topSellingEl = document.getElementById('analytics-top-selling-list');
  if (topSellingEl) {
    if (!analytics.top_selling || analytics.top_selling.length === 0) {
      topSellingEl.innerHTML = `<span class="text-gray-500 italic p-2 block">Hozircha sotuvlar yo'q</span>`;
    } else {
      topSellingEl.innerHTML = analytics.top_selling.map((item, idx) => `
        <div class="p-2.5 bg-gray-950/80 rounded-lg border border-gray-800 flex items-center justify-between hover:border-emerald-700/50 transition">
          <div class="space-y-0.5">
            <div class="flex items-center gap-1.5">
              <span class="w-4 h-4 rounded-full bg-emerald-950 text-emerald-400 font-mono font-bold text-[10px] flex items-center justify-center">${idx + 1}</span>
              <strong class="text-white text-[11px] truncate max-w-[130px] block">${item.name}</strong>
            </div>
            <span class="text-[10px] text-gray-400 font-mono">Sotildi: <b>${formatUzs(item.sold_qty).split(',')[0]} ${item.unit}</b></span>
          </div>
          <div class="text-right">
            <span class="font-mono text-emerald-400 font-extrabold text-[11px] block">${formatUzs(item.total_revenue)} UZS</span>
            <span class="text-[9px] px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 font-bold border border-emerald-800/40">
              Foyda: +${formatUzs(item.total_profit).split(',')[0]} (${item.margin_pct}%)
            </span>
          </div>
        </div>
      `).join('');
    }
  }

  // 2. Muzlab Qolgan Tayyor Mahsulotlar (Dead Stock)
  const deadFinishedEl = document.getElementById('analytics-dead-finished-list');
  if (deadFinishedEl) {
    if (!analytics.dead_finished || analytics.dead_finished.length === 0) {
      deadFinishedEl.innerHTML = `<span class="text-emerald-400 italic p-2 block">Muzlagan tovarlar mavjud emas! Barcha tovarlar faol aylanmoqda.</span>`;
    } else {
      deadFinishedEl.innerHTML = analytics.dead_finished.map((item, idx) => `
        <div class="p-2.5 bg-gray-950/80 rounded-lg border border-rose-900/40 flex items-center justify-between hover:border-rose-700 transition">
          <div class="space-y-0.5">
            <strong class="text-rose-200 text-[11px] truncate max-w-[130px] block">${item.name}</strong>
            <span class="text-[10px] text-gray-400 font-mono">Zaxira: <b>${formatUzs(item.stock_qty).split(',')[0]} ${item.unit}</b></span>
          </div>
          <div class="text-right">
            <span class="font-mono text-rose-400 font-extrabold text-[11px] block">${formatUzs(item.frozen_capital)} UZS</span>
            <span class="text-[9px] px-1.5 py-0.5 rounded bg-rose-950 text-rose-300 font-bold border border-rose-800/60">
              ${item.sold_qty === 0 ? 'Sotuv 0 (Muzlagan)' : 'Sekin sotuv'}
            </span>
          </div>
        </div>
      `).join('');
    }
  }

  // 3. Top Eng Zo'r Xomashyolar (Top Raw Materials)
  const topRawEl = document.getElementById('analytics-top-raw-list');
  if (topRawEl) {
    if (!analytics.top_raw || analytics.top_raw.length === 0) {
      topRawEl.innerHTML = `<span class="text-gray-500 italic p-2 block">Xomashyo sarfi hali boshlanmagan</span>`;
    } else {
      topRawEl.innerHTML = analytics.top_raw.map((item, idx) => `
        <div class="p-2.5 bg-gray-950/80 rounded-lg border border-gray-800 flex items-center justify-between hover:border-cyan-700/50 transition">
          <div class="space-y-0.5">
            <strong class="text-cyan-200 text-[11px] truncate max-w-[130px] block">${item.name}</strong>
            <span class="text-[10px] text-gray-400 font-mono">Sarflangan: <b>${formatUzs(item.consumed_qty).split(',')[0]} ${item.unit}</b></span>
          </div>
          <div class="text-right">
            <span class="font-mono text-cyan-400 font-extrabold text-[11px] block">${formatUzs(item.total_consumed_cost)} UZS</span>
            <span class="text-[9px] text-gray-500 font-mono block">Qoldiq: ${formatUzs(item.stock_qty).split(',')[0]} ${item.unit}</span>
          </div>
        </div>
      `).join('');
    }
  }

  // 4. Muzlagan Xomashyolar (Dead Raw Materials)
  const deadRawEl = document.getElementById('analytics-dead-raw-list');
  if (deadRawEl) {
    if (!analytics.dead_raw || analytics.dead_raw.length === 0) {
      deadRawEl.innerHTML = `<span class="text-emerald-400 italic p-2 block">Ortiqcha muzlagan xomashyolar yo'q.</span>`;
    } else {
      deadRawEl.innerHTML = analytics.dead_raw.map((item, idx) => `
        <div class="p-2.5 bg-gray-950/80 rounded-lg border border-amber-900/40 flex items-center justify-between hover:border-amber-700 transition">
          <div class="space-y-0.5">
            <strong class="text-amber-200 text-[11px] truncate max-w-[130px] block">${item.name}</strong>
            <span class="text-[10px] text-gray-400 font-mono">Yotgan hajm: <b>${formatUzs(item.stock_qty).split(',')[0]} ${item.unit}</b></span>
          </div>
          <div class="text-right">
            <span class="font-mono text-amber-400 font-extrabold text-[11px] block">${formatUzs(item.frozen_capital)} UZS</span>
            <span class="text-[9px] px-1.5 py-0.5 rounded bg-amber-950 text-amber-300 font-bold border border-amber-800/60">
              ${item.consumed_qty === 0 ? 'Sarflanmagan' : 'Katta zaxira'}
            </span>
          </div>
        </div>
      `).join('');
    }
  }
}

function renderCharts(data) {
  // 1. Sotuv Dinamikasi Chiziqli Grafigi (Line chart)
  const salesCtx = document.getElementById('salesChart');
  if (salesCtx) {
    if (salesChartInstance) salesChartInstance.destroy();

    const labels = (data.sales_daily || []).map(s => s.doc_date);
    const amounts = (data.sales_daily || []).map(s => s.total);

    salesChartInstance = new Chart(salesCtx, {
      type: 'line',
      data: {
        labels: labels.length ? labels : ['Hozircha ma\'lumot yo\'q'],
        datasets: [{
          label: 'ZAVOD Sotuv Dinamikasi (UZS)',
          data: amounts.length ? amounts : [0],
          borderColor: '#38bdf8',
          backgroundColor: 'rgba(56, 189, 248, 0.1)',
          borderWidth: 2.5,
          pointBackgroundColor: '#0284c7',
          pointBorderColor: '#ffffff',
          pointRadius: 5,
          pointHoverRadius: 7,
          fill: true,
          tension: 0.35
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => `Sotuv: ${formatUzs(ctx.parsed.y)} UZS`
            }
          }
        },
        scales: {
          x: {
            grid: { color: 'rgba(55, 65, 81, 0.3)' },
            ticks: { color: '#9ca3af', font: { family: 'Plus Jakarta Sans', size: 11 } }
          },
          y: {
            grid: { color: 'rgba(55, 65, 81, 0.3)' },
            ticks: {
              color: '#9ca3af',
              font: { family: 'JetBrains Mono', size: 10 },
              callback: (val) => `${(val / 1000000000).toFixed(1)} mlrd`
            }
          }
        }
      }
    });
  }

  // 2. Top Sotilayotgan Mahsulotlar (Doughnut / Pie chart)
  const topCtx = document.getElementById('topProductsChart');
  if (topCtx) {
    if (topProductsChartInstance) topProductsChartInstance.destroy();

    const topItems = data.top_products || [];
    const labels = topItems.map(t => t.name);
    const sums = topItems.map(t => t.total_sum);

    const colors = [
      '#f43f5e', '#fb7185', '#38bdf8', '#0ea5e9', '#34d399', 
      '#10b981', '#fbbf24', '#f59e0b', '#a855f7', '#8b5cf6',
      '#ec4899', '#f97316', '#06b6d4', '#14b8a6', '#6366f1'
    ];

    topProductsChartInstance = new Chart(topCtx, {
      type: 'doughnut',
      data: {
        labels: labels.length ? labels : ['Hozircha sotuv yo\'q'],
        datasets: [{
          data: sums.length ? sums : [0],
          backgroundColor: labels.length ? colors.slice(0, labels.length) : ['#374151'],
          borderColor: '#0B0F19',
          borderWidth: 2,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'right',
            labels: {
              color: '#d1d5db',
              font: { family: 'Plus Jakarta Sans', size: 10 },
              boxWidth: 12
            }
          },
          tooltip: {
            callbacks: {
              label: (ctx) => `${ctx.label}: ${formatUzs(ctx.parsed)} UZS`
            }
          }
        },
        cutout: '55%'
      }
    });
  }
}

// ----------------------------------------------------------------------------
// 2. NOMENKLATURA VA OMBOR (Items & Stock)
// ----------------------------------------------------------------------------
async function fetchItems() {
  try {
    const res = await fetch('/api/items');
    const result = await res.json();
    if (result.success) {
      globalItems = result.data || [];
      renderStockTable(globalItems);
      populateItemSelects();
      if (activeTab === 'catalogs') renderCatalogs();
    }
  } catch (err) {
    console.error('Nomenklaturani yuklashda xato:', err);
  }
}

function renderStockTable(items) {
  const tbody = document.getElementById('stock-table-body');
  if (!tbody) return;

  if (items.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="px-4 py-8 text-center text-gray-500">Hozircha omborda mahsulotlar mavjud emas. Yangi nomenklatura qo'shing.</td></tr>`;
    return;
  }

  tbody.innerHTML = items.map(it => {
    let catBadge = '';
    if (it.category === 'raw') catBadge = '<span class="px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800/60 font-semibold">Xomashyo</span>';
    else if (it.category === 'finished') catBadge = '<span class="px-2 py-0.5 rounded bg-blue-950 text-blue-400 border border-blue-800/60 font-semibold">Tayyor Mahsulot</span>';
    else if (it.category === 'packaging') catBadge = '<span class="px-2 py-0.5 rounded bg-amber-950 text-amber-400 border border-amber-800/60 font-semibold">Qadoqlash</span>';
    else catBadge = '<span class="px-2 py-0.5 rounded bg-gray-800 text-gray-400">Yarim tayyor</span>';

    const totalVal = (Number(it.stock_qty) || 0) * (Number(it.cost_price) || 0);

    return `
      <tr class="hover:bg-gray-800/40 transition">
        <td class="px-4 py-3 font-semibold text-white">${it.name}</td>
        <td class="px-4 py-3">${catBadge}</td>
        <td class="px-4 py-3 font-mono text-gray-400">${it.unit}</td>
        <td class="px-4 py-3 text-right font-mono font-bold ${it.stock_qty > 0 ? 'text-emerald-400' : 'text-gray-500'}">
          ${formatUzs(it.stock_qty).split(',')[0]} ${it.unit}
        </td>
        <td class="px-4 py-3 text-right font-mono text-gray-300">${formatUzs(it.cost_price)}</td>
        <td class="px-4 py-3 text-right font-mono font-bold text-teal-300">${formatUzs(totalVal)} UZS</td>
        <td class="px-4 py-3 text-right font-mono text-blue-400">${it.sale_price > 0 ? formatUzs(it.sale_price) + ' UZS' : '-'}</td>
      </tr>
    `;
  }).join('');
}

function filterStock(category) {
  document.querySelectorAll('.stock-filter-btn').forEach(btn => {
    btn.classList.remove('bg-gray-800', 'text-white');
    btn.classList.add('bg-gray-900', 'text-gray-400');
  });
  event.target.classList.remove('bg-gray-900', 'text-gray-400');
  event.target.classList.add('bg-gray-800', 'text-white');

  if (category === 'all') {
    renderStockTable(globalItems);
  } else {
    const filtered = globalItems.filter(i => i.category === category);
    renderStockTable(filtered);
  }
}

function populateItemSelects() {
  // Kirim modali: xomashyo va qadoqlar
  const purSelect = document.getElementById('pur-item-select');
  if (purSelect) {
    purSelect.innerHTML = globalItems.map(i => `
      <option value="${i.id}">${i.name} (${i.category === 'raw' ? 'Xomashyo' : i.category === 'packaging' ? 'Qadoq' : 'Mahsulot'}) - ${i.unit}</option>
    `).join('');
  }

  // Sotuv modali: faqat tayyor mahsulotlar
  const saleSelect = document.getElementById('sale-item-select');
  if (saleSelect) {
    const finishedItems = globalItems.filter(i => i.category === 'finished');
    saleSelect.innerHTML = finishedItems.map(i => `
      <option value="${i.id}" data-price="${i.sale_price}">${i.name} (Qoldiq: ${i.stock_qty} ${i.unit})</option>
    `).join('');
    autoFillSalePrice();
  }

  // Ishlab chiqarish modali: tayyor mahsulotlar
  const prodSelect = document.getElementById('prod-finished-item');
  if (prodSelect) {
    const finishedItems = globalItems.filter(i => i.category === 'finished');
    prodSelect.innerHTML = finishedItems.map(i => `
      <option value="${i.id}">${i.name} (${i.unit})</option>
    `).join('');
    previewProductionRecipe();
  }
}

function autoFillSalePrice() {
  const select = document.getElementById('sale-item-select');
  const priceInput = document.getElementById('sale-price');
  if (select && priceInput && select.selectedOptions[0]) {
    const price = select.selectedOptions[0].getAttribute('data-price');
    if (price && Number(price) > 0) {
      priceInput.value = price;
    }
  }
}

// ----------------------------------------------------------------------------
// 3. KONTRAGENTLAR (Mijozlar va Ta'minotchilar)
// ----------------------------------------------------------------------------
async function fetchCounterparties() {
  try {
    const res = await fetch('/api/counterparties');
    const result = await res.json();
    if (result.success) {
      globalCounterparties = result.data || [];
      populateCounterpartySelects();
      if (activeTab === 'catalogs') renderCatalogs();
    }
  } catch (err) {
    console.error('Kontragentlarni yuklashda xato:', err);
  }
}

function populateCounterpartySelects() {
  // Kirim: Ta'minotchilar datalist
  const purDatalist = document.getElementById('pur-counterparties-list');
  if (purDatalist) {
    const suppliers = globalCounterparties.filter(c => c.type === 'supplier' || c.type === 'both');
    purDatalist.innerHTML = `<option value="📂 Hammasini ko'rsatish (Guruhlar / Показать все)...">Barcha guruhlarni ochish</option>` +
      suppliers.map(s => `<option value="${escapeHtml(s.name)}">${escapeHtml(s.name)} (${escapeHtml(s.phone || '')})</option>`).join('');
  }

  // Sotuv: Xaridorlar
  const saleCp = document.getElementById('sale-counterparty');
  if (saleCp) {
    const customers = globalCounterparties.filter(c => c.type === 'customer' || c.type === 'both');
    saleCp.innerHTML = customers.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  }

  // Pul orderi kontragent tanlash
  const moCp = document.getElementById('mo-counterparty');
  if (moCp) {
    moCp.innerHTML = `<option value="">-- Tanlanmagan (Boshqa) --</option>` +
      globalCounterparties.map(c => `<option value="${c.id}">${c.name} (${c.type === 'customer' ? 'Xaridor' : 'Ta\'minotchi'})</option>`).join('');
  }

  // Sverka tanlash
  const sverkaCp = document.getElementById('sverka-counterparty-select');
  if (sverkaCp) {
    sverkaCp.innerHTML = `<option value="">-- Kontragentni tanlang --</option>` +
      globalCounterparties.map(c => `<option value="${c.id}">${c.name} (${c.type === 'customer' ? 'Xaridor' : 'Ta\'minotchi'})</option>`).join('');
  }
}

// ----------------------------------------------------------------------------
// 4. RETSEPTURA / BOM (Me'yoriy Tarkib)
// ----------------------------------------------------------------------------
async function fetchBOMs() {
  try {
    const res = await fetch('/api/bom');
    const result = await res.json();
    if (result.success) {
      globalBOMs = result.data || [];
      renderBOMCards(globalBOMs);
    }
  } catch (err) {
    console.error('BOM yuklashda xato:', err);
  }
}

function renderBOMCards(boms) {
  const container = document.getElementById('bom-cards-container');
  if (!container) return;

  if (boms.length === 0) {
    container.innerHTML = `<p class="text-xs text-gray-500 italic p-3">Hozircha retseptlar mavjud emas.</p>`;
    return;
  }

  container.innerHTML = boms.map(b => {
    const ingList = (b.ingredients || []).map(ing => `
      <div class="flex justify-between py-1 border-b border-gray-800/40 text-[11px]">
        <span class="text-gray-400">• ${ing.raw_name} (${ing.quantity} ${ing.unit})</span>
        <span class="font-mono text-gray-300 font-semibold">${formatUzs(ing.ingredient_cost)} UZS</span>
      </div>
    `).join('');

    return `
      <div class="bg-gray-950/80 p-3.5 rounded-xl border border-gray-800 space-y-2">
        <div class="flex items-center justify-between">
          <strong class="text-rose-300 font-bold text-xs">${b.name}</strong>
          <span class="text-[10px] px-2 py-0.5 bg-purple-950 text-purple-300 rounded border border-purple-800/60 font-mono font-bold">
            1 ${b.unit} tannarxi: ${formatUzs(b.calculated_cost)} UZS
          </span>
        </div>
        <div class="space-y-1 pt-1">
          ${ingList.length ? ingList : '<span class="text-[10px] text-gray-500 italic">Tarkib belgilanmagan</span>'}
        </div>
      </div>
    `;
  }).join('');
}

// Ishlab chiqarish modali uchun real vaqtda sarf kalkulyatori
function previewProductionRecipe() {
  const select = document.getElementById('prod-finished-item');
  const qtyInput = document.getElementById('prod-qty');
  const previewBox = document.getElementById('prod-recipe-preview');

  if (!select || !qtyInput || !previewBox) return;

  const itemId = Number(select.value);
  const qty = Number(qtyInput.value) || 0;

  const bom = globalBOMs.find(b => b.id === itemId);
  if (!bom || !bom.ingredients || bom.ingredients.length === 0) {
    previewBox.innerHTML = `<span class="text-amber-400 text-xs italic">Ushbu mahsulot uchun retseptura topilmadi!</span>`;
    return;
  }

  let totalCost = 0;
  const rows = bom.ingredients.map(ing => {
    const needed = (ing.quantity * qty);
    const subTotal = (needed * ing.cost_price);
    totalCost += subTotal;
    const isEnough = (ing.stock_qty >= needed);

    return `
      <div class="flex items-center justify-between text-xs py-1 border-b border-gray-800">
        <span class="text-gray-300">${ing.raw_name}:</span>
        <div class="flex items-center gap-3 font-mono">
          <span class="font-bold text-white">${needed.toFixed(2)} ${ing.unit}</span>
          <span class="${isEnough ? 'text-emerald-400' : 'text-rose-400 font-bold'} text-[10px]">
            (${isEnough ? 'Omborda bor' : 'YETARLI EMAS!'})
          </span>
          <span class="text-gray-400">${formatUzs(subTotal)} UZS</span>
        </div>
      </div>
    `;
  }).join('');

  const unitCost = qty > 0 ? (totalCost / qty) : 0;

  previewBox.innerHTML = `
    <div class="space-y-1.5">
      <div class="flex items-center justify-between text-xs font-bold text-purple-300 pb-1 border-b border-purple-900/60">
        <span>Xomashyo Sarfi (Miqdor: ${qty}):</span>
        <span>Rejali Tannarx: ${formatUzs(unitCost)} UZS / ${bom.unit}</span>
      </div>
      ${rows}
      <div class="flex justify-between pt-2 text-xs font-extrabold text-emerald-400">
        <span>JAMI XOMASHYO XARAJATI:</span>
        <span class="font-mono">${formatUzs(totalCost)} UZS</span>
      </div>
    </div>
  `;
}

// ----------------------------------------------------------------------------
// 5. KIRIM / XARIDLAR (Закупки - 1C: Приходные накладные)
// ----------------------------------------------------------------------------
let purchasesSearchQuery = '';
let purchasesSortField = 'date';
let purchasesSortAsc = false;
let selectedPurchaseId = null;

async function fetchPurchases() {
  try {
    const res = await fetch('/api/purchases');
    const result = await res.json();
    if (result.success) {
      globalPurchases = result.data || [];
      renderPurchasesTable();
    }
  } catch (err) {
    console.error('Kirimlar yuklashda xato:', err);
  }
}

function renderPurchasesTable() {
  const tbody = document.getElementById('purchases-table-body');
  if (!tbody) return;

  let docs = [...(globalPurchases || [])];

  // Qidiruv filtri
  if (purchasesSearchQuery) {
    const q = purchasesSearchQuery.toLowerCase();
    docs = docs.filter(d => 
      (d.doc_number && d.doc_number.toLowerCase().includes(q)) ||
      (d.counterparty_name && d.counterparty_name.toLowerCase().includes(q)) ||
      (d.warehouse && d.warehouse.toLowerCase().includes(q)) ||
      (d.operation_type && d.operation_type.toLowerCase().includes(q)) ||
      (d.author && d.author.toLowerCase().includes(q)) ||
      (d.notes && d.notes.toLowerCase().includes(q))
    );
  }

  // Saralash
  docs.sort((a, b) => {
    let valA = a[purchasesSortField] || '';
    let valB = b[purchasesSortField] || '';
    if (purchasesSortField === 'date') {
      valA = a.doc_date || '';
      valB = b.doc_date || '';
    } else if (purchasesSortField === 'number') {
      valA = a.doc_number || '';
      valB = b.doc_number || '';
    } else if (purchasesSortField === 'counterparty') {
      valA = a.counterparty_name || '';
      valB = b.counterparty_name || '';
    } else if (purchasesSortField === 'sum') {
      valA = Number(a.total_amount) || 0;
      valB = Number(b.total_amount) || 0;
    }
    if (valA < valB) return purchasesSortAsc ? -1 : 1;
    if (valA > valB) return purchasesSortAsc ? 1 : -1;
    return 0;
  });

  // Jami summalarni hisoblash (UZS va USD alohida)
  let sumUzs = 0;
  let sumUsd = 0;
  docs.forEach(d => {
    const amount = Number(d.total_amount) || 0;
    if (d.currency === 'USD') {
      sumUsd += amount;
    } else {
      sumUzs += amount;
    }
  });

  const countEl = document.getElementById('purchases-total-count');
  if (countEl) countEl.innerText = `Jami: ${docs.length} ta hujjat`;

  const uzsEl = document.getElementById('purchases-sum-uzs');
  if (uzsEl) uzsEl.innerText = `${formatUzs(sumUzs)}, сум`;

  const usdEl = document.getElementById('purchases-sum-usd');
  if (usdEl) usdEl.innerText = `${formatUzs(sumUsd)}, $`;

  if (docs.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" class="px-4 py-20 text-center text-gray-500">
          <div class="max-w-md mx-auto space-y-3">
            <div class="w-14 h-14 mx-auto rounded-2xl bg-gray-100 flex items-center justify-center text-gray-400 border border-gray-200 shadow-inner">
              <i class="fa-solid fa-folder-open text-2xl text-rose-500/70"></i>
            </div>
            <div class="text-base font-bold text-gray-800">Kirim yuk xatlari jurnali bo'sh</div>
            <p class="text-xs text-gray-500 leading-relaxed">
              Hozircha tizimda kirim qilingan hujjatlar mavjud emas. Yangi kirim yuk xatini shakllantirish uchun yuqoridagi <strong>"Создать (Yaratish)"</strong> tugmasini bosing.
            </p>
            <div class="pt-2">
              <button type="button" onclick="openPurchaseModal()" class="inline-flex items-center gap-2 px-4 py-2 bg-[#2b8a3e] hover:bg-[#237032] text-white font-bold rounded shadow transition text-xs">
                <i class="fa-solid fa-plus"></i> + Yangi Kirim (Создать)
              </button>
            </div>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = docs.map(d => {
    const isSelected = selectedPurchaseId === d.id;
    const isUsd = d.currency === 'USD';
    const sumFormatted = isUsd ? `${formatUzs(d.total_amount)}, $` : `${formatUzs(d.total_amount)}, сум`;
    
    // Sana formatlash (DD.MM.YY)
    let dateDisplay = d.doc_date || '';
    if (dateDisplay.includes('-')) {
      const parts = dateDisplay.split('-');
      if (parts.length === 3) {
        dateDisplay = `${parts[2]}.${parts[1]}.${parts[0].slice(-2)}`;
      }
    }

    const isReturn = d.operation_type && d.operation_type.includes('Возврат');
    const opBadge = isReturn ? 
      '<span class="text-amber-700 font-medium bg-amber-50 px-2 py-0.5 rounded border border-amber-200">Возврат от покупателя</span>' : 
      '<span class="text-gray-700">Поступление от поставщика</span>';

    return `
      <tr onclick="selectPurchaseRow(${d.id})" class="cursor-pointer transition select-none ${isSelected ? 'bg-[#cce5ff] text-[#004085] font-semibold border-l-4 border-[#0056b3]' : 'hover:bg-[#f8f9fa] text-[#212529]'}">
        <td class="w-10 px-2 py-2 text-center border-r border-[#dee2e6]">
          <span class="inline-flex items-center justify-center w-5 h-5 rounded bg-emerald-100 text-emerald-700 border border-emerald-300" title="O'tkazilgan (Проведен)">
            <i class="fa-solid fa-check text-[11px]"></i>
          </span>
        </td>
        <td class="w-28 px-3 py-2 font-mono text-gray-700 border-r border-[#dee2e6] whitespace-nowrap">${dateDisplay}</td>
        <td class="w-32 px-3 py-2 font-mono font-bold text-blue-700 border-r border-[#dee2e6] whitespace-nowrap">${d.doc_number}</td>
        <td class="px-3 py-2 font-semibold text-gray-900 border-r border-[#dee2e6]">${d.counterparty_name || '-'}</td>
        <td class="px-3 py-2 text-gray-600 border-r border-[#dee2e6]">${d.warehouse || '<склад в табличной части>'}</td>
        <td class="w-36 px-4 py-2 text-right font-mono font-bold ${isUsd ? 'text-emerald-700' : 'text-gray-900'} border-r border-[#dee2e6] whitespace-nowrap">${sumFormatted}</td>
        <td class="w-48 px-3 py-2 border-r border-[#dee2e6] whitespace-nowrap">${opBadge}</td>
        <td class="w-44 px-3 py-2 text-gray-600 border-r border-[#dee2e6] whitespace-nowrap">${d.author || 'Yuk qabul qilish bo\'limi'}</td>
        <td class="w-28 px-3 py-2 text-center whitespace-nowrap">
          <div class="flex items-center justify-center gap-1.5" onclick="event.stopPropagation()">
            <button onclick="viewPurchaseDetails(${d.id})" class="p-1 text-gray-500 hover:text-black transition" title="Batafsil">
              <i class="fa-solid fa-file-lines"></i>
            </button>
            <button onclick="printPurchaseInvoice(${d.id})" class="p-1 text-gray-500 hover:text-rose-600 transition" title="Chop etish">
              <i class="fa-solid fa-print"></i>
            </button>
            <button onclick="deletePurchaseDocument(${d.id})" class="p-1 text-gray-500 hover:text-red-600 transition" title="O'chirish">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function selectPurchaseRow(id) {
  selectedPurchaseId = id;
  const doc = (globalPurchases || []).find(d => d.id === id);
  const infoEl = document.getElementById('purchases-selected-info');
  if (infoEl && doc) {
    infoEl.innerHTML = `<span class="text-emerald-400 font-bold">Tanlangan: ${doc.doc_number}</span> (${doc.counterparty_name || '-'})`;
  }
  renderPurchasesTable();
}

function filterPurchasesTable() {
  const input = document.getElementById('purchases-search-input');
  purchasesSearchQuery = input ? input.value.trim() : '';
  renderPurchasesTable();
}

function sortPurchases(field) {
  if (purchasesSortField === field) {
    purchasesSortAsc = !purchasesSortAsc;
  } else {
    purchasesSortField = field;
    purchasesSortAsc = false;
  }
  renderPurchasesTable();
}

function toggleCreateBasedOnMenu(event) {
  if (event) event.stopPropagation();
  const dropdown = document.getElementById('dropdown-based-on');
  if (dropdown) dropdown.classList.toggle('hidden');
}

// Boshqa joy bosilganda dropdownni yopish
document.addEventListener('click', () => {
  const dropdown = document.getElementById('dropdown-based-on');
  if (dropdown && !dropdown.classList.contains('hidden')) {
    dropdown.classList.add('hidden');
  }
});

function createBasedOn(type) {
  const dropdown = document.getElementById('dropdown-based-on');
  if (dropdown) dropdown.classList.add('hidden');

  const doc = (globalPurchases || []).find(d => d.id === selectedPurchaseId) || (globalPurchases && globalPurchases[0]);
  if (!doc) {
    alert('Iltimos, avval ro\'yxatdan birorta kirim yuk xatini tanlang!');
    return;
  }

  if (type === 'RKO') {
    switchTab('money');
    openMoneyOrderModal('OUT');
    document.getElementById('mo-amount').value = doc.total_amount;
    document.getElementById('mo-counterparty').value = doc.counterparty_id || '';
    document.getElementById('mo-notes').value = `${doc.doc_number} sonli kirim yuk xati uchun ta'minotchiga to'lov`;
  } else if (type === 'BANK_PAY') {
    switchTab('money');
    openMoneyOrderModal('OUT');
    document.getElementById('mo-amount').value = doc.total_amount;
    document.getElementById('mo-counterparty').value = doc.counterparty_id || '';
    document.getElementById('mo-notes').value = `${doc.doc_number} hisob-faktura bo'yicha bank to'lovi`;
  } else if (type === 'RETURN') {
    openPurchaseModal();
    document.getElementById('pur-operation-type').value = 'Возврат от покупателя';
    handlePurchaseOpTypeChange();
    document.getElementById('pur-notes').value = `${doc.doc_number} sonli yuk xati bo'yicha qaytarish`;
  }
}

function printSelectedPurchase() {
  const doc = (globalPurchases || []).find(d => d.id === selectedPurchaseId) || (globalPurchases && globalPurchases[0]);
  if (!doc) {
    alert('Chop etish uchun birorta hujjatni tanlang!');
    return;
  }
  printPurchaseInvoice(doc.id);
}

function printPurchaseInvoice(id) {
  const doc = (globalPurchases || []).find(d => d.id === id);
  if (!doc) return;

  const isUsd = doc.currency === 'USD';
  const currencySymbol = isUsd ? '$' : 'so\'m';

  const itemsHtml = (doc.items || []).map((it, idx) => `
    <tr>
      <td style="border: 1px solid #333; padding: 6px; text-align: center;">${idx + 1}</td>
      <td style="border: 1px solid #333; padding: 6px; font-weight: bold;">${it.item_name}</td>
      <td style="border: 1px solid #333; padding: 6px; text-align: right;">${it.quantity} ${it.unit}</td>
      <td style="border: 1px solid #333; padding: 6px; text-align: right;">${formatUzs(it.unit_price)}</td>
      <td style="border: 1px solid #333; padding: 6px; text-align: right; font-weight: bold;">${formatUzs(it.total_price)}</td>
    </tr>
  `).join('');

  const printWindow = window.open('', '_blank', 'width=850,height=650');
  printWindow.document.write(`
    <html>
      <head>
        <title>Приходная накладная № ${doc.doc_number}</title>
        <style>
          body { font-family: Arial, sans-serif; font-size: 12px; color: #111; margin: 30px; }
          h2 { margin-bottom: 4px; font-size: 16px; text-transform: uppercase; }
          table { width: 100%; border-collapse: collapse; margin-top: 15px; }
          .header-info { margin-top: 15px; line-height: 1.6; }
          .footer-sign { margin-top: 50px; display: flex; justify-content: space-between; }
        </style>
      </head>
      <body>
        <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #cc1f26; padding-bottom: 12px; margin-bottom: 15px;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <img src="/assets/meatcity-logo.jpg" style="height: 50px; width: 50px; object-fit: contain; border-radius: 8px; border: 1px solid #eee; padding: 2px;" />
            <div>
              <h1 style="margin: 0; font-size: 18px; font-weight: 900; color: #111; letter-spacing: 0.5px;">MEAT CITY</h1>
              <div style="font-size: 11px; color: #666;">Go'sht mahsulotlari va ta'minot boshqaruvi</div>
            </div>
          </div>
          <div style="text-align: right;">
            <h2 style="margin: 0; font-size: 14px; color: #cc1f26;">ПРИХОДНАЯ НАКЛАДНАЯ № ${doc.doc_number}</h2>
            <div style="font-size: 11px; color: #444; margin-top: 4px;">Sana: <strong>${doc.doc_date}</strong></div>
          </div>
        </div>
        <div class="header-info">
          <div>Ta'minotchi (Kontragent): <strong>${doc.counterparty_name || '-'}</strong></div>
          <div>Ombor (Qabul qiluvchi): <strong>${doc.warehouse || 'Asosiy Ombor'}</strong></div>
          <div>Operatsiya turi: <strong>${doc.operation_type || 'Поступление от поставщика'}</strong></div>
          <div>Mas'ul shaxs (Muallif): <strong>${doc.author || 'Yuk qabul qilish bo\'limi'}</strong></div>
        </div>
        <table>
          <thead>
            <tr style="background: #f0f0f0;">
              <th style="border: 1px solid #333; padding: 6px; width: 30px;">№</th>
              <th style="border: 1px solid #333; padding: 6px; text-align: left;">Mahsulot / Xomashyo nomi</th>
              <th style="border: 1px solid #333; padding: 6px; text-align: right; width: 100px;">Miqdori</th>
              <th style="border: 1px solid #333; padding: 6px; text-align: right; width: 110px;">Narxi (${currencySymbol})</th>
              <th style="border: 1px solid #333; padding: 6px; text-align: right; width: 120px;">Jami Summa (${currencySymbol})</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml || '<tr><td colspan="5" style="padding: 10px; text-align: center;">Tafsilotlar mavjud emas</td></tr>'}
          </tbody>
          <tfoot>
            <tr style="background: #f9f9f9; font-weight: bold;">
              <td colspan="4" style="border: 1px solid #333; padding: 8px; text-align: right;">JAMI SUMMA:</td>
              <td style="border: 1px solid #333; padding: 8px; text-align: right; font-size: 13px;">${formatUzs(doc.total_amount)} ${currencySymbol}</td>
            </tr>
          </tfoot>
        </table>
        <div style="margin-top: 15px; font-style: italic;">Izoh: ${doc.notes || '-'}</div>
        <div class="footer-sign">
          <div>Topshirdi (Ta'minotchi): ______________</div>
          <div>Qabul qildi (Ombor mudiri): ______________</div>
        </div>
      </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => { printWindow.print(); }, 250);
}

function viewPurchaseDetails(id) {
  const doc = (globalPurchases || []).find(d => d.id === id);
  if (!doc) return;

  const isUsd = doc.currency === 'USD';
  const currencySymbol = isUsd ? '$' : 'so\'m';

  const modalTitle = document.getElementById('modal-details-title');
  const modalContent = document.getElementById('modal-details-content');

  if (modalTitle) {
    modalTitle.innerHTML = `<i class="fa-solid fa-file-invoice text-rose-400"></i> 1C: Приходная накладная № ${doc.doc_number}`;
  }

  if (modalContent) {
    modalContent.innerHTML = `
      <div class="space-y-3">
        <div class="grid grid-cols-2 md:grid-cols-3 gap-2 bg-gray-950 p-3 rounded-lg border border-gray-800 text-xs">
          <div><span class="text-gray-500">Sana:</span> <strong class="text-white">${doc.doc_date}</strong></div>
          <div><span class="text-gray-500">Поставщик:</span> <strong class="text-rose-300">${doc.counterparty_name || '-'}</strong></div>
          <div><span class="text-gray-500">Организация:</span> <span class="text-gray-300 font-bold">${doc.organization || 'ZAVOD'}</span></div>
          <div><span class="text-gray-500">Вх. номер:</span> <span class="text-gray-300 font-mono">${doc.incoming_number || '-'} (${doc.incoming_date || '-'})</span></div>
          <div><span class="text-gray-500">Склад:</span> <span class="text-gray-300">${doc.warehouse || '-'}</span></div>
          <div><span class="text-gray-500">Вид операции:</span> <span class="text-gray-300">${doc.operation_type || '-'}</span></div>
          <div><span class="text-gray-500">Автор:</span> <span class="text-gray-300">${doc.author || '-'}</span></div>
          <div class="md:col-span-2 text-right"><span class="text-gray-500">Jami Summa:</span> <strong class="text-emerald-400 font-mono text-base ml-2">${formatUzs(doc.total_amount)} ${currencySymbol}</strong></div>
        </div>
        <div class="border border-gray-800 rounded-lg overflow-hidden">
          <table class="w-full text-left text-xs">
            <thead class="bg-gray-800 text-gray-400">
              <tr>
                <th class="p-2 w-8 text-center">№</th>
                <th class="p-2">Номенклатура</th>
                <th class="p-2 text-right">Общий вес</th>
                <th class="p-2 text-right">Вес тара</th>
                <th class="p-2 text-right">Количество</th>
                <th class="p-2 text-right">Цена</th>
                <th class="p-2 text-right">Сумма</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-800">
              ${(doc.items || []).map((i, idx) => `
                <tr>
                  <td class="p-2 text-center text-gray-500 font-mono">${idx + 1}</td>
                  <td class="p-2 font-semibold text-white">${i.item_name}</td>
                  <td class="p-2 text-right font-mono text-amber-400">${i.gross_weight > 0 ? i.gross_weight + ' kg' : '-'}</td>
                  <td class="p-2 text-right font-mono text-gray-400">${i.tare_weight > 0 ? i.tare_weight + ' kg' : '-'}</td>
                  <td class="p-2 text-right font-mono font-bold text-emerald-400">${i.quantity} ${i.unit}</td>
                  <td class="p-2 text-right font-mono text-gray-300">${formatUzs(i.unit_price)}</td>
                  <td class="p-2 text-right font-mono font-bold text-white">${formatUzs(i.total_price)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        ${doc.notes ? `<div class="text-gray-400 italic text-[11px] bg-gray-950 p-2 rounded border border-gray-800">Izoh: ${doc.notes}</div>` : ''}
      </div>
    `;
  }

  openModal('modal-details');
}

async function deletePurchaseDocument(id) {
  if (!confirm('Haqiqatan ham ushbu kirim hujjatini o\'chirmoqchimisiz? Ombor zaxiralari va to\'lov hisoblari avtomat qaytariladi.')) return;

  try {
    const res = await fetch(`/api/purchases/${id}`, { method: 'DELETE' });
    const result = await res.json();
    if (result.success) {
      await refreshAllData();
      alert('Kirim hujjati muvaffaqiyatli o\'chirildi.');
    } else {
      alert('Xatolik: ' + result.error);
    }
  } catch (err) {
    alert('Serverga ulanishda xato: ' + err.message);
  }
}

// ----------------------------------------------------------------------------
// 1C: ПРИХОДНАЯ НАКЛАДНАЯ - TABLITSA QISMI VA LOGIKASI
// ----------------------------------------------------------------------------
let purchaseDocRows = [];
let selectedPurchaseRowIdx = 0;

function switchPurchaseMainTab(tab) {
  const tabMain = document.getElementById('tab-pur-main');
  const tabFiles = document.getElementById('tab-pur-files');
  if (tab === 'files') {
    if (tabMain) tabMain.className = 'pb-1.5 border-b-2 border-transparent text-gray-500 hover:text-black cursor-pointer';
    if (tabFiles) tabFiles.className = 'pb-1.5 border-b-2 border-[#1971c2] text-[#1971c2] font-bold cursor-pointer';
    alert('Файлы bo\'limi: Hozircha biriktirilgan elektron skaner hujjatlar yo\'q.');
  } else {
    if (tabMain) tabMain.className = 'pb-1.5 border-b-2 border-[#1971c2] text-[#1971c2] font-bold cursor-pointer';
    if (tabFiles) tabFiles.className = 'pb-1.5 border-b-2 border-transparent text-gray-500 hover:text-black cursor-pointer';
  }
}

function switchPurTabularTab(tab) {
  const tabStocks = document.getElementById('tab-pur-stocks');
  const tabServices = document.getElementById('tab-pur-services');
  const tabExtra = document.getElementById('tab-pur-extra');

  const contentStocks = document.getElementById('content-pur-stocks');
  const contentServices = document.getElementById('content-pur-services');
  const contentExtra = document.getElementById('content-pur-extra');

  // Reset tabs
  [tabStocks, tabServices, tabExtra].forEach(t => {
    if (t) t.className = 'px-3 py-1 text-gray-600 hover:text-black hover:bg-gray-100 rounded-t cursor-pointer';
  });
  [contentStocks, contentServices, contentExtra].forEach(c => {
    if (c) c.classList.add('hidden');
  });

  if (tab === 'services') {
    if (tabServices) tabServices.className = 'px-3 py-1 font-bold bg-[#e9ecef] border-t border-x border-[#ced4da] text-[#212529] rounded-t cursor-pointer';
    if (contentServices) contentServices.classList.remove('hidden');
  } else if (tab === 'extra') {
    if (tabExtra) tabExtra.className = 'px-3 py-1 font-bold bg-[#e9ecef] border-t border-x border-[#ced4da] text-[#212529] rounded-t cursor-pointer';
    if (contentExtra) contentExtra.classList.remove('hidden');
  } else {
    if (tabStocks) tabStocks.className = 'px-3 py-1 font-bold bg-[#e9ecef] border-t border-x border-[#ced4da] text-[#212529] rounded-t cursor-pointer';
    if (contentStocks) contentStocks.classList.remove('hidden');
  }
}

function togglePurCurrency() {
  const currInput = document.getElementById('pur-currency');
  const currLink = document.getElementById('pur-currency-link');
  if (!currInput) return;
  const isCurrentlyUzs = currInput.value === 'UZS';
  const newCurr = isCurrentlyUzs ? 'USD' : 'UZS';
  currInput.value = newCurr;
  if (currLink) {
    currLink.innerText = newCurr === 'USD' ? '1 $ (USD)' : '1 сум (UZS)';
  }
  recalcPurchaseDocTotals();
}

function toggleDocBasedOnMenu(event) {
  if (event) event.stopPropagation();
  const menu = document.getElementById('dropdown-doc-based-on');
  if (menu) menu.classList.toggle('hidden');
}

function triggerBasedOnFromForm(type) {
  const menu = document.getElementById('dropdown-doc-based-on');
  if (menu) menu.classList.add('hidden');
  const cpId = document.getElementById('pur-counterparty').value;
  const docNum = document.getElementById('pur-doc-num').value;
  let total = 0;
  purchaseDocRows.forEach(r => { total += (r.total_price || 0); });

  if (type === 'RKO') {
    closeModal('modal-purchase');
    switchTab('money');
    openMoneyOrderModal('OUT');
    document.getElementById('mo-amount').value = total;
    document.getElementById('mo-counterparty').value = cpId || '';
    document.getElementById('mo-notes').value = `${docNum} sonli kirim yuk xati uchun kassadan to'lov`;
  } else if (type === 'BANK_PAY') {
    closeModal('modal-purchase');
    switchTab('money');
    openMoneyOrderModal('OUT');
    document.getElementById('mo-amount').value = total;
    document.getElementById('mo-counterparty').value = cpId || '';
    document.getElementById('mo-notes').value = `${docNum} bo'yicha bank orqali to'lov`;
  } else if (type === 'RETURN') {
    document.getElementById('pur-operation-type').value = 'Возврат от покупателя';
    handlePurchaseOpTypeChange();
    alert('Operatsiya turi "Возврат от покупателя" holatiga o\'tkazildi.');
  }
}

// Global holatlar
let currentSupplierContracts = [];
let cpPickerCategory = 'all';
let nomenPickerCategory = 'all';
let nomenPickerQuantities = {};
let targetPurchaseRowIdx = null;

function initDefaultPurchaseRows() {
  // Boshlang'ich qator bo'sh bo'ladi (1C: majburiy to'ldirilmaydi)
  purchaseDocRows = [
    {
      item_id: null,
      unit: 'кг',
      barcode: '',
      gross_weight: 0,
      tare_weight: 0,
      quantity: 1,
      unit_price: 0,
      discount_percent: 0,
      discount_amount: 0,
      total_price: 0,
      custom_price: 0,
      custom_price2: 0
    }
  ];
  selectedPurchaseRowIdx = 0;
  renderPurchaseDocRows();
}

function addPurchaseRow(itemData = null) {
  const currency = document.getElementById('pur-currency')?.value || 'UZS';
  const exRate = parseFloat(document.getElementById('pur-exchange-rate')?.value) || 13000;
  
  let unitPrice = 0;
  let customPrice = 0;
  if (itemData) {
    if (itemData.unit_price !== undefined) {
      unitPrice = itemData.unit_price;
    } else if (itemData.cost_price !== undefined) {
      unitPrice = currency === 'USD' ? parseFloat((itemData.cost_price / exRate).toFixed(2)) : itemData.cost_price;
    }
    customPrice = itemData.sale_price || 0;
  }

  purchaseDocRows.push({
    item_id: itemData ? itemData.id : null,
    unit: itemData ? (itemData.unit || 'кг') : 'кг',
    barcode: itemData ? (itemData.barcode || '') : '',
    gross_weight: 0,
    tare_weight: 0,
    quantity: itemData ? (itemData.quantity || 1) : 1,
    unit_price: unitPrice,
    discount_percent: 0,
    discount_amount: 0,
    total_price: (itemData ? (itemData.quantity || 1) : 1) * unitPrice,
    custom_price: customPrice,
    custom_price2: 0
  });
  selectedPurchaseRowIdx = purchaseDocRows.length - 1;
  renderPurchaseDocRows();
}

function removePurchaseRow(idx) {
  if (purchaseDocRows.length <= 1) {
    // Agar oxirgi qator bo'lsa, uni tozalaymiz
    purchaseDocRows = [{
      item_id: null,
      unit: 'кг',
      barcode: '',
      gross_weight: 0,
      tare_weight: 0,
      quantity: 1,
      unit_price: 0,
      discount_percent: 0,
      discount_amount: 0,
      total_price: 0,
      custom_price: 0,
      custom_price2: 0
    }];
    selectedPurchaseRowIdx = 0;
    renderPurchaseDocRows();
    return;
  }
  purchaseDocRows.splice(idx, 1);
  if (selectedPurchaseRowIdx >= purchaseDocRows.length) {
    selectedPurchaseRowIdx = purchaseDocRows.length - 1;
  }
  renderPurchaseDocRows();
}

function moveSelectedRow(dir) {
  const newIdx = selectedPurchaseRowIdx + dir;
  if (newIdx < 0 || newIdx >= purchaseDocRows.length) return;
  const temp = purchaseDocRows[selectedPurchaseRowIdx];
  purchaseDocRows[selectedPurchaseRowIdx] = purchaseDocRows[newIdx];
  purchaseDocRows[newIdx] = temp;
  selectedPurchaseRowIdx = newIdx;
  renderPurchaseDocRows();
}

function onPurchaseRowItemChange(idx, itemId) {
  const row = purchaseDocRows[idx];
  if (!row) return;

  if (itemId === '__SHOW_ALL__') {
    renderPurchaseDocRows();
    openNomenclatureGroupPicker(idx);
    return;
  }

  if (!itemId) {
    row.item_id = null;
    row.unit_price = 0;
    row.total_price = 0;
    renderPurchaseDocRows();
    return;
  }

  row.item_id = Number(itemId);
  const it = (globalItems || []).find(i => i.id === row.item_id);
  const currency = document.getElementById('pur-currency')?.value || 'UZS';
  const exRate = parseFloat(document.getElementById('pur-exchange-rate')?.value) || 13000;

  if (it) {
    row.unit = it.unit || 'кг';
    row.barcode = it.barcode || '';
    row.unit_price = currency === 'USD' ? parseFloat((it.cost_price / exRate).toFixed(2)) : (it.cost_price || 0);
    row.custom_price = it.sale_price || 0;
    row.total_price = Math.max(0, (row.quantity * row.unit_price) - (row.discount_amount || 0));
  }
  renderPurchaseDocRows();
}

function updatePurchaseRowWeight(idx, type, val) {
  const row = purchaseDocRows[idx];
  if (!row) return;
  const numVal = parseFloat(val) || 0;
  if (type === 'gross') {
    row.gross_weight = numVal;
  } else if (type === 'tare') {
    row.tare_weight = numVal;
  }
  if (row.gross_weight > 0) {
    row.quantity = Math.max(0, row.gross_weight - (row.tare_weight || 0));
  }
  row.total_price = Math.max(0, (row.quantity * row.unit_price) - (row.discount_amount || 0));
  
  const qtyEl = document.getElementById(`pur-row-qty-${idx}`);
  if (qtyEl) qtyEl.value = row.quantity;
  const totEl = document.getElementById(`pur-row-tot-${idx}`);
  if (totEl) totEl.innerText = formatUzs(row.total_price);

  recalcPurchaseDocTotals();
}

function updatePurchaseRow(idx, field, val) {
  const row = purchaseDocRows[idx];
  if (!row) return;
  if (field === 'barcode') {
    row.barcode = String(val).trim();
  } else if (field === 'quantity') {
    row.quantity = Math.max(0, parseFloat(val) || 0);
    row.total_price = Math.max(0, (row.quantity * row.unit_price) - (row.discount_amount || 0));
  } else if (field === 'unit_price') {
    row.unit_price = Math.max(0, parseFloat(val) || 0);
    row.total_price = Math.max(0, (row.quantity * row.unit_price) - (row.discount_amount || 0));
  } else if (field === 'discount_amount') {
    row.discount_amount = Math.max(0, parseFloat(val) || 0);
    row.total_price = Math.max(0, (row.quantity * row.unit_price) - row.discount_amount);
  } else if (field === 'custom_price') {
    row.custom_price = parseFloat(val) || 0;
  } else if (field === 'custom_price2') {
    row.custom_price2 = parseFloat(val) || 0;
  }

  const totEl = document.getElementById(`pur-row-tot-${idx}`);
  if (totEl) totEl.innerText = formatUzs(row.total_price);

  recalcPurchaseDocTotals();
}

function recalcPurchaseDocTotals() {
  let totalCount = purchaseDocRows.filter(r => r.item_id).length || (purchaseDocRows.length > 0 ? 1 : 0);
  let totalWeight = 0;
  let grandTotal = 0;

  purchaseDocRows.forEach(r => {
    if (r.item_id) {
      totalWeight += (r.quantity || 0);
      grandTotal += (r.total_price || 0);
    }
  });

  const currency = document.getElementById('pur-currency') ? document.getElementById('pur-currency').value : 'UZS';
  const currSign = currency === 'USD' ? '$' : 'сум';
  const exchangeRate = parseFloat(document.getElementById('pur-exchange-rate')?.value) || 13000;

  const badgeEl = document.getElementById('pur-rows-count-badge');
  if (badgeEl) badgeEl.innerText = totalCount;

  const statCountEl = document.getElementById('pur-stat-count');
  if (statCountEl) statCountEl.innerText = totalCount;

  const statWeightEl = document.getElementById('pur-stat-weight');
  if (statWeightEl) statWeightEl.innerText = `${totalWeight.toFixed(2)} kg`;

  const statTotalEl = document.getElementById('pur-stat-total');
  if (statTotalEl) statTotalEl.innerText = `${formatUzs(grandTotal)} ${currSign}`;

  const equivBox = document.getElementById('pur-stat-equiv-box');
  const equivUzs = document.getElementById('pur-stat-equiv-uzs');
  if (currency === 'USD') {
    const totalUzs = grandTotal * exchangeRate;
    if (equivBox) equivBox.classList.remove('hidden');
    if (equivUzs) equivUzs.innerText = `${formatUzs(totalUzs)} so'm`;
  } else {
    if (equivBox) equivBox.classList.add('hidden');
  }
}

function renderPurchaseDocRows() {
  const tbody = document.getElementById('pur-doc-items-tbody');
  if (!tbody) return;

  tbody.innerHTML = purchaseDocRows.map((row, idx) => {
    const isSelected = selectedPurchaseRowIdx === idx;
    return `
      <tr onclick="selectedPurchaseRowIdx = ${idx};" class="transition border-b border-[#dee2e6] ${isSelected ? 'bg-[#e8f5e9]' : 'hover:bg-gray-50'}">
        <td class="px-1 py-1 text-center font-mono text-gray-500 border-r border-[#dee2e6]">${idx + 1}</td>
        
        <!-- Номенклатура (Qidirish va Guruhdan tanlash bilan) -->
        <td class="px-1.5 py-1 border-r border-[#dee2e6]">
          <div class="flex items-center gap-1">
            <select onchange="onPurchaseRowItemChange(${idx}, this.value)" class="w-full bg-transparent border-b border-dashed border-red-400 text-xs py-0.5 text-[#212529] font-medium focus:outline-none focus:bg-white cursor-pointer">
              <option value="">-- Mahsulotni tanlang yoki qidiring --</option>
              <option value="__SHOW_ALL__" class="font-bold text-amber-900 bg-amber-100">📂 Hammasini ko'rsatish (Guruhlar / Показать все)...</option>
              ${(globalItems || []).map(i => `<option value="${i.id}" ${i.id === row.item_id ? 'selected' : ''}>${escapeHtml(i.name)} [${escapeHtml(i.group_name || 'Boshqa')}]</option>`).join('')}
              <option value="__SHOW_ALL__" class="font-bold text-amber-900 bg-amber-100">📂 Hammasini ko'rsatish (Guruhlar / Показать все)...</option>
            </select>
            <button type="button" onclick="openNomenclatureGroupPicker(${idx})" class="p-1 px-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 hover:text-amber-900 border border-amber-300 rounded shrink-0 transition shadow-2xs" title="Hammasini ko'rsatish (Guruhlar / 1C: Подобрать)">
              <i class="fa-solid fa-folder-open text-xs"></i>
            </button>
          </div>
        </td>

        <!-- Ед. -->
        <td class="px-1 py-1 text-center font-mono text-gray-600 border-r border-[#dee2e6]">${row.unit || 'кг'}</td>

        <!-- Штрихкод -->
        <td class="px-1 py-1 border-r border-[#dee2e6]">
          <input type="text" value="${row.barcode || ''}" placeholder="..." onchange="updatePurchaseRow(${idx}, 'barcode', this.value)" class="w-full bg-transparent text-center text-xs font-mono text-gray-600 focus:outline-none">
        </td>

        <!-- Общий вес (Brutto) -->
        <td class="px-1 py-1 border-r border-[#dee2e6] bg-amber-50/40">
          <input type="number" step="any" value="${row.gross_weight || ''}" placeholder="0" oninput="updatePurchaseRowWeight(${idx}, 'gross', this.value)" class="w-full bg-transparent text-right text-xs font-mono font-bold text-gray-800 focus:outline-none">
        </td>

        <!-- Вес тара -->
        <td class="px-1 py-1 border-r border-[#dee2e6] bg-amber-50/40">
          <input type="number" step="any" value="${row.tare_weight || ''}" placeholder="0" oninput="updatePurchaseRowWeight(${idx}, 'tare', this.value)" class="w-full bg-transparent text-right text-xs font-mono text-gray-700 focus:outline-none">
        </td>

        <!-- Количество (Netto) -->
        <td class="px-1 py-1 border-r border-[#dee2e6]">
          <input type="number" step="any" id="pur-row-qty-${idx}" value="${row.quantity}" oninput="updatePurchaseRow(${idx}, 'quantity', this.value)" class="w-full bg-transparent text-right text-xs font-mono font-bold text-[#2b8a3e] focus:outline-none" required>
        </td>

        <!-- Цена -->
        <td class="px-1 py-1 border-r border-[#dee2e6]">
          <input type="number" step="any" value="${row.unit_price}" oninput="updatePurchaseRow(${idx}, 'unit_price', this.value)" class="w-full bg-transparent text-right text-xs font-mono text-gray-900 focus:outline-none" required>
        </td>

        <!-- Скидка -->
        <td class="px-1 py-1 border-r border-[#dee2e6]">
          <input type="number" step="any" value="${row.discount_amount || ''}" placeholder="0" oninput="updatePurchaseRow(${idx}, 'discount_amount', this.value)" class="w-full bg-transparent text-right text-xs font-mono text-rose-600 focus:outline-none">
        </td>

        <!-- Сумма -->
        <td class="px-2 py-1 text-right font-mono font-bold text-gray-900 border-r border-[#dee2e6]">
          <span id="pur-row-tot-${idx}">${formatUzs(row.total_price)}</span>
        </td>

        <!-- Mezbon narx -->
        <td class="px-1 py-1 border-r border-[#dee2e6]">
          <input type="number" step="any" value="${row.custom_price || ''}" placeholder="0" onchange="updatePurchaseRow(${idx}, 'custom_price', this.value)" class="w-full bg-transparent text-right text-xs font-mono text-gray-500 focus:outline-none">
        </td>

        <!-- Mezbon Pishloq -->
        <td class="px-1 py-1 border-r border-[#dee2e6]">
          <input type="number" step="any" value="${row.custom_price2 || ''}" placeholder="0" onchange="updatePurchaseRow(${idx}, 'custom_price2', this.value)" class="w-full bg-transparent text-right text-xs font-mono text-gray-500 focus:outline-none">
        </td>

        <!-- O'chirish -->
        <td class="px-1 py-1 text-center">
          <button type="button" onclick="removePurchaseRow(${idx})" class="text-gray-400 hover:text-rose-600 p-0.5" title="Qatorni o'chirish">
            <i class="fa-solid fa-xmark text-xs"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('');

  recalcPurchaseDocTotals();
}

// ----------------------------------------------------------------------------
// TA'MINOTCHI QIDIRISH VA 1C USLUBIDAGI DROPDOWN / GURUHLAR
// ----------------------------------------------------------------------------
function openSupplierDropdown() {
  const val = document.getElementById('pur-counterparty-search')?.value || '';
  renderSupplierDropdownList(val);
  const dropdown = document.getElementById('pur-cp-custom-dropdown');
  if (dropdown) dropdown.classList.remove('hidden');
}

function closeSupplierDropdown() {
  const dropdown = document.getElementById('pur-cp-custom-dropdown');
  if (dropdown) dropdown.classList.add('hidden');
}

function toggleSupplierDropdown(event) {
  if (event) {
    event.stopPropagation();
    event.preventDefault();
  }
  const dropdown = document.getElementById('pur-cp-custom-dropdown');
  if (dropdown && !dropdown.classList.contains('hidden')) {
    closeSupplierDropdown();
  } else {
    openSupplierDropdown();
  }
}

function selectCounterpartyFromDropdown(id) {
  const supplier = (globalCounterparties || []).find(c => c.id === id);
  if (!supplier) return;
  const searchInput = document.getElementById('pur-counterparty-search');
  const hiddenInput = document.getElementById('pur-counterparty');
  if (searchInput) searchInput.value = supplier.name;
  if (hiddenInput) hiddenInput.value = supplier.id;
  closeSupplierDropdown();
  loadSupplierContracts(supplier.id);
}

function renderSupplierDropdownList(filterText = '') {
  const dropdown = document.getElementById('pur-cp-custom-dropdown');
  if (!dropdown) return;

  const search = (filterText || '').trim().toLowerCase();
  const suppliers = (globalCounterparties || []).filter(c => c.type === 'supplier' || c.type === 'both');
  const filtered = search ? suppliers.filter(s => 
    s.name.toLowerCase().includes(search) || 
    (s.phone && s.phone.toLowerCase().includes(search)) ||
    (s.group_name && s.group_name.toLowerCase().includes(search))
  ) : suppliers;

  let html = `
    <div onclick="closeSupplierDropdown(); openCounterpartyGroupPicker();" class="px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-900 font-bold border-b border-amber-200 cursor-pointer flex items-center justify-between transition group">
      <span class="flex items-center gap-1.5"><i class="fa-solid fa-folder-tree text-amber-600 group-hover:scale-110 transition-transform"></i> 📂 Hammasini ko'rsatish (Guruhlar / Показать все)...</span>
      <span class="text-[10px] text-amber-800 bg-amber-200/80 px-1.5 py-0.5 rounded font-mono font-bold">1C Katalog</span>
    </div>
  `;

  if (filtered.length === 0) {
    html += `<div class="px-3 py-2 text-gray-400 text-xs italic text-center">Ta'minotchi topilmadi</div>`;
  } else {
    html += filtered.slice(0, 30).map(s => `
      <div onclick="selectCounterpartyFromDropdown(${s.id})" class="px-3 py-1.5 hover:bg-rose-50 text-gray-800 cursor-pointer flex items-center justify-between border-b border-gray-100 transition">
        <div class="font-medium text-xs text-gray-900 flex items-center gap-1.5">
          <i class="fa-solid fa-building text-gray-400 text-[11px]"></i>
          <span>${escapeHtml(s.name)}</span>
        </div>
        <div class="flex items-center gap-2">
          ${s.phone ? `<span class="text-[11px] text-gray-400 font-mono">${escapeHtml(s.phone)}</span>` : ''}
          <span class="text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded border border-gray-200 font-mono">${escapeHtml(s.group_name || 'Umumiy')}</span>
        </div>
      </div>
    `).join('');
  }

  html += `
    <div onclick="closeSupplierDropdown(); openCounterpartyGroupPicker();" class="px-3 py-1.5 bg-gray-50 hover:bg-amber-50 text-amber-800 font-semibold text-xs border-t border-gray-200 cursor-pointer flex items-center gap-1.5 transition">
      <i class="fa-solid fa-folder-open text-amber-600"></i> Guruhlar katalogini ochish (Показать все)...
    </div>
  `;

  dropdown.innerHTML = html;
}

function onCounterpartySearchInput(val) {
  if (val.includes('Hammasini ko\'rsatish') || val.includes('Показать все') || val.includes('__SHOW_ALL__')) {
    const searchInput = document.getElementById('pur-counterparty-search');
    if (searchInput) searchInput.value = '';
    closeSupplierDropdown();
    openCounterpartyGroupPicker();
    return;
  }

  renderSupplierDropdownList(val);
  const dropdown = document.getElementById('pur-cp-custom-dropdown');
  if (dropdown) dropdown.classList.remove('hidden');

  const trimmed = val.trim().toLowerCase();
  const hiddenInput = document.getElementById('pur-counterparty');
  if (!trimmed) {
    if (hiddenInput) hiddenInput.value = '';
    const contractSelect = document.getElementById('pur-contract');
    if (contractSelect) contractSelect.innerHTML = '<option value="">-- Avval ta\'minotchini tanlang --</option>';
    document.getElementById('pur-contract-info-bar')?.classList.add('hidden');
    return;
  }

  const suppliers = (globalCounterparties || []).filter(c => c.type === 'supplier' || c.type === 'both');
  const found = suppliers.find(s => s.name.toLowerCase() === trimmed);
  if (found) {
    if (hiddenInput) hiddenInput.value = found.id;
    loadSupplierContracts(found.id);
  } else {
    if (hiddenInput) hiddenInput.value = '';
    const contractSelect = document.getElementById('pur-contract');
    if (contractSelect) contractSelect.innerHTML = '<option value="">-- Avval ta\'minotchini tanlang --</option>';
    document.getElementById('pur-contract-info-bar')?.classList.add('hidden');
  }
}

// Tashqariga bosilganda custom dropdownni yopish
document.addEventListener('click', (e) => {
  const container = document.getElementById('pur-cp-combo-container');
  if (container && !container.contains(e.target)) {
    closeSupplierDropdown();
  }
});

// ----------------------------------------------------------------------------
// TA'MINOTCHI SHARTNOMALARI (UZS / USD) VA VALYUTA KURSI
// ----------------------------------------------------------------------------
async function loadSupplierContracts(counterpartyId, selectContractId = null) {
  const contractSelect = document.getElementById('pur-contract');
  if (!contractSelect) return;

  if (!counterpartyId) {
    contractSelect.innerHTML = '<option value="">-- Avval ta\'minotchini tanlang --</option>';
    currentSupplierContracts = [];
    return;
  }

  try {
    const res = await fetch(`/api/contracts?counterparty_id=${counterpartyId}`);
    const data = await res.json();
    if (data.success) {
      currentSupplierContracts = data.data || [];
      if (currentSupplierContracts.length === 0) {
        contractSelect.innerHTML = '<option value="">Shartnoma topilmadi (+ Yangi shartnoma tuzing)</option>';
        document.getElementById('pur-contract-info-bar')?.classList.add('hidden');
      } else {
        contractSelect.innerHTML = currentSupplierContracts.map(c => 
          `<option value="${c.id}" ${selectContractId && c.id === selectContractId ? 'selected' : ''}>
            ${c.contract_number} - ${c.name} (${c.currency}${c.currency === 'USD' ? ' @ ' + formatUzs(c.exchange_rate) : ''})
          </option>`
        ).join('');
        onPurchaseContractChange();
      }
    }
  } catch (err) {
    console.error('Shartnomalarni yuklashda xato:', err);
  }
}

function onPurchaseContractChange() {
  const contractSelect = document.getElementById('pur-contract');
  if (!contractSelect) return;
  const contractId = contractSelect.value;
  const contract = currentSupplierContracts.find(c => String(c.id) === String(contractId));

  const infoBar = document.getElementById('pur-contract-info-bar');
  const currBadge = document.getElementById('pur-contract-currency-badge');
  const rateText = document.getElementById('pur-contract-rate-text');
  const purCurr = document.getElementById('pur-currency');
  const currLinkText = document.getElementById('pur-currency-text');
  const rateWrapper = document.getElementById('pur-rate-wrapper');
  const exRateInput = document.getElementById('pur-exchange-rate');
  const thPriceCurr = document.getElementById('pur-th-price-curr');
  const thTotCurr = document.getElementById('pur-th-total-curr');

  if (contract) {
    if (infoBar) infoBar.classList.remove('hidden');
    if (currBadge) currBadge.innerText = contract.currency;
    if (purCurr) purCurr.value = contract.currency;
    if (currLinkText) currLinkText.innerText = contract.currency === 'USD' ? 'USD ($)' : 'UZS (So\'m)';

    if (contract.currency === 'USD') {
      const rate = contract.exchange_rate || 13000;
      if (rateText) rateText.innerText = `Kurs: 1 USD = ${formatUzs(rate)} UZS`;
      if (rateWrapper) {
        rateWrapper.classList.remove('hidden');
        rateWrapper.classList.add('flex');
      }
      if (exRateInput) exRateInput.value = rate;
      if (thPriceCurr) thPriceCurr.innerText = '$';
      if (thTotCurr) thTotCurr.innerText = '$';
    } else {
      if (rateText) rateText.innerText = `So'mda hisob-kitob (1:1)`;
      if (rateWrapper) {
        rateWrapper.classList.add('hidden');
        rateWrapper.classList.remove('flex');
      }
      if (exRateInput) exRateInput.value = 1;
      if (thPriceCurr) thPriceCurr.innerText = 'сум';
      if (thTotCurr) thTotCurr.innerText = 'сум';
    }
  } else {
    if (infoBar) infoBar.classList.add('hidden');
  }

  recalcPurchaseDocTotals();
}

function togglePurCurrency() {
  const purCurr = document.getElementById('pur-currency');
  if (!purCurr) return;
  const current = purCurr.value || 'UZS';
  const newCurr = current === 'UZS' ? 'USD' : 'UZS';
  purCurr.value = newCurr;

  const currLinkText = document.getElementById('pur-currency-text');
  if (currLinkText) currLinkText.innerText = newCurr === 'USD' ? 'USD ($)' : 'UZS (So\'m)';

  const rateWrapper = document.getElementById('pur-rate-wrapper');
  const thPriceCurr = document.getElementById('pur-th-price-curr');
  const thTotCurr = document.getElementById('pur-th-total-curr');

  if (newCurr === 'USD') {
    if (rateWrapper) {
      rateWrapper.classList.remove('hidden');
      rateWrapper.classList.add('flex');
    }
    if (thPriceCurr) thPriceCurr.innerText = '$';
    if (thTotCurr) thTotCurr.innerText = '$';
  } else {
    if (rateWrapper) {
      rateWrapper.classList.add('hidden');
      rateWrapper.classList.remove('flex');
    }
    if (thPriceCurr) thPriceCurr.innerText = 'сум';
    if (thTotCurr) thTotCurr.innerText = 'сум';
  }

  recalcPurchaseDocTotals();
}

function onPurchaseExchangeRateChange() {
  recalcPurchaseDocTotals();
}

function openNewContractModal() {
  const cpId = document.getElementById('pur-counterparty')?.value;
  const cpSearch = document.getElementById('pur-counterparty-search')?.value;
  if (!cpId) {
    alert('Iltimos, avval Ta\'minotchi (Поставщик)ni tanlang yoki qidiring!');
    return;
  }

  const cp = (globalCounterparties || []).find(c => String(c.id) === String(cpId));
  const cpName = cp ? cp.name : (cpSearch || 'Tanlangan Ta\'minotchi');

  document.getElementById('contract-form-cp-name').value = cpName;
  document.getElementById('contract-form-cp-id').value = cpId;
  document.getElementById('contract-form-num').value = `DOG-${cpId}0${(currentSupplierContracts.length + 1)}`;
  document.getElementById('contract-form-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('contract-form-name').value = `Bosh yetkazib berish shartnomasi`;
  
  const radUzs = document.querySelector('input[name="contract-currency"][value="UZS"]');
  if (radUzs) radUzs.checked = true;
  onContractCurrencyRadioChange('UZS');

  openModal('modal-contract-form');
}

function onContractCurrencyRadioChange(curr) {
  const rateGrp = document.getElementById('contract-rate-group');
  if (curr === 'USD') {
    if (rateGrp) {
      rateGrp.classList.remove('hidden');
      rateGrp.classList.add('flex');
    }
  } else {
    if (rateGrp) {
      rateGrp.classList.add('hidden');
      rateGrp.classList.remove('flex');
    }
  }
}

async function handleSaveNewContract(e) {
  e.preventDefault();
  const cpId = document.getElementById('contract-form-cp-id').value;
  const num = document.getElementById('contract-form-num').value.trim();
  const name = document.getElementById('contract-form-name').value.trim();
  const startDate = document.getElementById('contract-form-date').value || null;
  const currency = document.querySelector('input[name="contract-currency"]:checked')?.value || 'UZS';
  const rate = currency === 'USD' ? (parseFloat(document.getElementById('contract-form-rate')?.value) || 13000) : 1;
  const notes = document.getElementById('contract-form-notes')?.value.trim() || '';

  if (!cpId || !num || !name) {
    alert('Barcha majburiy maydonlarni to\'ldiring!');
    return;
  }

  try {
    const res = await fetch('/api/contracts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        counterparty_id: Number(cpId),
        contract_number: num,
        name: name,
        currency: currency,
        exchange_rate: rate,
        start_date: startDate,
        notes: notes
      })
    });
    const result = await res.json();
    if (result.success) {
      closeModal('modal-contract-form');
      alert(`✅ Yangi shartnoma (${num} - ${currency}) muvaffaqiyatli saqlandi va tanlandi!`);
      await loadSupplierContracts(cpId, result.data.id);
    } else {
      alert('Xatolik: ' + result.error);
    }
  } catch (err) {
    alert('Shartnomani saqlashda xato: ' + err.message);
  }
}

// ----------------------------------------------------------------------------
// TA'MINOTCHILARNI GURUHDAN TANLASH (1C Справочник)
// ----------------------------------------------------------------------------
async function openCounterpartyGroupPicker() {
  cpPickerCategory = 'all';
  const searchInput = document.getElementById('cp-picker-search');
  if (searchInput) searchInput.value = '';
  if (typeof fetchCatalogGroups === 'function') {
    try { await fetchCatalogGroups(); } catch (e) {}
  }
  filterCounterpartyPicker('all');
  openModal('modal-counterparty-picker');
}

function filterCounterpartyPicker(cat) {
  cpPickerCategory = cat;
  const btnAll = document.getElementById('btn-cp-group-all');
  if (btnAll) {
    btnAll.className = cat === 'all' ? 
      'w-full text-left px-3 py-2 rounded font-semibold bg-amber-100/80 text-amber-900 border border-amber-300 flex items-center gap-2' :
      'w-full text-left px-3 py-2 rounded text-gray-700 hover:bg-gray-200 flex items-center gap-2';
  }

  const dynContainer = document.getElementById('cp-picker-dynamic-groups');
  if (dynContainer) {
    dynContainer.innerHTML = (globalSupplierGroups || []).map(g => {
      const isAct = cat === g.name;
      return `
        <button type="button" onclick="filterCounterpartyPicker(decodeURIComponent('${escapeJs(g.name)}'))" class="w-full text-left px-3 py-2 rounded flex items-center justify-between gap-2 transition ${isAct ? 'bg-amber-100/80 text-amber-900 font-semibold border border-amber-300' : 'text-gray-700 hover:bg-gray-200'}">
          <span class="truncate"><i class="fa-solid fa-folder text-amber-600"></i> ${escapeHtml(g.name)}</span>
          <span class="text-[10px] font-mono bg-white px-1.5 py-0.2 rounded border border-gray-200 font-bold">${g.count || 0}</span>
        </button>
      `;
    }).join('');
  }

  renderCounterpartyPickerList();
}

function renderCounterpartyPickerList() {
  const tbody = document.getElementById('cp-picker-tbody');
  const countText = document.getElementById('cp-picker-count-text');
  if (!tbody) return;

  const search = (document.getElementById('cp-picker-search')?.value || '').trim().toLowerCase();
  const suppliers = (globalCounterparties || []).filter(c => c.type === 'supplier' || c.type === 'both');

  const filtered = suppliers.filter(s => {
    if (cpPickerCategory !== 'all') {
      const grp = (s.group_name || s.category_group || '').trim().toLowerCase();
      if (grp !== cpPickerCategory.trim().toLowerCase()) return false;
    }
    if (search) {
      const matchName = s.name.toLowerCase().includes(search);
      const matchPhone = (s.phone || '').toLowerCase().includes(search);
      const matchGrp = (s.group_name || '').toLowerCase().includes(search);
      return matchName || matchPhone || matchGrp;
    }
    return true;
  });

  if (countText) countText.innerText = `Ko'rsatilgan: ${filtered.length} ta ta'minotchi`;

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="py-8 text-center text-gray-400 italic">Ushbu guruhda ta'minotchi topilmadi.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(s => {
    const groupName = s.group_name || 'Umumiy';
    return `
      <tr class="hover:bg-amber-50/50 transition cursor-pointer" onclick="selectCounterpartyFromPicker(${s.id})">
        <td class="py-2.5 px-3 font-bold text-gray-900 flex items-center gap-2">
          <i class="fa-solid fa-building text-gray-400"></i> ${escapeHtml(s.name)}
        </td>
        <td class="py-2.5 px-3">
          <span class="px-2 py-0.5 rounded text-[11px] font-semibold border bg-gray-50 text-gray-700 border-gray-200">${escapeHtml(groupName)}</span>
        </td>
        <td class="py-2.5 px-3 text-gray-600 font-mono">${s.phone || '-'}</td>
        <td class="py-2.5 px-3 text-right font-mono font-bold ${s.balance < 0 ? 'text-rose-600' : 'text-emerald-600'}">
          ${formatUzs(Math.abs(s.balance || 0))} ${s.balance < 0 ? '(Qarzimiz)' : ''}
        </td>
        <td class="py-2.5 px-3 text-center">
          <button type="button" onclick="event.stopPropagation(); selectCounterpartyFromPicker(${s.id})" class="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded text-xs font-semibold shadow-xs transition">
            Танлаш
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

function selectCounterpartyFromPicker(id) {
  const supplier = (globalCounterparties || []).find(c => c.id === id);
  if (!supplier) return;

  const searchInput = document.getElementById('pur-counterparty-search');
  const hiddenInput = document.getElementById('pur-counterparty');
  if (searchInput) searchInput.value = supplier.name;
  if (hiddenInput) hiddenInput.value = supplier.id;

  loadSupplierContracts(supplier.id);
  closeModal('modal-counterparty-picker');
}

function openNewSupplierQuickModal() {
  closeModal('modal-counterparty-picker');
  openCounterpartyModal('supplier');
}

// ----------------------------------------------------------------------------
// NOMENKLATURANI GURUHDAN TANLASH (1C: Подобрать)
// ----------------------------------------------------------------------------
async function openNomenclatureGroupPicker(rowIdx = null) {
  targetPurchaseRowIdx = rowIdx;
  nomenPickerCategory = 'all';
  nomenPickerQuantities = {};
  const searchInput = document.getElementById('nomen-picker-search');
  if (searchInput) searchInput.value = '';
  if (typeof fetchCatalogGroups === 'function') {
    try { await fetchCatalogGroups(); } catch (e) {}
  }
  filterNomenclaturePicker('all');
  openModal('modal-nomenclature-picker');
}

function filterNomenclaturePicker(cat) {
  nomenPickerCategory = cat;
  const btnAll = document.getElementById('btn-nomen-group-all');
  if (btnAll) {
    btnAll.className = cat === 'all' ? 
      'w-full text-left px-3 py-2 rounded font-semibold bg-amber-100/80 text-amber-900 border border-amber-300 flex items-center gap-2' :
      'w-full text-left px-3 py-2 rounded text-gray-700 hover:bg-gray-200 flex items-center gap-2';
  }

  const dynContainer = document.getElementById('nomen-picker-dynamic-groups');
  if (dynContainer) {
    dynContainer.innerHTML = (globalItemGroups || []).map(g => {
      const isAct = cat === g.name;
      return `
        <button type="button" onclick="filterNomenclaturePicker(decodeURIComponent('${escapeJs(g.name)}'))" class="w-full text-left px-3 py-2 rounded flex items-center justify-between gap-2 transition ${isAct ? 'bg-amber-100/80 text-amber-900 font-semibold border border-amber-300' : 'text-gray-700 hover:bg-gray-200'}">
          <span class="truncate"><i class="fa-solid fa-folder text-amber-600"></i> ${escapeHtml(g.name)}</span>
          <span class="text-[10px] font-mono bg-white px-1.5 py-0.2 rounded border border-gray-200 font-bold">${g.count || 0}</span>
        </button>
      `;
    }).join('');
  }

  renderNomenclaturePickerList();
}

function renderNomenclaturePickerList() {
  const tbody = document.getElementById('nomen-picker-tbody');
  if (!tbody) return;

  const search = (document.getElementById('nomen-picker-search')?.value || '').trim().toLowerCase();
  const currency = document.getElementById('pur-currency')?.value || 'UZS';
  const currSign = currency === 'USD' ? '$' : 'so\'m';

  const filtered = (globalItems || []).filter(item => {
    if (nomenPickerCategory !== 'all') {
      const grp = (item.group_name || '').trim().toLowerCase();
      if (grp !== nomenPickerCategory.trim().toLowerCase()) return false;
    }

    if (search) {
      const matchName = item.name.toLowerCase().includes(search);
      const matchBarcode = (item.barcode || '').toLowerCase().includes(search);
      const matchGrp = (item.group_name || '').toLowerCase().includes(search);
      return matchName || matchBarcode || matchGrp;
    }
    return true;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="py-8 text-center text-gray-400 italic">Tovarlar topilmadi.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(item => {
    const currentQty = nomenPickerQuantities[item.id] || 0;
    const priceDisplay = currency === 'USD' ? (item.cost_price / 13000).toFixed(2) : formatUzs(item.cost_price || 0);

    return `
      <tr class="hover:bg-amber-50/40 transition cursor-pointer select-none" ondblclick="quickSelectNomenItem(${item.id})" title="Tanlash uchun ikki marta bosing">
        <td class="py-2 px-3">
          <div class="font-bold text-gray-900">${item.name}</div>
          <div class="text-[10px] text-gray-400 font-mono">${item.group_name || 'Boshqa'} | Shtrixkod: ${item.barcode || '-'}</div>
        </td>
        <td class="py-2 px-2 text-center font-mono font-medium text-gray-700">${item.unit || 'кг'}</td>
        <td class="py-2 px-3 text-right font-mono font-bold text-gray-800">${priceDisplay} ${currSign}</td>
        <td class="py-2 px-3 text-center">
          <div class="inline-flex items-center border border-gray-300 rounded overflow-hidden shadow-2xs">
            <button type="button" onclick="changeNomenPickerQty(${item.id}, -1)" class="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold">-</button>
            <input type="number" id="nomen-qty-input-${item.id}" value="${currentQty}" min="0" onchange="setNomenPickerQty(${item.id}, this.value)" class="w-16 py-1 text-center font-mono font-bold text-xs bg-white focus:outline-none">
            <button type="button" onclick="changeNomenPickerQty(${item.id}, 1)" class="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold">+</button>
          </div>
        </td>
        <td class="py-2 px-3 text-center">
          <button type="button" onclick="quickSelectNomenItem(${item.id})" class="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-medium text-xs shadow-xs transition">
            Tanlash
          </button>
        </td>
      </tr>
    `;
  }).join('');

  updateNomenPickerSelectedCount();
}

function changeNomenPickerQty(itemId, delta) {
  const current = nomenPickerQuantities[itemId] || 0;
  const newQty = Math.max(0, current + delta);
  nomenPickerQuantities[itemId] = newQty;
  const input = document.getElementById(`nomen-qty-input-${itemId}`);
  if (input) input.value = newQty;
  updateNomenPickerSelectedCount();
}

function setNomenPickerQty(itemId, val) {
  const qty = Math.max(0, parseFloat(val) || 0);
  nomenPickerQuantities[itemId] = qty;
  updateNomenPickerSelectedCount();
}

function updateNomenPickerSelectedCount() {
  let count = 0;
  Object.values(nomenPickerQuantities).forEach(q => { if (q > 0) count++; });
  const countBadge = document.getElementById('nomen-picker-selected-count');
  if (countBadge) countBadge.innerText = `${count} ta`;
}

function quickSelectNomenItem(itemId) {
  const item = (globalItems || []).find(i => i.id === itemId);
  if (!item) return;

  const currentQty = nomenPickerQuantities[itemId] || 1;
  const currency = document.getElementById('pur-currency')?.value || 'UZS';
  const exRate = parseFloat(document.getElementById('pur-exchange-rate')?.value) || 13000;
  const unitPrice = currency === 'USD' ? parseFloat((item.cost_price / exRate).toFixed(2)) : (item.cost_price || 0);

  if (targetPurchaseRowIdx !== null && purchaseDocRows[targetPurchaseRowIdx]) {
    const row = purchaseDocRows[targetPurchaseRowIdx];
    row.item_id = item.id;
    row.unit = item.unit || 'кг';
    row.barcode = item.barcode || '';
    row.quantity = currentQty > 0 ? currentQty : 1;
    row.unit_price = unitPrice;
    row.total_price = row.quantity * row.unit_price;
    row.custom_price = item.sale_price || 0;
  } else {
    if (purchaseDocRows.length === 1 && !purchaseDocRows[0].item_id) {
      purchaseDocRows[0] = {
        item_id: item.id,
        unit: item.unit || 'кг',
        barcode: item.barcode || '',
        gross_weight: 0,
        tare_weight: 0,
        quantity: currentQty > 0 ? currentQty : 1,
        unit_price: unitPrice,
        discount_percent: 0,
        discount_amount: 0,
        total_price: (currentQty > 0 ? currentQty : 1) * unitPrice,
        custom_price: item.sale_price || 0,
        custom_price2: 0
      };
    } else {
      addPurchaseRow({
        id: item.id,
        unit: item.unit,
        barcode: item.barcode,
        quantity: currentQty > 0 ? currentQty : 1,
        unit_price: unitPrice,
        sale_price: item.sale_price
      });
    }
  }

  renderPurchaseDocRows();
  closeModal('modal-nomenclature-picker');
}

function applyNomenclaturePickerSelection() {
  const selectedEntries = Object.entries(nomenPickerQuantities).filter(([_, q]) => q > 0);
  if (selectedEntries.length === 0) {
    alert('Kamida bitta tovar miqdorini kiriting!');
    return;
  }

  const currency = document.getElementById('pur-currency')?.value || 'UZS';
  const exRate = parseFloat(document.getElementById('pur-exchange-rate')?.value) || 13000;

  selectedEntries.forEach(([idStr, qty], idx) => {
    const item = (globalItems || []).find(i => String(i.id) === String(idStr));
    if (!item) return;

    const unitPrice = currency === 'USD' ? parseFloat((item.cost_price / exRate).toFixed(2)) : (item.cost_price || 0);

    if (idx === 0 && purchaseDocRows.length === 1 && !purchaseDocRows[0].item_id) {
      purchaseDocRows[0] = {
        item_id: item.id,
        unit: item.unit || 'кг',
        barcode: item.barcode || '',
        gross_weight: 0,
        tare_weight: 0,
        quantity: qty,
        unit_price: unitPrice,
        discount_percent: 0,
        discount_amount: 0,
        total_price: qty * unitPrice,
        custom_price: item.sale_price || 0,
        custom_price2: 0
      };
    } else {
      addPurchaseRow({
        id: item.id,
        unit: item.unit,
        barcode: item.barcode,
        quantity: qty,
        unit_price: unitPrice,
        sale_price: item.sale_price
      });
    }
  });

  renderPurchaseDocRows();
  closeModal('modal-nomenclature-picker');
}

// ⚖️ ELEKTRON TAROZI INTEGRATSIYASI
function handleGetScaleWeight() {
  const row = purchaseDocRows[selectedPurchaseRowIdx] || purchaseDocRows[0];
  if (!row) return;

  const currentGross = row.gross_weight || 1250;
  const inputGross = prompt("⚖️ ELEKTRON TAROZI (CAS/KAS Scale):\nGo'sht / Xomashyo Brutto og'irligini kiriting (kg):", currentGross);
  if (inputGross === null) return;
  const gross = parseFloat(inputGross) || 0;

  const currentTare = row.tare_weight || 25;
  const inputTare = prompt("Idish / Ilgak / Yashik og'irligi (Tara, kg):", currentTare);
  const tare = parseFloat(inputTare) || 0;

  row.gross_weight = gross;
  row.tare_weight = tare;
  row.quantity = Math.max(0, gross - tare);
  row.total_price = Math.max(0, (row.quantity * row.unit_price) - (row.discount_amount || 0));

  renderPurchaseDocRows();
  alert(`✅ Tarozidan og'irlik qabul qilindi!\nBrutto: ${gross} kg\nTara: ${tare} kg\nSof Netto Miqdor: ${row.quantity.toFixed(2)} kg`);
}

function promptBarcodeScanner() {
  const barcode = prompt("Shtrixkod skanerlang yoki kiriting:");
  if (!barcode) return;
  const row = purchaseDocRows[selectedPurchaseRowIdx] || purchaseDocRows[0];
  if (row) {
    row.barcode = barcode.trim();
    renderPurchaseDocRows();
  }
}

function openMultiItemPicker() {
  const available = (globalItems || []).slice(0, 5);
  available.forEach(it => {
    addPurchaseRow(it);
  });
  alert(`${available.length} ta tovar ro'yxatga qo'shildi.`);
}

function openDocExcelImportModal() {
  const input = prompt("Exceldan nusxalangan qatorlarni qo'ying (Format: Nomi [Tab] Miqdor [Tab] Narx):", "Mol go'shti\t2500\t72000\nTovuq filesi\t1200\t38000");
  if (!input) return;
  const lines = input.trim().split('\n');
  lines.forEach(line => {
    const parts = line.split('\t');
    if (parts.length >= 2) {
      const name = parts[0].trim();
      const qty = parseFloat(parts[1]) || 1;
      const price = parseFloat(parts[2]) || 0;
      const matched = (globalItems || []).find(i => i.name.toLowerCase().includes(name.toLowerCase())) || (globalItems && globalItems[0]);
      if (matched) {
        purchaseDocRows.push({
          item_id: matched.id,
          unit: matched.unit || 'кг',
          barcode: '',
          gross_weight: 0,
          tare_weight: 0,
          quantity: qty,
          unit_price: price || matched.cost_price,
          discount_amount: 0,
          total_price: qty * (price || matched.cost_price),
          custom_price: matched.sale_price,
          custom_price2: 0
        });
      }
    }
  });
  renderPurchaseDocRows();
  alert("Excel qatorlari muvaffaqiyatli import qilindi!");
}

// HUJJATNI SAQLASH VA O'TKAZISH (Провести и закрыть / Записать / Провести)
async function handleSavePurchaseDoc(postAndClose = true, isDraft = false) {
  const docNumber = document.getElementById('pur-doc-num').value.trim();
  const docDate = document.getElementById('pur-doc-date').value;
  const inNum = document.getElementById('pur-in-num') ? document.getElementById('pur-in-num').value.trim() : '';
  const inDate = document.getElementById('pur-in-date') ? document.getElementById('pur-in-date').value : null;
  const operationType = document.getElementById('pur-operation-type').value;
  const counterpartyId = document.getElementById('pur-counterparty')?.value;
  const organization = document.getElementById('pur-organization') ? document.getElementById('pur-organization').value : 'ZAVOD';
  const currency = document.getElementById('pur-currency') ? document.getElementById('pur-currency').value : 'UZS';
  const warehouse = document.getElementById('pur-warehouse') ? document.getElementById('pur-warehouse').value : '<склад в табличной части>';
  const author = document.getElementById('pur-author') ? document.getElementById('pur-author').value : 'Yuk qabul qilish bo\'limi';
  const accountId = document.getElementById('pur-account') ? (document.getElementById('pur-account').value || null) : null;
  const notes = document.getElementById('pur-notes') ? document.getElementById('pur-notes').value.trim() : '';

  if (!counterpartyId) {
    alert('Iltimos, Поставщик (Ta\'minotchi)ni tanlang yoki qidiring!');
    return;
  }

  const validItems = purchaseDocRows.filter(r => r.item_id && Number(r.item_id) > 0);
  if (validItems.length === 0) {
    alert('Hujjatda kamida bitta tovar (nomenklatura) tanlangan bo\'lishi shart!');
    return;
  }

  const contractSelect = document.getElementById('pur-contract');
  const contractId = contractSelect ? (contractSelect.value || null) : null;
  const contractName = contractSelect && contractSelect.selectedOptions[0] ? contractSelect.selectedOptions[0].text : '';
  const exchangeRate = parseFloat(document.getElementById('pur-exchange-rate')?.value) || 1;

  const payload = {
    doc_number: docNumber,
    doc_date: docDate,
    incoming_number: inNum,
    incoming_date: inDate,
    operation_type: operationType,
    counterparty_id: Number(counterpartyId),
    organization: organization,
    currency: currency,
    warehouse: warehouse,
    author: author,
    account_id: accountId ? Number(accountId) : null,
    status: isDraft ? 'DRAFT' : 'POSTED',
    notes: notes,
    contract_id: contractId ? Number(contractId) : null,
    contract_name: contractName,
    exchange_rate: exchangeRate,
    items: validItems.map(r => ({
      item_id: Number(r.item_id),
      quantity: Number(r.quantity) || 0,
      unit_price: Number(r.unit_price) || 0,
      barcode: r.barcode || '',
      gross_weight: Number(r.gross_weight) || 0,
      tare_weight: Number(r.tare_weight) || 0,
      discount_percent: Number(r.discount_percent) || 0,
      discount_amount: Number(r.discount_amount) || 0,
      custom_price: Number(r.custom_price) || 0,
      custom_price2: Number(r.custom_price2) || 0
    }))
  };

  try {
    const res = await fetch('/api/purchases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await res.json();
    if (result.success) {
      await refreshAllData();
      if (postAndClose) {
        closeModal('modal-purchase');
        alert(`✅ 1C: Приходная накладная № ${docNumber} muvaffaqiyatli o'tkazildi va yopildi!`);
      } else if (isDraft) {
        alert(`💾 Hujjat qoralama sifatida saqlandi (№ ${docNumber}).`);
      } else {
        alert(`✅ Hujjat o'tkazildi (Проведен: № ${docNumber}).`);
      }
    } else {
      alert('Xatolik: ' + result.error);
    }
  } catch (err) {
    alert('Serverga ulanishda xato: ' + err.message);
  }
}

function printCurrentPurchaseDoc() {
  const docNumber = document.getElementById('pur-doc-num').value;
  const docDate = document.getElementById('pur-doc-date').value;
  const cpName = document.getElementById('pur-counterparty-search')?.value || 'Ta\'minotchi';
  const currency = document.getElementById('pur-currency').value;
  const currSign = currency === 'USD' ? '$' : 'сум';
  
  let grandTotal = 0;
  const rowsHtml = purchaseDocRows.map((r, i) => {
    grandTotal += (r.total_price || 0);
    const itemObj = (globalItems || []).find(it => it.id === r.item_id);
    return `
      <tr>
        <td style="border: 1px solid #333; padding: 5px; text-align: center;">${i+1}</td>
        <td style="border: 1px solid #333; padding: 5px;">${itemObj ? itemObj.name : ''}</td>
        <td style="border: 1px solid #333; padding: 5px; text-align: center;">${r.unit || 'кг'}</td>
        <td style="border: 1px solid #333; padding: 5px; text-align: right;">${r.quantity}</td>
        <td style="border: 1px solid #333; padding: 5px; text-align: right;">${formatUzs(r.unit_price)}</td>
        <td style="border: 1px solid #333; padding: 5px; text-align: right; font-weight: bold;">${formatUzs(r.total_price)}</td>
      </tr>
    `;
  }).join('');

  const printWindow = window.open('', '_blank', 'width=850,height=650');
  printWindow.document.write(`
    <html>
      <head><title>Приходная накладная № ${docNumber}</title></head>
      <body style="font-family: Arial, sans-serif; font-size: 12px; margin: 30px;">
        <h2>ПРИХОДНАЯ НАКЛАДНАЯ № ${docNumber}</h2>
        <div>Sana: <strong>${docDate}</strong> | Tashkilot: <strong>ZAVOD</strong></div>
        <div>Поставщик: <strong>${cpName}</strong></div>
        <hr/>
        <table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
          <thead>
            <tr style="background: #f0f0f0;">
              <th style="border: 1px solid #333; padding: 5px;">№</th>
              <th style="border: 1px solid #333; padding: 5px;">Номенклатура</th>
              <th style="border: 1px solid #333; padding: 5px;">Ед.</th>
              <th style="border: 1px solid #333; padding: 5px;">Количество</th>
              <th style="border: 1px solid #333; padding: 5px;">Цена</th>
              <th style="border: 1px solid #333; padding: 5px;">Сумма</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
          <tfoot>
            <tr>
              <th colspan="5" style="border: 1px solid #333; padding: 5px; text-align: right;">ИТОГО:</th>
              <th style="border: 1px solid #333; padding: 5px; text-align: right;">${formatUzs(grandTotal)} ${currSign}</th>
            </tr>
          </tfoot>
        </table>
      </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => { printWindow.print(); }, 250);
}

function handlePurchaseOpTypeChange() {
  const opType = document.getElementById('pur-operation-type').value;
  const isReturn = opType && opType.includes('Возврат');
  const warehouse = document.getElementById('pur-warehouse');
  if (isReturn) {
    if (warehouse) warehouse.value = 'Возврат Клиент';
    populatePurchaseCounterparties('customer');
  } else {
    if (warehouse) warehouse.value = '<склад в табличной части>';
    populatePurchaseCounterparties('supplier');
  }
}

function populatePurchaseCounterparties(type = 'supplier') {
  const purCp = document.getElementById('pur-counterparty');
  if (!purCp) return;
  let cps = globalCounterparties || [];
  if (type === 'customer') {
    cps = cps.filter(c => c.type === 'customer' || c.type === 'both');
  } else {
    cps = cps.filter(c => c.type === 'supplier' || c.type === 'both');
  }
  purCp.innerHTML = cps.map(s => `<option value="${s.id}">${s.name} (${s.phone || ''})</option>`).join('');
}

// ----------------------------------------------------------------------------
// 6. CHIQIM / SOTUVLAR (Продажи)
// ----------------------------------------------------------------------------
async function fetchSales() {
  try {
    const res = await fetch('/api/sales');
    const result = await res.json();
    if (result.success) {
      renderSalesTable(result.data || []);
    }
  } catch (err) {
    console.error('Sotuvlarni yuklashda xato:', err);
  }
}

function renderSalesTable(docs) {
  const tbody = document.getElementById('sales-table-body');
  if (!tbody) return;

  if (docs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="px-4 py-8 text-center text-gray-500">Hozircha sotuv hujjatlari yo'q. "Yangi Sotuv Nakladnoyi" tugmasini bosing.</td></tr>`;
    return;
  }

  tbody.innerHTML = docs.map(d => {
    const itemsList = (d.items || []).map(i => `${i.item_name} (${i.quantity} ${i.unit})`).join(', ');
    const paymentStatus = d.account_id ? 
      '<span class="px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800 font-semibold text-[10px]">To\'langan</span>' : 
      '<span class="px-2 py-0.5 rounded bg-amber-950 text-amber-400 border border-amber-800 font-semibold text-[10px]">Nasiya (Qarz)</span>';

    return `
      <tr class="hover:bg-gray-800/40 transition">
        <td class="px-4 py-3 font-mono font-bold text-white">${d.doc_number}</td>
        <td class="px-4 py-3 font-mono text-gray-400">${d.doc_date}</td>
        <td class="px-4 py-3 font-semibold text-blue-300">${d.counterparty_name || '-'}</td>
        <td class="px-4 py-3 text-gray-300 truncate max-w-xs">${itemsList}</td>
        <td class="px-4 py-3 text-right font-mono font-bold text-blue-400">${formatUzs(d.total_amount)} UZS</td>
        <td class="px-4 py-3 text-center">${paymentStatus}</td>
        <td class="px-4 py-3 text-gray-500">${d.notes || ''}</td>
      </tr>
    `;
  }).join('');
}

async function handleCreateSale(e) {
  e.preventDefault();
  const docNumber = document.getElementById('sale-doc-num').value;
  const docDate = document.getElementById('sale-doc-date').value;
  const counterpartyId = document.getElementById('sale-counterparty').value;
  const accountId = document.getElementById('sale-account').value || null;
  const itemId = Number(document.getElementById('sale-item-select').value);
  const qty = Number(document.getElementById('sale-qty').value);
  const price = Number(document.getElementById('sale-price').value);
  const notes = document.getElementById('sale-notes').value;

  const payload = {
    doc_number: docNumber,
    doc_date: docDate,
    counterparty_id: counterpartyId ? Number(counterpartyId) : null,
    account_id: accountId ? Number(accountId) : null,
    notes: notes,
    items: [{ item_id: itemId, quantity: qty, unit_price: price }]
  };

  try {
    const res = await fetch('/api/sales', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await res.json();
    if (result.success) {
      closeModal('modal-sale');
      document.getElementById('sale-form').reset();
      refreshAllData();
      alert('Sotuv nakladnoyi muvaffaqiyatli rasmiylashtirildi!');
    } else {
      alert('Xatolik: ' + result.error);
    }
  } catch (err) {
    alert('Serverga ulanishda xato: ' + err.message);
  }
}

// ----------------------------------------------------------------------------
// 7. ISHLAB CHIQARISH (Производство)
// ----------------------------------------------------------------------------
async function fetchProductions() {
  try {
    const res = await fetch('/api/productions');
    const result = await res.json();
    if (result.success) {
      renderProductionsTable(result.data || []);
    }
  } catch (err) {
    console.error('Ishlab chiqarishni yuklashda xato:', err);
  }
}

function renderProductionsTable(docs) {
  const tbody = document.getElementById('production-table-body');
  if (!tbody) return;

  if (docs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="px-4 py-8 text-center text-gray-500">Hozircha ishlab chiqarish hujjatlari yo'q. "Mahsulot Chiqarish (Vipusk)" tugmasini bosing.</td></tr>`;
    return;
  }

  tbody.innerHTML = docs.map(d => `
    <tr class="hover:bg-gray-800/40 transition">
      <td class="px-3 py-2.5 font-mono font-bold text-white">${d.doc_number}</td>
      <td class="px-3 py-2.5 font-mono text-gray-400">${d.doc_date}</td>
      <td class="px-3 py-2.5 font-semibold text-purple-300">${d.finished_good_name}</td>
      <td class="px-3 py-2.5 text-right font-mono font-bold text-white">${formatUzs(d.produced_qty).split(',')[0]} ${d.finished_good_unit}</td>
      <td class="px-3 py-2.5 text-right font-mono text-teal-400">${formatUzs(d.unit_cost)} UZS</td>
      <td class="px-3 py-2.5 text-right font-mono font-bold text-purple-400">${formatUzs(d.total_amount)} UZS</td>
    </tr>
  `).join('');
}

async function handleCreateProduction(e) {
  e.preventDefault();
  const docNumber = document.getElementById('prod-doc-num').value;
  const docDate = document.getElementById('prod-doc-date').value;
  const finishedItemId = document.getElementById('prod-finished-item').value;
  const qty = Number(document.getElementById('prod-qty').value);

  const payload = {
    doc_number: docNumber,
    doc_date: docDate,
    finished_item_id: Number(finishedItemId),
    quantity: qty
  };

  try {
    const res = await fetch('/api/productions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await res.json();
    if (result.success) {
      closeModal('modal-production');
      document.getElementById('production-form').reset();
      refreshAllData();
      alert(`Mahsulot muvaffaqiyatli chiqarildi! 1 birlik tannarxi: ${formatUzs(result.calculated_unit_cost)} UZS`);
    } else {
      alert('Xatolik: ' + result.error);
    }
  } catch (err) {
    alert('Serverga ulanishda xato: ' + err.message);
  }
}

// ----------------------------------------------------------------------------
// 8. PUL: KASSA VA BANK (Деньги)
// ----------------------------------------------------------------------------
async function fetchAccounts() {
  try {
    const res = await fetch('/api/accounts');
    const result = await res.json();
    if (result.success) {
      globalAccounts = result.data || [];
      renderMoneyAccounts(globalAccounts);
      populateAccountSelects();
      if (activeTab === 'catalogs') renderCatalogs();
    }
  } catch (err) {
    console.error('Hisoblarni yuklashda xato:', err);
  }
}

function renderMoneyAccounts(accounts) {
  const container = document.getElementById('money-accounts-container');
  if (!container) return;

  container.innerHTML = accounts.map(acc => {
    const isCash = acc.type === 'cash';
    return `
      <div class="bg-gray-950/80 p-4 rounded-xl border border-gray-800 space-y-2">
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
            <i class="fa-solid ${isCash ? 'fa-money-bill-wave text-emerald-400' : 'fa-building-columns text-blue-400'}"></i>
            ${acc.name}
          </span>
          <span class="text-[10px] px-2 py-0.5 rounded bg-gray-800 text-gray-300 font-mono">${acc.currency}</span>
        </div>
        <div class="text-xl font-mono font-extrabold text-white">
          ${formatUzs(acc.balance)} <span class="text-xs text-gray-400 font-normal">${acc.currency}</span>
        </div>
        <div class="text-[10px] text-gray-500 font-mono truncate">
          Hisob: ${acc.account_number || '-'}
        </div>
      </div>
    `;
  }).join('');
}

function populateAccountSelects() {
  // Kirim va Sotuvdagi to'lov hisoblari
  const selects = ['pur-account', 'sale-account', 'mo-account'];
  selects.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const isOptional = id !== 'mo-account';
    let html = isOptional ? `<option value="">To'lovsiz (Qarzga)</option>` : '';
    html += globalAccounts.map(a => `<option value="${a.id}">${a.name} (${formatUzs(a.balance)} ${a.currency})</option>`).join('');
    el.innerHTML = html;
  });
}

async function fetchMoneyMovements() {
  try {
    const res = await fetch('/api/money-movements');
    const result = await res.json();
    if (result.success) {
      renderMoneyMovementsTable(result.data || []);
    }
  } catch (err) {
    console.error('Pul harakatlarini yuklashda xato:', err);
  }
}

function renderMoneyMovementsTable(movements) {
  const tbody = document.getElementById('money-movements-table-body');
  if (!tbody) return;

  if (movements.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="px-4 py-8 text-center text-gray-500">Hozircha pul harakatlari qayd etilmagan.</td></tr>`;
    return;
  }

  tbody.innerHTML = movements.map(m => {
    const isIn = m.movement_type === 'IN';
    const typeBadge = isIn ? 
      '<span class="px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800 font-semibold text-[10px]">Kirim (ПКО)</span>' : 
      '<span class="px-2 py-0.5 rounded bg-rose-950 text-rose-400 border border-rose-800 font-semibold text-[10px]">Chiqim (РКО)</span>';

    return `
      <tr class="hover:bg-gray-800/40 transition">
        <td class="px-3 py-2.5 font-mono text-gray-400">${m.movement_date}</td>
        <td class="px-3 py-2.5 font-semibold text-gray-200">${m.account_name}</td>
        <td class="px-3 py-2.5">${typeBadge}</td>
        <td class="px-3 py-2.5 text-gray-300">${m.counterparty_name || '-'}</td>
        <td class="px-3 py-2.5 text-gray-400 font-mono text-[11px]">${m.category}</td>
        <td class="px-3 py-2.5 text-right font-mono font-bold ${isIn ? 'text-emerald-400' : 'text-rose-400'}">
          ${isIn ? '+' : '-'}${formatUzs(m.amount)} UZS
        </td>
        <td class="px-3 py-2.5 text-gray-500">${m.notes || ''}</td>
      </tr>
    `;
  }).join('');
}

async function handleCreateMoneyOrder(e) {
  e.preventDefault();
  const type = document.getElementById('mo-type').value;
  const date = document.getElementById('mo-date').value;
  const accountId = document.getElementById('mo-account').value;
  const amount = Number(document.getElementById('mo-amount').value);
  const counterpartyId = document.getElementById('mo-counterparty').value || null;
  const category = document.getElementById('mo-category').value;
  const notes = document.getElementById('mo-notes').value;

  const payload = {
    type,
    date,
    account_id: Number(accountId),
    amount,
    counterparty_id: counterpartyId ? Number(counterpartyId) : null,
    category,
    notes
  };

  try {
    const res = await fetch('/api/money-orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await res.json();
    if (result.success) {
      closeModal('modal-money-order');
      document.getElementById('money-order-form').reset();
      refreshAllData();
      alert('Pul orderi muvaffaqiyatli saqlandi!');
    } else {
      alert('Xatolik: ' + result.error);
    }
  } catch (err) {
    alert('Serverga ulanishda xato: ' + err.message);
  }
}

// ----------------------------------------------------------------------------
// 9. MOLIYAVIY HISOBOTLAR (P&L va BALANS)
// ----------------------------------------------------------------------------
async function fetchReports() {
  try {
    const res = await fetch('/api/reports');
    const result = await res.json();
    if (result.success && result.data) {
      renderReports(result.data);
    }
  } catch (err) {
    console.error('Moliyaviy hisobotlarni yuklashda xato:', err);
  }
}

function renderReports(data) {
  // 1. P&L
  const pnl = data.pnl;
  document.getElementById('pnl-revenue').innerText = `${formatUzs(pnl.revenue)} UZS`;
  document.getElementById('pnl-cogs').innerText = `-${formatUzs(pnl.cogs)} UZS`;
  document.getElementById('pnl-gross-profit').innerText = `${formatUzs(pnl.gross_profit)} UZS`;
  document.getElementById('pnl-gross-margin').innerText = `${pnl.gross_margin_pct}%`;
  document.getElementById('pnl-expenses').innerText = `-${formatUzs(pnl.total_expenses)} UZS`;
  document.getElementById('pnl-net-profit').innerText = `${formatUzs(pnl.net_profit)} UZS`;

  // 2. Balans
  const bal = data.balance;
  document.getElementById('bal-cash').innerText = `${formatUzs(bal.assets.cash_and_bank)} UZS`;
  document.getElementById('bal-stock').innerText = `${formatUzs(bal.assets.total_stock)} UZS`;
  document.getElementById('bal-debtors').innerText = `${formatUzs(bal.assets.debtors)} UZS`;
  document.getElementById('bal-total-assets').innerText = `${formatUzs(bal.assets.total_assets)} UZS`;

  document.getElementById('bal-creditors').innerText = `${formatUzs(bal.liabilities.creditors)} UZS`;
  document.getElementById('bal-equity').innerText = `${formatUzs(bal.liabilities.equity)} UZS`;
  document.getElementById('bal-total-liabilities').innerText = `${formatUzs(bal.liabilities.total_liabilities)} UZS`;
  document.getElementById('balance-check-badge').innerText = bal.balance_check;
}

// Sverka aktini yuklash
async function loadCounterpartySverka() {
  const select = document.getElementById('sverka-counterparty-select');
  const container = document.getElementById('sverka-result-container');
  if (!select || !container || !select.value) return;

  try {
    const res = await fetch(`/api/reports/sverka/${select.value}`);
    const result = await res.json();
    if (result.success && result.data) {
      const { counterparty, documents, payments } = result.data;
      const isDebtor = counterparty.balance >= 0;

      const docRows = documents.map(d => `
        <tr class="hover:bg-gray-800/40">
          <td class="px-3 py-2">${d.doc_date}</td>
          <td class="px-3 py-2 font-mono font-bold">${d.doc_number}</td>
          <td class="px-3 py-2">${d.doc_type}</td>
          <td class="px-3 py-2 text-right font-mono font-bold">${formatUzs(d.total_amount)} UZS</td>
        </tr>
      `).join('');

      const payRows = payments.map(p => `
        <tr class="hover:bg-gray-800/40">
          <td class="px-3 py-2">${p.movement_date}</td>
          <td class="px-3 py-2">${p.movement_type === 'IN' ? 'Kirim to\'lov' : 'Chiqim to\'lov'}</td>
          <td class="px-3 py-2 text-right font-mono font-bold">${formatUzs(p.amount)} UZS</td>
          <td class="px-3 py-2 text-gray-400">${p.notes || ''}</td>
        </tr>
      `).join('');

      container.innerHTML = `
        <div class="space-y-4 text-left">
          <div class="p-3 bg-gray-950 rounded-lg border border-gray-800 flex items-center justify-between">
            <div>
              <strong class="text-white text-sm">${counterparty.name}</strong>
              <p class="text-gray-400 text-xs">${counterparty.phone || ''} | ${counterparty.address || ''}</p>
            </div>
            <div class="text-right">
              <span class="text-[11px] text-gray-400 block">Joriy Yakuniy Qarz:</span>
              <span class="text-base font-mono font-extrabold ${isDebtor ? 'text-emerald-400' : 'text-rose-400'}">
                ${formatUzs(counterparty.balance)} UZS ${isDebtor ? '(Bizga qarzdor)' : '(Biz qarzmiz)'}
              </span>
            </div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div class="space-y-2">
              <h4 class="font-bold text-gray-300">Rasmiylashtirilgan Hujjatlar:</h4>
              <table class="w-full text-xs bg-gray-950 rounded border border-gray-800">
                <thead class="bg-gray-800 text-gray-400"><tr><th class="p-2">Sana</th><th class="p-2">Hujjat</th><th class="p-2">Tur</th><th class="p-2 text-right">Summa</th></tr></thead>
                <tbody>${docRows.length ? docRows : '<tr><td colspan="4" class="p-3 text-center text-gray-500">Hujjatlar yo\'q</td></tr>'}</tbody>
              </table>
            </div>

            <div class="space-y-2">
              <h4 class="font-bold text-gray-300">Amalga oshirilgan To'lovlar:</h4>
              <table class="w-full text-xs bg-gray-950 rounded border border-gray-800">
                <thead class="bg-gray-800 text-gray-400"><tr><th class="p-2">Sana</th><th class="p-2">Tur</th><th class="p-2 text-right">Summa</th><th class="p-2">Izoh</th></tr></thead>
                <tbody>${payRows.length ? payRows : '<tr><td colspan="4" class="p-3 text-center text-gray-500">To\'lovlar yo\'q</td></tr>'}</tbody>
              </table>
            </div>
          </div>
        </div>
      `;
    }
  } catch (err) {
    console.error('Sverka yuklashda xato:', err);
  }
}

// ============================================================================
// 1C NAVIGATSIYA VA ORQAGA / OLDINGA QAYTISH TIZIMI (1C NAVIGATION STACK)
// ============================================================================
const navigation1cStack = [];
const navigation1cForwardStack = [];
const KNOWN_1C_MODALS = [
  'modal-contract-form',
  'modal-counterparty-picker',
  'modal-nomenclature-picker',
  'modal-1c-nomenclature-catalog',
  'modal-1c-suppliers-catalog',
  'modal-purchase',
  'modal-purchases-journal',
  'modal-item',
  'modal-sale',
  'modal-production'
];

function getTopActive1cModalId() {
  for (const id of KNOWN_1C_MODALS) {
    const el = document.getElementById(id);
    if (el && !el.classList.contains('hidden')) {
      return id;
    }
  }
  return null;
}

function push1cNavigation(entry) {
  if (!entry || !entry.modalId) return;
  const top = navigation1cStack[navigation1cStack.length - 1];
  if (top && top.modalId === entry.modalId) {
    if (!entry.group || top.group === entry.group) {
      return;
    }
    if (!top.group && entry.group) {
      top.group = entry.group;
      update1cNavButtonsState();
      return;
    }
  }
  navigation1cStack.push(entry);
  navigation1cForwardStack.length = 0; // Yangi qadamda forward tarixi tozalanadi
  update1cNavButtonsState();
}

function go1cBack(modalId) {
  if (!modalId) modalId = getTopActive1cModalId();
  if (!modalId) return;

  // 1. Agar Nomenklatura katalogida biror guruh tanlangan bo'lsa, 'all' (Barcha tovarlar) ga qaytish
  if (modalId === 'modal-1c-nomenclature-catalog') {
    if (typeof activeNomenclatureCatalogGroup !== 'undefined' && activeNomenclatureCatalogGroup !== 'all') {
      const popped = navigation1cStack.pop();
      if (popped) navigation1cForwardStack.push(popped);
      selectNomenclatureCatalogGroup('all', false);
      update1cNavButtonsState();
      return;
    }
  }

  // 2. Agar Ta'minotchilar katalogida biror guruh tanlangan bo'lsa, 'all' (Barcha ta'minotchilar) ga qaytish
  if (modalId === 'modal-1c-suppliers-catalog') {
    if (typeof activeSupplierCatalogGroup !== 'undefined' && activeSupplierCatalogGroup !== 'all') {
      const popped = navigation1cStack.pop();
      if (popped) navigation1cForwardStack.push(popped);
      selectSupplierCatalogGroup('all', false);
      update1cNavButtonsState();
      return;
    }
  }

  // 3. Agar Nomenklatura tanlash pickerida guruh tanlangan bo'lsa
  if (modalId === 'modal-nomenclature-picker') {
    if (typeof nomenPickerCategory !== 'undefined' && nomenPickerCategory !== 'all') {
      filterNomenclaturePicker('all');
      return;
    }
  }

  // 4. Agar Kontragent tanlash pickerida guruh tanlangan bo'lsa
  if (modalId === 'modal-counterparty-picker') {
    if (typeof cpPickerCategory !== 'undefined' && cpPickerCategory !== 'all') {
      filterCounterpartyPicker('all');
      return;
    }
  }

  // 5. Modalning eng yuqori pog'onasida bo'lsak, joriy modalni yopamiz
  closeModal(modalId);

  // Stackdan joriy modalni olib forwardga qo'yamiz
  if (navigation1cStack.length > 0) {
    const popped = navigation1cStack.pop();
    if (popped) navigation1cForwardStack.push(popped);
  }

  // Oldingi modal mavjud bo'lsa, uni tiklaymiz
  if (navigation1cStack.length > 0) {
    const prev = navigation1cStack[navigation1cStack.length - 1];
    if (prev && prev.modalId && prev.modalId !== modalId) {
      const prevEl = document.getElementById(prev.modalId);
      if (prevEl) {
        prevEl.classList.remove('hidden');
        prevEl.classList.add('flex');
        if (prev.modalId === 'modal-1c-nomenclature-catalog' && prev.group) {
          selectNomenclatureCatalogGroup(prev.group, false);
        } else if (prev.modalId === 'modal-1c-suppliers-catalog' && prev.group) {
          selectSupplierCatalogGroup(prev.group, false);
        }
      }
    }
  }

  update1cNavButtonsState();
}

function go1cForward(modalId) {
  if (navigation1cForwardStack.length === 0) return;
  const next = navigation1cForwardStack.pop();
  if (!next) return;

  navigation1cStack.push(next);

  if (next.modalId) {
    const el = document.getElementById(next.modalId);
    if (el) {
      el.classList.remove('hidden');
      el.classList.add('flex');
    }
    if (next.modalId === 'modal-1c-nomenclature-catalog' && next.group) {
      selectNomenclatureCatalogGroup(next.group, false);
    } else if (next.modalId === 'modal-1c-suppliers-catalog' && next.group) {
      selectSupplierCatalogGroup(next.group, false);
    }
  }

  update1cNavButtonsState();
}

function update1cNavButtonsState() {
  const canForward = navigation1cForwardStack.length > 0;
  document.querySelectorAll('.btn-1c-nav-forward').forEach(btn => {
    if (canForward) {
      btn.classList.remove('opacity-40', 'cursor-not-allowed');
      btn.classList.add('hover:text-white', 'cursor-pointer');
      btn.removeAttribute('disabled');
    } else {
      btn.classList.add('opacity-40', 'cursor-not-allowed');
      btn.classList.remove('hover:text-white', 'cursor-pointer');
      btn.setAttribute('disabled', 'true');
    }
  });

  document.querySelectorAll('.btn-1c-nav-back').forEach(btn => {
    btn.classList.remove('opacity-40', 'cursor-not-allowed');
    btn.classList.add('hover:text-white', 'cursor-pointer');
    btn.removeAttribute('disabled');
  });
}

// Klaviatura orqali tezkor boshqarish: Alt+ArrowLeft (Orqaga), Alt+ArrowRight (Oldinga), Backspace (matn yozilmayotganda)
window.addEventListener('keydown', (e) => {
  const tag = (e.target && e.target.tagName) ? e.target.tagName.toUpperCase() : '';
  const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || e.target?.isContentEditable;

  if (e.altKey && e.key === 'ArrowLeft') {
    e.preventDefault();
    const topId = getTopActive1cModalId();
    if (topId) go1cBack(topId);
  } else if (e.altKey && e.key === 'ArrowRight') {
    e.preventDefault();
    const topId = getTopActive1cModalId();
    if (topId) go1cForward(topId);
  } else if (!isInput && e.key === 'Backspace') {
    const topId = getTopActive1cModalId();
    if (topId) {
      e.preventDefault();
      go1cBack(topId);
    }
  }
});

// ----------------------------------------------------------------------------
// 10. MODALLARNI BOSHQARISH
// ----------------------------------------------------------------------------
function openModal(id) {
  const el = document.getElementById(id);
  if (el) {
    el.classList.remove('hidden');
    el.classList.add('flex');

    // Ichki modal oynasini bahoriy (elastic spring) animatsiya bilan ochish
    const innerBox = el.firstElementChild;
    if (innerBox) {
      innerBox.classList.remove('modal-content-pop');
      void innerBox.offsetWidth; // Force CSS reflow
      innerBox.classList.add('modal-content-pop');
    }

    if (typeof playOpenSound === 'function') {
      try { playOpenSound(); } catch (e) {}
    }

    if (typeof push1cNavigation === 'function') {
      let grp = null;
      if (id === 'modal-1c-nomenclature-catalog') grp = (typeof activeNomenclatureCatalogGroup !== 'undefined' ? activeNomenclatureCatalogGroup : 'all');
      if (id === 'modal-1c-suppliers-catalog') grp = (typeof activeSupplierCatalogGroup !== 'undefined' ? activeSupplierCatalogGroup : 'all');
      push1cNavigation({ modalId: id, group: grp });
    }
  }
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) {
    el.classList.add('hidden');
    el.classList.remove('flex');
    const maxBox = el.querySelector('.is-maximized');
    if (maxBox) {
      toggleMaximizeModal(maxBox.id);
    }
  }
}

// 1C oyna o'lchamini kattalashtirish (Развернуть / Восстановить)
function toggleMaximizeModal(boxId) {
  const box = document.getElementById(boxId);
  if (!box) return;
  const isMax = box.classList.contains('is-maximized');
  const iconSuffix = boxId.replace('box-', '');
  const icon = document.getElementById(`icon-max-${iconSuffix}`);

  if (isMax) {
    box.classList.remove('is-maximized', 'fixed', 'inset-0', 'w-screen', 'h-screen', 'rounded-none', 'z-50');
    box.classList.add('w-full', 'h-[95vh]', 'max-w-[98.5vw]', 'rounded-xl');
    if (icon) {
      icon.className = 'fa-regular fa-square';
    }
  } else {
    box.classList.remove('w-full', 'h-[95vh]', 'max-w-[98.5vw]', 'rounded-xl');
    box.classList.add('is-maximized', 'fixed', 'inset-0', 'w-screen', 'h-screen', 'rounded-none', 'z-50');
    if (icon) {
      icon.className = 'fa-solid fa-clone';
    }
  }
}


// 1C "подробно" modali
function openDetailsModal(type) {
  if (!globalDashboardData || !globalDashboardData.details) return;

  const titleEl = document.getElementById('modal-details-title');
  const contentEl = document.getElementById('modal-details-content');

  if (type === 'cash') {
    titleEl.innerText = '1. Kassa qoldiqlari (Подробно)';
    contentEl.innerHTML = (globalDashboardData.details.cash_accounts || []).map(a => `
      <div class="flex justify-between items-center p-3 bg-gray-950 rounded-lg border border-gray-800">
        <div>
          <strong class="text-white text-xs block">${a.name}</strong>
          <span class="text-[10px] text-gray-500 font-mono">${a.account_number || 'KASSA'}</span>
        </div>
        <div class="text-right font-mono font-bold text-teal-400 text-sm">
          ${formatUzs(a.balance)} ${a.currency}
        </div>
      </div>
    `).join('');
  } else if (type === 'bank') {
    titleEl.innerText = '2. Bank hisobraqamlari qoldiqlari (Подробно)';
    contentEl.innerHTML = (globalDashboardData.details.bank_accounts || []).map(a => `
      <div class="flex justify-between items-center p-3 bg-gray-950 rounded-lg border border-gray-800">
        <div>
          <strong class="text-white text-xs block">${a.name}</strong>
          <span class="text-[10px] text-gray-500 font-mono">${a.account_number || ''}</span>
        </div>
        <div class="text-right font-mono font-bold text-rose-400 text-sm">
          ${formatUzs(a.balance)} ${a.currency}
        </div>
      </div>
    `).join('');
  } else if (type === 'customers') {
    titleEl.innerText = '3. Xaridorlar qarzdorligi (Покупатели - Подробно)';
    contentEl.innerHTML = (globalDashboardData.details.customers || []).map(c => `
      <div class="flex justify-between items-center p-3 bg-gray-950 rounded-lg border border-gray-800">
        <div>
          <strong class="text-white text-xs block">${c.name}</strong>
          <span class="text-[10px] text-gray-500">${c.phone || ''}</span>
        </div>
        <div class="text-right font-mono font-bold text-cyan-400 text-sm">
          ${formatUzs(c.balance)} UZS
        </div>
      </div>
    `).join('');
  } else if (type === 'suppliers') {
    titleEl.innerText = '4. Ta\'minotchilar oldidagi qarzimiz (Поставщики - Подробно)';
    contentEl.innerHTML = (globalDashboardData.details.suppliers || []).map(s => `
      <div class="flex justify-between items-center p-3 bg-gray-950 rounded-lg border border-gray-800">
        <div>
          <strong class="text-white text-xs block">${s.name}</strong>
          <span class="text-[10px] text-gray-500">${s.phone || ''}</span>
        </div>
        <div class="text-right font-mono font-bold text-amber-400 text-sm">
          ${formatUzs(s.balance)} UZS
        </div>
      </div>
    `).join('');
  }

  openModal('modal-details');
}

function openPurchaseModal() {
  // 1C uslubidagi avtomatik hujjat raqami DB-XXXXXX
  let maxNum = 15683; // 1C skrinshotidagi bazaviy raqam
  (globalPurchases || []).forEach(d => {
    if (d.doc_number && d.doc_number.startsWith('DB-')) {
      const numPart = parseInt(d.doc_number.replace('DB-', ''), 10);
      if (!isNaN(numPart) && numPart > maxNum) {
        maxNum = numPart;
      }
    }
  });
  const nextNum = `DB-${String(maxNum + 1).padStart(6, '0')}`;
  
  const numInput = document.getElementById('pur-doc-num');
  if (numInput) numInput.value = nextNum;

  const dateInput = document.getElementById('pur-doc-date');
  if (dateInput) {
    const today = new Date().toISOString().split('T')[0];
    dateInput.value = today;
  }

  // Operatsiya turi va kontragentlar
  const opType = document.getElementById('pur-operation-type');
  if (opType) opType.value = 'Поступление от поставщика';
  handlePurchaseOpTypeChange();

  // Ta'minotchi va shartnomani bo'shatish (foydalanuvchi talabiga asosan)
  const cpSearch = document.getElementById('pur-counterparty-search');
  if (cpSearch) cpSearch.value = '';
  const cpInput = document.getElementById('pur-counterparty');
  if (cpInput) cpInput.value = '';
  const contractSelect = document.getElementById('pur-contract');
  if (contractSelect) contractSelect.innerHTML = '<option value="">-- Avval ta\'minotchini tanlang --</option>';
  document.getElementById('pur-contract-info-bar')?.classList.add('hidden');
  closeSupplierDropdown();

  // Valyuta va kursni standart holatga (UZS) keltirish
  const purCurr = document.getElementById('pur-currency');
  if (purCurr) purCurr.value = 'UZS';
  const currText = document.getElementById('pur-currency-text');
  if (currText) currText.innerText = 'UZS (So\'m)';
  const rateWrapper = document.getElementById('pur-rate-wrapper');
  if (rateWrapper) {
    rateWrapper.classList.add('hidden');
    rateWrapper.classList.remove('flex');
  }
  const thPriceCurr = document.getElementById('pur-th-price-curr');
  if (thPriceCurr) thPriceCurr.innerText = 'сум';
  const thTotCurr = document.getElementById('pur-th-total-curr');
  if (thTotCurr) thTotCurr.innerText = 'сум';
  const equivBox = document.getElementById('pur-stat-equiv-box');
  if (equivBox) equivBox.classList.add('hidden');

  populateAccountSelects();

  // Reset 1C tabs to default
  switchPurchaseMainTab('main');
  switchPurTabularTab('stocks');

  // Initialize 1C rows (bo'sh qatordan boshlanadi)
  initDefaultPurchaseRows();

  openModal('modal-purchase');
}

function openSaleModal() {
  document.getElementById('sale-doc-num').value = `SOT-${Date.now().toString().slice(-6)}`;
  openModal('modal-sale');
}

function openProductionModal() {
  document.getElementById('prod-doc-num').value = `PRD-${Date.now().toString().slice(-6)}`;
  previewProductionRecipe();
  openModal('modal-production');
}

function openMoneyOrderModal(type = 'IN') {
  document.getElementById('mo-type').value = type;
  document.getElementById('mo-type-select').value = type;
  document.getElementById('money-order-modal-title').innerHTML = type === 'IN' ? 
    `<i class="fa-solid fa-arrow-down text-emerald-400"></i> Kirim Pul Orderi (ПКО)` : 
    `<i class="fa-solid fa-arrow-up text-rose-400"></i> Chiqim Pul Orderi (РКО)`;
  openModal('modal-money-order');
}

function openItemModal(itemId = null) {
  const form = document.getElementById('item-form');
  if (form) form.reset();
  populateGroupSelects();

  const editIdInput = document.getElementById('item-edit-id');
  const titleEl = document.getElementById('modal-item-title');

  if (itemId) {
    const it = (globalItems || []).find(i => i.id === Number(itemId));
    if (it) {
      if (editIdInput) editIdInput.value = it.id;
      if (titleEl) titleEl.innerHTML = '<i class="fa-solid fa-pen-to-square text-cyan-400"></i> Nomenklaturani Tahrirlash';
      document.getElementById('item-name').value = it.name || '';
      document.getElementById('item-category').value = it.category || 'raw';
      document.getElementById('item-unit').value = it.unit || 'kg';
      document.getElementById('item-stock').value = it.stock_qty !== undefined ? it.stock_qty : (it.stock_quantity || 0);
      document.getElementById('item-cost').value = it.cost_price || 0;
      document.getElementById('item-sale').value = it.sale_price || 0;
      const grpSelect = document.getElementById('item-group');
      if (grpSelect) grpSelect.value = it.group_name || '';
    }
  } else {
    if (editIdInput) editIdInput.value = '';
    if (titleEl) titleEl.innerHTML = '<i class="fa-solid fa-box text-cyan-400"></i> Yangi Nomenklatura Qo\'shish';
    const grpSelect = document.getElementById('item-group');
    if (grpSelect) {
      if (activeNomenclatureCatalogGroup && activeNomenclatureCatalogGroup !== 'all' && activeNomenclatureCatalogGroup !== 'ungrouped') {
        grpSelect.value = activeNomenclatureCatalogGroup;
      } else {
        grpSelect.value = '';
      }
    }
  }

  openModal('modal-item');
}

function editItem(itemId) {
  openItemModal(itemId);
}

// Yangi Nomenklatura qo'shish yoki tahrirlash
async function handleCreateItem(e) {
  e.preventDefault();
  const id = document.getElementById('item-edit-id')?.value;
  const name = document.getElementById('item-name').value.trim();
  const category = document.getElementById('item-category').value;
  const unit = document.getElementById('item-unit').value;
  const stock_qty = Number(document.getElementById('item-stock').value) || 0;
  const cost_price = Number(document.getElementById('item-cost').value) || 0;
  const sale_price = Number(document.getElementById('item-sale').value) || 0;
  const group_name = document.getElementById('item-group')?.value || '';

  if (!name) {
    alert('Iltimos, mahsulot nomini kiriting!');
    return;
  }

  const payload = { name, category, unit, stock_qty, cost_price, sale_price, group_name };
  const url = id ? `/api/items/${id}` : '/api/items';
  const method = id ? 'PUT' : 'POST';

  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await res.json();
    if (result.success) {
      closeModal('modal-item');
      await refreshAllData();
      if (typeof updateNomenclatureCatalogGroupButtons === 'function') {
        updateNomenclatureCatalogGroupButtons();
        renderNomenclatureCatalogTable();
      }
      alert(id ? 'Nomenklatura muvaffaqiyatli tahrirlandi!' : `Yangi nomenklatura ("${name}") muvaffaqiyatli saqlandi!`);
    } else {
      alert('Xatolik: ' + (result.error || 'Saqlashda xatolik yuz berdi'));
    }
  } catch (err) {
    alert('Xato: ' + err.message);
  }
}

function openResetModal() {
  openModal('modal-reset');
}

// Baza reset qilish
async function executeDatabaseReset(mode) {
  const confirmMsg = mode === 'clean_zero' ? 
    'DIQQAT! Barcha operatsiyalar va qoldiqlar 0 qilinadi. Boshlamoqchimisiz?' : 
    '1C boshlang\'ich ko\'rsatkichlarini qayta tiklamoqchimisiz?';

  if (!confirm(confirmMsg)) return;

  try {
    const res = await fetch('/api/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode })
    });
    const result = await res.json();
    if (result.success) {
      closeModal('modal-reset');
      refreshAllData();
      alert(result.message);
    }
  } catch (err) {
    alert('Xato: ' + err.message);
  }
}

// ============================================================================
// 9. MA'LUMOTNOMALAR VA EXCEL IMPORT BOSHQARUVI (Справочники & Excel)
// ============================================================================
let currentCatalogSubTab = 'items'; // 'items' | 'counterparties' | 'accounts'
let catalogItemCategoryFilter = 'all'; // 'all' | 'raw' | 'finished' | 'packaging'
let catalogCpTypeFilter = 'all'; // 'all' | 'customer' | 'supplier'
let catalogSearchText = '';

let excelImportType = 'items'; // 'items' | 'counterparties'
let parsedExcelRows = [];

// Sub-tab almashtirish
function switchCatalogSubTab(subTab) {
  currentCatalogSubTab = subTab;
  
  const tabs = ['items', 'counterparties', 'accounts'];
  tabs.forEach(t => {
    const btn = document.getElementById(`cat-tab-${t}`);
    const content = document.getElementById(`cat-content-${t}`);
    if (btn) {
      if (t === subTab) {
        btn.className = 'px-3.5 py-1.5 rounded-lg bg-emerald-600 text-white transition flex items-center gap-1.5 shadow-sm';
      } else {
        btn.className = 'px-3.5 py-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition flex items-center gap-1.5';
      }
    }
    if (content) {
      if (t === subTab) {
        content.classList.remove('hidden');
      } else {
        content.classList.add('hidden');
      }
    }
  });

  renderCatalogs();
}

// Qidiruv maydoni filtri
function filterCatalogTable() {
  const input = document.getElementById('catalog-search-input');
  catalogSearchText = input ? input.value.trim().toLowerCase() : '';
  renderCatalogs();
}

// Nomenklatura kategoriya filtri
function filterCatalogItemsByCategory(cat) {
  catalogItemCategoryFilter = cat;
  const buttons = document.querySelectorAll('.cat-item-filter');
  buttons.forEach(btn => {
    const onclickAttr = btn.getAttribute('onclick') || '';
    if (onclickAttr.includes(`'${cat}'`)) {
      btn.className = 'cat-item-filter px-3 py-1 rounded-lg bg-emerald-600 text-white text-xs font-semibold shadow-sm';
    } else {
      btn.className = 'cat-item-filter px-3 py-1 rounded-lg bg-gray-900 text-gray-400 text-xs font-semibold border border-gray-800 hover:text-white';
    }
  });
  renderCatalogItems();
}

// Kontragent turi filtri
function filterCatalogCpByType(type) {
  catalogCpTypeFilter = type;
  const buttons = document.querySelectorAll('.cat-cp-filter');
  buttons.forEach(btn => {
    const onclickAttr = btn.getAttribute('onclick') || '';
    if (onclickAttr.includes(`'${type}'`)) {
      btn.className = 'cat-cp-filter px-3 py-1 rounded-lg bg-blue-600 text-white text-xs font-semibold shadow-sm';
    } else {
      btn.className = 'cat-cp-filter px-3 py-1 rounded-lg bg-gray-900 text-gray-400 text-xs font-semibold border border-gray-800 hover:text-white';
    }
  });
  renderCatalogCounterparties();
}

// Asosiy render boshqaruvchisi
function renderCatalogs() {
  if (currentCatalogSubTab === 'items') {
    renderCatalogItems();
  } else if (currentCatalogSubTab === 'counterparties') {
    renderCatalogCounterparties();
  } else if (currentCatalogSubTab === 'accounts') {
    renderCatalogAccounts();
  }
}

// 1. Nomenklatura jadvalini chizish
function renderCatalogItems() {
  const tbody = document.getElementById('catalog-items-table-body');
  if (!tbody) return;

  let list = globalItems || [];

  if (catalogItemCategoryFilter !== 'all') {
    list = list.filter(it => it.category === catalogItemCategoryFilter);
  }

  if (catalogSearchText) {
    list = list.filter(it => 
      (it.name && it.name.toLowerCase().includes(catalogSearchText)) ||
      (it.category && it.category.toLowerCase().includes(catalogSearchText)) ||
      (it.unit && it.unit.toLowerCase().includes(catalogSearchText))
    );
  }

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="px-4 py-8 text-center text-gray-500">Hech qanday nomenklatura topilmadi. Yangi qo'shing yoki Exceldan yuklang.</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map((it, idx) => {
    let catBadge = '';
    if (it.category === 'raw') catBadge = '<span class="px-2 py-0.5 rounded text-[11px] bg-emerald-950 text-emerald-400 border border-emerald-800/60 font-semibold">Xomashyo</span>';
    else if (it.category === 'finished') catBadge = '<span class="px-2 py-0.5 rounded text-[11px] bg-blue-950 text-blue-400 border border-blue-800/60 font-semibold">Tayyor Mahsulot</span>';
    else if (it.category === 'packaging') catBadge = '<span class="px-2 py-0.5 rounded text-[11px] bg-amber-950 text-amber-400 border border-amber-800/60 font-semibold">Qadoqlash</span>';
    else catBadge = `<span class="px-2 py-0.5 rounded text-[11px] bg-gray-800 text-gray-300 font-semibold">${it.category || '-'}</span>`;

    return `
      <tr class="hover:bg-gray-800/50 transition">
        <td class="px-4 py-2.5 font-mono text-gray-500">${idx + 1}</td>
        <td class="px-4 py-2.5 font-bold text-white flex items-center gap-2">
          <i class="fa-solid fa-cube text-gray-500 text-xs"></i>
          ${it.name}
        </td>
        <td class="px-4 py-2.5">${catBadge}</td>
        <td class="px-4 py-2.5 font-mono text-gray-400">${it.unit}</td>
        <td class="px-4 py-2.5 text-right font-mono font-bold ${it.stock_qty <= 0 ? 'text-gray-500' : 'text-emerald-400'}">
          ${Number(it.stock_qty).toLocaleString()} ${it.unit}
        </td>
        <td class="px-4 py-2.5 text-right font-mono text-gray-300">${formatUzs(it.cost_price)}</td>
        <td class="px-4 py-2.5 text-right font-mono font-bold text-emerald-300">${formatUzs(it.sale_price)}</td>
        <td class="px-4 py-2.5 text-center">
          <button onclick="deleteCatalogItem(${it.id})" class="p-1 text-gray-500 hover:text-red-400 transition" title="O'chirish">
            <i class="fa-solid fa-trash-can"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

// Nomenklaturani o'chirish
async function deleteCatalogItem(id) {
  if (!confirm('Haqiqatan ham ushbu nomenklaturani o\'chirmoqchimisiz?')) return;
  try {
    const res = await fetch(`/api/items/${id}`, { method: 'DELETE' });
    const result = await res.json();
    if (result.success) {
      refreshAllData();
    } else {
      alert('Xato: ' + (result.error || 'O\'chirishda xatolik yuz berdi'));
    }
  } catch (err) {
    alert('Xato: ' + err.message);
  }
}

// 2. Kontragentlar jadvalini chizish
function renderCatalogCounterparties() {
  const tbody = document.getElementById('catalog-cp-table-body');
  if (!tbody) return;

  let list = globalCounterparties || [];

  if (catalogCpTypeFilter !== 'all') {
    list = list.filter(cp => cp.type === catalogCpTypeFilter || cp.type === 'both');
  }

  if (catalogSearchText) {
    list = list.filter(cp => 
      (cp.name && cp.name.toLowerCase().includes(catalogSearchText)) ||
      (cp.phone && cp.phone.toLowerCase().includes(catalogSearchText)) ||
      (cp.address && cp.address.toLowerCase().includes(catalogSearchText)) ||
      (cp.inn && cp.inn.toLowerCase().includes(catalogSearchText))
    );
  }

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="px-4 py-8 text-center text-gray-500">Hech qanday kontragent topilmadi. Yangi qo'shing yoki Exceldan yuklang.</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map((cp, idx) => {
    let typeBadge = '';
    if (cp.type === 'customer') {
      typeBadge = '<span class="px-2 py-0.5 rounded text-[11px] bg-blue-950 text-blue-400 border border-blue-800/60 font-semibold">Xaridor (Mijoz)</span>';
    } else if (cp.type === 'supplier') {
      typeBadge = '<span class="px-2 py-0.5 rounded text-[11px] bg-emerald-950 text-emerald-400 border border-emerald-800/60 font-semibold">Ta\'minotchi</span>';
    } else {
      typeBadge = '<span class="px-2 py-0.5 rounded text-[11px] bg-purple-950 text-purple-400 border border-purple-800/60 font-semibold">Har ikkisi</span>';
    }

    const bal = Number(cp.balance) || 0;
    let balHtml = '';
    if (bal > 0) {
      balHtml = `<span class="text-emerald-400 font-bold">+${formatUzs(bal)} UZS <span class="text-[10px] text-emerald-500 font-normal">(haqdor)</span></span>`;
    } else if (bal < 0) {
      balHtml = `<span class="text-rose-400 font-bold">${formatUzs(bal)} UZS <span class="text-[10px] text-rose-500 font-normal">(qarz)</span></span>`;
    } else {
      balHtml = `<span class="text-gray-400 font-mono">0,00 UZS</span>`;
    }

    return `
      <tr class="hover:bg-gray-800/50 transition">
        <td class="px-4 py-2.5 font-mono text-gray-500">${idx + 1}</td>
        <td class="px-4 py-2.5 font-bold text-white flex items-center gap-2">
          <i class="fa-solid fa-building text-gray-500 text-xs"></i>
          ${cp.name}
          ${cp.inn ? `<span class="text-[10px] text-gray-500 font-mono">(${cp.inn})</span>` : ''}
        </td>
        <td class="px-4 py-2.5">${typeBadge}</td>
        <td class="px-4 py-2.5 font-mono text-gray-400">${cp.phone || '-'}</td>
        <td class="px-4 py-2.5 text-gray-400">${cp.address || '-'}</td>
        <td class="px-4 py-2.5 text-right font-mono">${balHtml}</td>
        <td class="px-4 py-2.5 text-center">
          <div class="flex items-center justify-center gap-1.5">
            <button onclick="openCounterpartyModal(${cp.id})" class="p-1 text-gray-400 hover:text-blue-400 transition" title="Tahrirlash">
              <i class="fa-solid fa-pen-to-square"></i>
            </button>
            <button onclick="deleteCounterparty(${cp.id})" class="p-1 text-gray-400 hover:text-red-400 transition" title="O'chirish">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// Kontragent modalini ochish (yangi yoki tahrirlash)
function openCounterpartyModal(idOrType = null) {
  const form = document.getElementById('cp-form');
  if (form) form.reset();
  populateGroupSelects();

  const editIdInput = document.getElementById('cp-edit-id');
  const titleEl = document.getElementById('modal-cp-title');

  let id = null;
  let defType = 'customer';
  if (typeof idOrType === 'number' || (typeof idOrType === 'string' && !isNaN(Number(idOrType)) && Number(idOrType) > 0)) {
    id = Number(idOrType);
  } else if (typeof idOrType === 'string') {
    defType = idOrType;
  }

  if (id) {
    const cp = (globalCounterparties || []).find(c => c.id === id);
    if (cp) {
      if (editIdInput) editIdInput.value = cp.id;
      if (titleEl) titleEl.innerHTML = '<i class="fa-solid fa-pen-to-square text-blue-400"></i> Kontragentni Tahrirlash';
      document.getElementById('cp-name').value = cp.name || '';
      document.getElementById('cp-type').value = cp.type || 'customer';
      document.getElementById('cp-phone').value = cp.phone || '';
      document.getElementById('cp-address').value = cp.address || '';
      document.getElementById('cp-inn').value = cp.inn || '';
      document.getElementById('cp-balance').value = cp.balance || 0;
      const grpSelect = document.getElementById('cp-group');
      if (grpSelect) grpSelect.value = cp.group_name || cp.category_group || '';
    }
  } else {
    if (editIdInput) editIdInput.value = '';
    if (titleEl) titleEl.innerHTML = '<i class="fa-solid fa-user-plus text-blue-400"></i> Yangi Kontragent Qo\'shish';
    document.getElementById('cp-type').value = defType;
    document.getElementById('cp-balance').value = 0;
    const grpSelect = document.getElementById('cp-group');
    if (grpSelect) {
      if (activeSupplierCatalogGroup && activeSupplierCatalogGroup !== 'all' && activeSupplierCatalogGroup !== 'ungrouped') {
        grpSelect.value = activeSupplierCatalogGroup;
      } else {
        grpSelect.value = '';
      }
    }
  }

  openModal('modal-counterparty');
}

// Kontragentni saqlash (POST yoki PUT)
async function handleSaveCounterparty(e) {
  e.preventDefault();
  const id = document.getElementById('cp-edit-id').value;
  const name = document.getElementById('cp-name').value.trim();
  const type = document.getElementById('cp-type').value;
  const phone = document.getElementById('cp-phone').value.trim();
  const address = document.getElementById('cp-address').value.trim();
  const inn = document.getElementById('cp-inn').value.trim();
  const balance = Number(document.getElementById('cp-balance').value) || 0;
  const group_name = document.getElementById('cp-group')?.value || '';

  if (!name) {
    alert('Iltimos, kontragent nomini kiriting!');
    return;
  }

  const payload = { name, type, phone, address, inn, balance, group_name, category_group: group_name };
  const url = id ? `/api/counterparties/${id}` : '/api/counterparties';
  const method = id ? 'PUT' : 'POST';

  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await res.json();
    if (result.success) {
      closeModal('modal-counterparty');
      await refreshAllData();
      if (typeof updateSupplierCatalogGroupButtons === 'function') {
        updateSupplierCatalogGroupButtons();
        renderSuppliersCatalogTable();
      }
      alert(id ? 'Kontragent ma\'lumotlari yangilandi!' : 'Yangi kontragent muvaffaqiyatli saqlandi!');
    } else {
      alert('Xato: ' + (result.error || 'Saqlashda xatolik yuz berdi'));
    }
  } catch (err) {
    alert('Server bilan bog\'lanishda xato: ' + err.message);
  }
}

// Kontragentni o'chirish
async function deleteCounterparty(id) {
  if (!confirm('Haqiqatan ham ushbu kontragentni o\'chirmoqchimisiz?')) return;
  try {
    const res = await fetch(`/api/counterparties/${id}`, { method: 'DELETE' });
    const result = await res.json();
    if (result.success) {
      refreshAllData();
    } else {
      alert('Xato: ' + (result.error || 'O\'chirishda xatolik yuz berdi'));
    }
  } catch (err) {
    alert('Xato: ' + err.message);
  }
}

// 3. Kassa va Bank hisoblari jadvalini chizish
function renderCatalogAccounts() {
  const tbody = document.getElementById('catalog-accounts-table-body');
  if (!tbody) return;

  let list = globalAccounts || [];

  if (catalogSearchText) {
    list = list.filter(acc => 
      (acc.name && acc.name.toLowerCase().includes(catalogSearchText)) ||
      (acc.account_number && acc.account_number.toLowerCase().includes(catalogSearchText)) ||
      (acc.currency && acc.currency.toLowerCase().includes(catalogSearchText))
    );
  }

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="px-4 py-8 text-center text-gray-500">Hech qanday hisob topilmadi.</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map((acc, idx) => {
    const isCash = acc.type === 'cash';
    const typeBadge = isCash ? 
      '<span class="px-2 py-0.5 rounded text-[11px] bg-emerald-950 text-emerald-400 border border-emerald-800/60 font-semibold flex items-center gap-1 w-fit"><i class="fa-solid fa-money-bill-wave"></i> Naqd Kassa</span>' : 
      '<span class="px-2 py-0.5 rounded text-[11px] bg-blue-950 text-blue-400 border border-blue-800/60 font-semibold flex items-center gap-1 w-fit"><i class="fa-solid fa-building-columns"></i> Bank Hisobi</span>';

    return `
      <tr class="hover:bg-gray-800/50 transition">
        <td class="px-4 py-2.5 font-mono text-gray-500">${idx + 1}</td>
        <td class="px-4 py-2.5 font-bold text-white flex items-center gap-2">
          <i class="fa-solid ${isCash ? 'fa-vault text-emerald-400' : 'fa-landmark text-blue-400'} text-xs"></i>
          ${acc.name}
        </td>
        <td class="px-4 py-2.5">${typeBadge}</td>
        <td class="px-4 py-2.5 font-mono font-bold text-amber-400">${acc.currency}</td>
        <td class="px-4 py-2.5 font-mono text-gray-400">${acc.account_number || '-'}</td>
        <td class="px-4 py-2.5 text-right font-mono font-bold text-white">
          ${formatUzs(acc.balance)} <span class="text-xs text-gray-400 font-normal">${acc.currency}</span>
        </td>
        <td class="px-4 py-2.5 text-center">
          <div class="flex items-center justify-center gap-1.5">
            <button onclick="openAccountModal(${acc.id})" class="p-1 text-gray-400 hover:text-amber-400 transition" title="Tahrirlash">
              <i class="fa-solid fa-pen-to-square"></i>
            </button>
            <button onclick="deleteAccount(${acc.id})" class="p-1 text-gray-400 hover:text-red-400 transition" title="O'chirish">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// Kassa/Bank hisobi modalini ochish
function openAccountModal(id = null) {
  const form = document.getElementById('acc-form');
  if (form) form.reset();

  const editIdInput = document.getElementById('acc-edit-id');
  const titleEl = document.getElementById('modal-acc-title');

  if (id) {
    const acc = globalAccounts.find(a => a.id === id);
    if (acc) {
      if (editIdInput) editIdInput.value = acc.id;
      if (titleEl) titleEl.innerHTML = '<i class="fa-solid fa-pen-to-square text-amber-400"></i> Hisobni Tahrirlash';
      document.getElementById('acc-name').value = acc.name || '';
      document.getElementById('acc-type').value = acc.type || 'cash';
      document.getElementById('acc-currency').value = acc.currency || 'UZS';
      document.getElementById('acc-number').value = acc.account_number || '';
      document.getElementById('acc-balance').value = acc.balance || 0;
    }
  } else {
    if (editIdInput) editIdInput.value = '';
    if (titleEl) titleEl.innerHTML = '<i class="fa-solid fa-vault text-amber-400"></i> Yangi Kassa yoki Bank Hisobi Qo\'shish';
    document.getElementById('acc-balance').value = 0;
  }

  openModal('modal-account');
}

// Hisobni saqlash (POST yoki PUT)
async function handleSaveAccount(e) {
  e.preventDefault();
  const id = document.getElementById('acc-edit-id').value;
  const name = document.getElementById('acc-name').value.trim();
  const type = document.getElementById('acc-type').value;
  const currency = document.getElementById('acc-currency').value;
  const account_number = document.getElementById('acc-number').value.trim();
  const balance = Number(document.getElementById('acc-balance').value) || 0;

  if (!name) {
    alert('Iltimos, hisob nomini kiriting!');
    return;
  }

  const payload = { name, type, currency, account_number, balance };
  const url = id ? `/api/accounts/${id}` : '/api/accounts';
  const method = id ? 'PUT' : 'POST';

  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await res.json();
    if (result.success) {
      closeModal('modal-account');
      refreshAllData();
      alert(id ? 'Hisob ma\'lumotlari muvaffaqiyatli yangilandi!' : 'Yangi hisob muvaffaqiyatli qo\'shildi!');
    } else {
      alert('Xato: ' + (result.error || 'Saqlashda xatolik yuz berdi'));
    }
  } catch (err) {
    alert('Server bilan bog\'lanishda xato: ' + err.message);
  }
}

// Hisobni o'chirish
async function deleteAccount(id) {
  if (!confirm('Haqiqatan ham ushbu hisobni o\'chirmoqchimisiz?')) return;
  try {
    const res = await fetch(`/api/accounts/${id}`, { method: 'DELETE' });
    const result = await res.json();
    if (result.success) {
      refreshAllData();
    } else {
      alert('Xato: ' + (result.error || 'O\'chirishda xatolik yuz berdi'));
    }
  } catch (err) {
    alert('Xato: ' + err.message);
  }
}

// ============================================================================
// 10. EXCEL EXPORT VA IMPORT (SheetJS orqali)
// ============================================================================

// Excel Import oynasini ochish
function openExcelImportModal() {
  parsedExcelRows = [];
  const fileInput = document.getElementById('excel-file-input');
  if (fileInput) fileInput.value = '';
  
  const previewWrapper = document.getElementById('excel-preview-wrapper');
  if (previewWrapper) previewWrapper.classList.add('hidden');

  const btnSave = document.getElementById('btn-save-excel');
  if (btnSave) btnSave.disabled = true;

  const statusMsg = document.getElementById('excel-status-msg');
  if (statusMsg) statusMsg.innerText = '';

  handleImportTypeChange();
  openModal('modal-excel-import');
}

// Import turi o'zgarganda (Mahsulotlar yoki Kontragentlar)
function handleImportTypeChange() {
  const radioItems = document.querySelector('input[name="import-type"][value="items"]');
  excelImportType = (radioItems && radioItems.checked) ? 'items' : 'counterparties';
  
  const label = document.getElementById('template-btn-label');
  if (label) {
    label.innerText = excelImportType === 'items' ? 
      'Nomenklatura Namuna Excelini Olish' : 
      'Kontragentlar Namuna Excelini Olish';
  }

  // Tozalash
  parsedExcelRows = [];
  const previewWrapper = document.getElementById('excel-preview-wrapper');
  if (previewWrapper) previewWrapper.classList.add('hidden');
  const btnSave = document.getElementById('btn-save-excel');
  if (btnSave) btnSave.disabled = true;
  const statusMsg = document.getElementById('excel-status-msg');
  if (statusMsg) statusMsg.innerText = '';
}

// Namuna Excel shablonini generatsiya qilish va yuklab berish
function downloadExcelTemplate() {
  if (typeof XLSX === 'undefined') {
    alert('Excel moduli (SheetJS) yuklanmadi. Internet aloqasini tekshiring.');
    return;
  }

  if (excelImportType === 'items') {
    const sampleItems = [
      {
        "Nomi": "Mol go'shti (lahm)",
        "Guruhi": "Xomashyo",
        "Birligi": "kg",
        "Qoldiq": 0,
        "Tannarxi": 85000,
        "SotishNarxi": 0
      },
      {
        "Nomi": "Qo'y yog'i (dumba)",
        "Guruhi": "Xomashyo",
        "Birligi": "kg",
        "Qoldiq": 0,
        "Tannarxi": 60000,
        "SotishNarxi": 0
      },
      {
        "Nomi": "Mol go'shti qiyma (Premium)",
        "Guruhi": "Tayyor Mahsulot",
        "Birligi": "kg",
        "Qoldiq": 0,
        "Tannarxi": 0,
        "SotishNarxi": 95000
      },
      {
        "Nomi": "Ovchilar kolbasasi dudlangan",
        "Guruhi": "Tayyor Mahsulot",
        "Birligi": "kg",
        "Qoldiq": 0,
        "Tannarxi": 0,
        "SotishNarxi": 110000
      },
      {
        "Nomi": "Vakuumpaket 1kg",
        "Guruhi": "Qadoqlash",
        "Birligi": "dona",
        "Qoldiq": 0,
        "Tannarxi": 800,
        "SotishNarxi": 0
      }
    ];

    const ws = XLSX.utils.json_to_sheet(sampleItems);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Nomenklatura");
    XLSX.writeFile(wb, "Nomenklatura_Shablon_MeatCity.xlsx");
  } else {
    const sampleCp = [
      {
        "Nomi": "Agro Go'sht Ta'minot MCHJ",
        "Turi": "Ta'minotchi",
        "Telefon": "+998 90 123 45 67",
        "Manzil": "Toshkent vil., Zangiota t.",
        "STIR": "301234567",
        "BoshlangichQarz": 0
      },
      {
        "Nomi": "Chilonzor Go'sht Bozori 14-do'kon",
        "Turi": "Xaridor",
        "Telefon": "+998 91 234 56 78",
        "Manzil": "Toshkent sh., Chilonzor",
        "STIR": "302345678",
        "BoshlangichQarz": 0
      },
      {
        "Nomi": "Premium Supermarketlar Tarmog'i",
        "Turi": "Xaridor",
        "Telefon": "+998 93 345 67 89",
        "Manzil": "Toshkent sh., Mirzo Ulug'bek",
        "STIR": "303456789",
        "BoshlangichQarz": 0
      }
    ];

    const ws = XLSX.utils.json_to_sheet(sampleCp);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Kontragentlar");
    XLSX.writeFile(wb, "Kontragentlar_Shablon_MeatCity.xlsx");
  }
}

// Foydalanuvchi Excel yuklaganda o'qish va tahlil qilish
function handleExcelFileUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const rawRows = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

      if (!rawRows || rawRows.length === 0) {
        alert('Excel fayl bo\'sh yoki unda ma\'lumot topilmadi.');
        return;
      }

      parsedExcelRows = [];

      if (excelImportType === 'items') {
        // Nomenklatura ma'lumotlarini normalizatsiya qilish
        rawRows.forEach(row => {
          const name = String(row['Nomi'] || row['nomi'] || row['Name'] || row['Товар'] || row['Наименование'] || row['Mahsulot'] || '').trim();
          if (!name) return; // Nomsiz qatorlarni tashlab ketish

          let rawCat = String(row['Guruhi'] || row['guruhi'] || row['Категория'] || row['Category'] || '').toLowerCase().trim();
          let category = 'raw';
          if (rawCat.includes('tayyor') || rawCat.includes('готовая') || rawCat.includes('finished')) {
            category = 'finished';
          } else if (rawCat.includes('qadoq') || rawCat.includes('упаковк') || rawCat.includes('packaging')) {
            category = 'packaging';
          }

          const unit = String(row['Birligi'] || row['birligi'] || row['Ед.изм.'] || row['Unit'] || 'kg').trim();
          const stock_qty = Number(row['Qoldiq'] || row['qoldiq'] || row['Остаток'] || row['Stock'] || 0) || 0;
          const cost_price = Number(row['Tannarxi'] || row['tannarxi'] || row['Себестоимость'] || row['Cost'] || 0) || 0;
          const sale_price = Number(row['SotishNarxi'] || row['sotishnarxi'] || row['Цена продажи'] || row['Sale'] || 0) || 0;

          parsedExcelRows.push({ name, category, unit, stock_qty, cost_price, sale_price });
        });
      } else {
        // Kontragentlar ma'lumotlarini normalizatsiya qilish
        rawRows.forEach(row => {
          const name = String(row['Nomi'] || row['nomi'] || row['Name'] || row['Контрагент'] || row['Наименование'] || row['Mijoz'] || '').trim();
          if (!name) return;

          let rawType = String(row['Turi'] || row['turi'] || row['Тип'] || row['Type'] || '').toLowerCase().trim();
          let type = 'customer';
          if (rawType.includes('ta\'min') || rawType.includes('поставщ') || rawType.includes('supplier')) {
            type = 'supplier';
          } else if (rawType.includes('ikkalasi') || rawType.includes('both') || rawType.includes('оба')) {
            type = 'both';
          }

          const phone = String(row['Telefon'] || row['telefon'] || row['Телефон'] || row['Phone'] || '').trim();
          const address = String(row['Manzil'] || row['manzil'] || row['Адрес'] || row['Address'] || '').trim();
          const inn = String(row['STIR'] || row['stir'] || row['ИНН'] || row['INN'] || '').trim();
          const balance = Number(row['BoshlangichQarz'] || row['boshlangichqarz'] || row['Баланс'] || row['Qarz'] || 0) || 0;

          parsedExcelRows.push({ name, type, phone, address, inn, balance });
        });
      }

      if (parsedExcelRows.length === 0) {
        alert('Fayldan mos ustunlar (Nomi, Guruhi va h.k.) topilmadi. Iltimos namunaviy shablonni ko\'rib chiqing.');
        return;
      }

      // Preview jadvalini ko'rsatish
      renderExcelPreview();

    } catch (err) {
      alert('Excel faylni o\'qishda xato: ' + err.message);
    }
  };

  reader.readAsArrayBuffer(file);
}

// Excel preview jadvalini chizish
function renderExcelPreview() {
  const thead = document.getElementById('excel-preview-thead');
  const tbody = document.getElementById('excel-preview-tbody');
  const countBadge = document.getElementById('excel-row-count-badge');
  const btnSave = document.getElementById('btn-save-excel');
  const previewWrapper = document.getElementById('excel-preview-wrapper');
  const statusMsg = document.getElementById('excel-status-msg');

  if (countBadge) countBadge.innerText = `${parsedExcelRows.length} ta yozuv`;
  if (btnSave) btnSave.disabled = false;
  if (previewWrapper) previewWrapper.classList.remove('hidden');
  if (statusMsg) statusMsg.innerText = `Exceldan ${parsedExcelRows.length} ta yozuv muvaffaqiyatli tanib olindi. Saqlash tugmasini bosing.`;

  if (excelImportType === 'items') {
    thead.innerHTML = `
      <tr>
        <th class="px-3 py-2">№</th>
        <th class="px-3 py-2">Nomi</th>
        <th class="px-3 py-2">Guruhi</th>
        <th class="px-3 py-2">Birligi</th>
        <th class="px-3 py-2 text-right">Boshl. Qoldiq</th>
        <th class="px-3 py-2 text-right">Tannarxi</th>
        <th class="px-3 py-2 text-right">Sotish Narxi</th>
      </tr>
    `;

    tbody.innerHTML = parsedExcelRows.slice(0, 50).map((r, i) => `
      <tr class="hover:bg-gray-900">
        <td class="px-3 py-1.5 font-mono text-gray-500">${i + 1}</td>
        <td class="px-3 py-1.5 font-bold text-white">${r.name}</td>
        <td class="px-3 py-1.5 text-emerald-400">${r.category}</td>
        <td class="px-3 py-1.5 text-gray-300 font-mono">${r.unit}</td>
        <td class="px-3 py-1.5 text-right font-mono text-gray-300">${r.stock_qty}</td>
        <td class="px-3 py-1.5 text-right font-mono text-gray-300">${formatUzs(r.cost_price)}</td>
        <td class="px-3 py-1.5 text-right font-mono text-emerald-400">${formatUzs(r.sale_price)}</td>
      </tr>
    `).join('') + (parsedExcelRows.length > 50 ? `<tr><td colspan="7" class="px-3 py-2 text-center text-gray-500 italic">... va yana ${parsedExcelRows.length - 50} ta yozuv</td></tr>` : '');

  } else {
    thead.innerHTML = `
      <tr>
        <th class="px-3 py-2">№</th>
        <th class="px-3 py-2">Nomi</th>
        <th class="px-3 py-2">Turi</th>
        <th class="px-3 py-2">Telefon</th>
        <th class="px-3 py-2">Manzil</th>
        <th class="px-3 py-2 text-right">Boshl. Qarz</th>
      </tr>
    `;

    tbody.innerHTML = parsedExcelRows.slice(0, 50).map((r, i) => `
      <tr class="hover:bg-gray-900">
        <td class="px-3 py-1.5 font-mono text-gray-500">${i + 1}</td>
        <td class="px-3 py-1.5 font-bold text-white">${r.name}</td>
        <td class="px-3 py-1.5 text-blue-400">${r.type}</td>
        <td class="px-3 py-1.5 text-gray-300 font-mono">${r.phone || '-'}</td>
        <td class="px-3 py-1.5 text-gray-400">${r.address || '-'}</td>
        <td class="px-3 py-1.5 text-right font-mono text-gray-300">${formatUzs(r.balance)}</td>
      </tr>
    `).join('') + (parsedExcelRows.length > 50 ? `<tr><td colspan="6" class="px-3 py-2 text-center text-gray-500 italic">... va yana ${parsedExcelRows.length - 50} ta yozuv</td></tr>` : '');
  }
}

// Tasdiqlab bazaga yozish (Bulk POST)
async function confirmExcelImport() {
  if (!parsedExcelRows || parsedExcelRows.length === 0) {
    alert('Import qilish uchun ma\'lumot mavjud emas.');
    return;
  }

  const btnSave = document.getElementById('btn-save-excel');
  if (btnSave) {
    btnSave.disabled = true;
    btnSave.innerText = 'Saqlanmoqda...';
  }

  try {
    const url = excelImportType === 'items' ? '/api/items/bulk' : '/api/counterparties/bulk';
    const payload = excelImportType === 'items' ? { items: parsedExcelRows } : { counterparties: parsedExcelRows };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const result = await res.json();
    if (result.success) {
      closeModal('modal-excel-import');
      await refreshAllData();
      alert(`🎉 Muvaffaqiyatli! ${result.count || parsedExcelRows.length} ta yozuv bazaga kiritildi.`);
    } else {
      alert('Xato: ' + (result.error || 'Ma\'lumotlarni saqlashda xatolik'));
    }
  } catch (err) {
    alert('Serverga yuborishda xatolik: ' + err.message);
  } finally {
    if (btnSave) {
      btnSave.disabled = false;
      btnSave.innerText = '✅ Bazaga Saqlash';
    }
  }
}

// ============================================================================
// 11. 1C:ERP "XARIDLAR VA OMBOR" (ЗАКУПКИ) QO'SHIMCHA HARAKATLAR BOSHQARUVI
// ============================================================================

let is1cPanelVisible = true;

function toggle1cPanel() {
  const panel = document.getElementById('panel-1c-purchases');
  const label = document.getElementById('label-toggle-1c-panel');
  if (!panel) return;

  is1cPanelVisible = !is1cPanelVisible;
  if (is1cPanelVisible) {
    panel.classList.remove('hidden');
    if (label) label.innerText = '1C Panelini Yashirish';
  } else {
    panel.classList.add('hidden');
    if (label) label.innerText = '1C Panelini Ko\'rsatish';
  }
}

// 1C Kirim yuk xatlari (Приходные накладные) alohida jurnali oynasini ochish
function openPurchasesJournal() {
  renderPurchasesTable();
  openModal('modal-purchases-journal');
}

// ----------------------------------------------------------------------------
// 1C: "СПРАВОЧНИК: ПОСТАВЩИКИ" (TA'MINOTCHILAR GURUHLARI VA RO'YXATI)
// ----------------------------------------------------------------------------
let activeSupplierCatalogGroup = 'all';
let selectedSupplierCatalogId = null;
let catalogSuppliersContractsMap = {};

async function openSuppliers1cCatalog(selectGroupId = 'all') {
  activeSupplierCatalogGroup = selectGroupId;
  selectedSupplierCatalogId = null;
  const searchInput = document.getElementById('sup-catalog-search');
  if (searchInput) searchInput.value = '';

  await fetchCatalogGroups();

  try {
    const res = await fetch('/api/contracts');
    const data = await res.json();
    if (data.success) {
      catalogSuppliersContractsMap = {};
      (data.data || []).forEach(c => {
        if (!catalogSuppliersContractsMap[c.counterparty_id]) {
          catalogSuppliersContractsMap[c.counterparty_id] = [];
        }
        catalogSuppliersContractsMap[c.counterparty_id].push(c);
      });
    }
  } catch (e) {
    console.warn('Contracts yuklashda xato:', e);
  }

  updateSupplierCatalogGroupButtons();
  renderSuppliersCatalogTable();

  // Breadcrumb bar
  const breadcrumbBar = document.getElementById('sup-catalog-breadcrumb-bar');
  const groupLabel = document.getElementById('sup-catalog-current-group-label');
  if (breadcrumbBar) {
    if (selectGroupId === 'all') {
      breadcrumbBar.classList.add('hidden');
      breadcrumbBar.classList.remove('flex');
    } else {
      breadcrumbBar.classList.remove('hidden');
      breadcrumbBar.classList.add('flex');
      if (groupLabel) {
        groupLabel.textContent = selectGroupId === 'ungrouped' ? 'Guruhsiz' : selectGroupId;
      }
    }
  }

  openModal('modal-1c-suppliers-catalog');
  push1cNavigation({ modalId: 'modal-1c-suppliers-catalog', group: selectGroupId });
}

function selectSupplierCatalogGroup(groupKey, recordHistory = true) {
  activeSupplierCatalogGroup = groupKey;
  updateSupplierCatalogGroupButtons();
  renderSuppliersCatalogTable();

  // Breadcrumb bar yangilash
  const breadcrumbBar = document.getElementById('sup-catalog-breadcrumb-bar');
  const groupLabel = document.getElementById('sup-catalog-current-group-label');
  if (breadcrumbBar) {
    if (groupKey === 'all') {
      breadcrumbBar.classList.add('hidden');
      breadcrumbBar.classList.remove('flex');
    } else {
      breadcrumbBar.classList.remove('hidden');
      breadcrumbBar.classList.add('flex');
      if (groupLabel) {
        groupLabel.textContent = groupKey === 'ungrouped' ? 'Guruhsiz' : groupKey;
      }
    }
  }

  if (recordHistory) {
    push1cNavigation({ modalId: 'modal-1c-suppliers-catalog', group: groupKey });
  } else {
    update1cNavButtonsState();
  }
}

function updateSupplierCatalogGroupButtons() {
  const btnAll = document.getElementById('btn-scg-all');
  const dynContainer = document.getElementById('scg-dynamic-list');
  const suppliers = (globalCounterparties || []).filter(c => c.type === 'supplier' || c.type === 'both');

  const totalCount = suppliers.length;
  let ungroupedCount = 0;
  suppliers.forEach(s => {
    if (!s.group_name || !s.group_name.trim()) ungroupedCount++;
  });

  const countAllEl = document.getElementById('scg-count-all');
  if (countAllEl) countAllEl.innerText = totalCount;

  if (btnAll) {
    btnAll.className = activeSupplierCatalogGroup === 'all' ?
      'w-full text-left px-3 py-2 rounded font-semibold bg-amber-100 text-amber-900 border border-amber-300 flex items-center justify-between shadow-xs' :
      'w-full text-left px-3 py-2 rounded text-gray-700 hover:bg-gray-200 flex items-center justify-between';
  }

  if (!dynContainer) return;

  let html = '';

  if (globalSupplierGroups.length === 0) {
    html += `
      <div class="py-5 px-3 text-center text-gray-400 italic text-[11px] bg-gray-50 rounded border border-dashed border-gray-200">
        <i class="fa-regular fa-folder-open text-base mb-1 block text-gray-300"></i>
        Guruhlar hali yaratilmagan.<br/>
        <button type="button" onclick="promptCreateSupplierGroup()" class="mt-2 text-amber-600 hover:text-amber-700 font-bold underline">
          + Guruh yaratish
        </button>
      </div>
    `;
  } else {
    globalSupplierGroups.forEach(g => {
      const gName = g.name.trim();
      const isActive = activeSupplierCatalogGroup.toLowerCase() === gName.toLowerCase();
      const count = suppliers.filter(s => (s.group_name || '').trim().toLowerCase() === gName.toLowerCase()).length;

      html += `
        <div class="group flex items-center justify-between rounded px-3 py-2 cursor-pointer transition ${isActive ? 'bg-amber-100 text-amber-900 border border-amber-300 font-bold' : 'text-gray-700 hover:bg-gray-200 border border-transparent'}" onclick="selectSupplierCatalogGroup(decodeURIComponent('${escapeJs(gName)}'))">
          <span class="flex items-center gap-2 truncate">
            <i class="fa-solid fa-folder text-amber-600"></i> ${escapeHtml(gName)}
          </span>
          <div class="flex items-center gap-1.5">
            <span class="text-[10px] font-mono bg-white px-1.5 py-0.2 rounded border border-gray-200 text-gray-700 font-bold">${count}</span>
            <button type="button" onclick="event.stopPropagation(); deleteCatalogGroupPrompt(${g.id}, decodeURIComponent('${escapeJs(gName)}'), 'supplier')" class="opacity-0 group-hover:opacity-100 hover:text-red-600 hover:bg-red-50 rounded px-1 text-xs text-gray-400 transition" title="Guruhni o'chirish">&times;</button>
          </div>
        </div>
      `;
    });
  }

  if (ungroupedCount > 0) {
    const isUngroupedActive = activeSupplierCatalogGroup === 'ungrouped';
    html += `
      <div class="group flex items-center justify-between rounded px-3 py-2 cursor-pointer transition mt-2 border-t border-gray-200 pt-2 ${isUngroupedActive ? 'bg-amber-100 text-amber-900 border border-amber-300 font-bold' : 'text-gray-500 hover:bg-gray-200 border border-transparent'}" onclick="selectSupplierCatalogGroup('ungrouped')">
        <span class="flex items-center gap-2 truncate italic">
          <i class="fa-regular fa-folder text-gray-400"></i> Guruhsiz (Umumiy)
        </span>
        <span class="text-[10px] font-mono bg-white px-1.5 py-0.2 rounded border border-gray-200 text-gray-700 font-bold">${ungroupedCount}</span>
      </div>
    `;
  }

  dynContainer.innerHTML = html;
}

function filterSuppliersCatalogTable() {
  renderSuppliersCatalogTable();
}

function renderSuppliersCatalogTable() {
  const tbody = document.getElementById('sup-catalog-table-body');
  if (!tbody) return;

  const search = (document.getElementById('sup-catalog-search')?.value || '').trim().toLowerCase();
  const suppliers = (globalCounterparties || []).filter(c => c.type === 'supplier' || c.type === 'both');

  const filtered = suppliers.filter(s => {
    const sGroup = (s.group_name || '').trim();

    if (activeSupplierCatalogGroup === 'all') {
      // all
    } else if (activeSupplierCatalogGroup === 'ungrouped') {
      if (sGroup !== '') return false;
    } else {
      if (sGroup.toLowerCase() !== activeSupplierCatalogGroup.trim().toLowerCase()) return false;
    }

    if (search) {
      const matchName = s.name.toLowerCase().includes(search);
      const matchPhone = (s.phone || '').toLowerCase().includes(search);
      const matchInn = (s.inn || '').toLowerCase().includes(search);
      const matchGrp = sGroup.toLowerCase().includes(search);
      return matchName || matchPhone || matchInn || matchGrp;
    }
    return true;
  });

  let totalDebt = 0;
  filtered.forEach(s => {
    if (s.balance < 0) totalDebt += Math.abs(s.balance);
  });

  const totCountEl = document.getElementById('sup-catalog-total-count');
  if (totCountEl) totCountEl.innerText = `Jami: ${filtered.length} ta ta'minotchi (${activeSupplierCatalogGroup === 'all' ? 'Barcha' : activeSupplierCatalogGroup})`;

  const debtSumEl = document.getElementById('sup-catalog-debt-sum');
  if (debtSumEl) debtSumEl.innerText = `${formatUzs(totalDebt)} сум`;

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="px-4 py-8 text-center text-gray-400 italic">Ushbu guruhda ta'minotchi mavjud emas.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map((s, idx) => {
    const isSelected = selectedSupplierCatalogId === s.id;
    const groupName = s.group_name && s.group_name.trim() ? s.group_name : 'Guruhsiz';
    const groupBadge = s.group_name && s.group_name.trim() ? 'bg-amber-50 text-amber-900 border-amber-200' : 'bg-gray-100 text-gray-500 border-gray-200 italic';

    const contracts = catalogSuppliersContractsMap[s.id] || [];
    let contractDisplay = '<span class="text-gray-400 italic text-[10px]">Shartnoma yo\'q</span>';
    if (contracts.length > 0) {
      contractDisplay = contracts.map(c => 
        `<span class="inline-block px-1.5 py-0.2 rounded text-[10px] font-mono font-bold mr-1 ${c.currency === 'USD' ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'}">
          ${c.currency}${c.currency === 'USD' ? ' ($)' : ''}
        </span>`
      ).join('');
    }

    return `
      <tr onclick="selectSupplierCatalogRow(${s.id})" class="transition border-b border-[#dee2e6] cursor-pointer ${isSelected ? 'bg-[#e8f5e9]' : 'hover:bg-gray-50'}">
        <td class="px-2 py-2 text-center font-mono text-gray-500 border-r border-[#dee2e6]">${idx + 1}</td>
        
        <!-- Guruh nomi -->
        <td class="px-3 py-2 border-r border-[#dee2e6]">
          <span class="px-2 py-0.5 rounded text-[11px] font-semibold border ${groupBadge}">${escapeHtml(groupName)}</span>
        </td>

        <!-- Ta'minotchi nomi -->
        <td class="px-3 py-2 border-r border-[#dee2e6]">
          <div class="font-bold text-[#212529] flex items-center gap-1.5">
            <i class="fa-solid fa-building text-gray-400 text-xs"></i> ${escapeHtml(s.name)}
          </div>
          <div class="text-[10px] text-gray-400">STIR/INN: ${escapeHtml(s.inn || 'Ko\'rsatilmagan')}</div>
        </td>

        <!-- Telefon -->
        <td class="px-3 py-2 border-r border-[#dee2e6] font-mono text-gray-700">${escapeHtml(s.phone || '-')}</td>

        <!-- Shartnomalar -->
        <td class="px-3 py-2 border-r border-[#dee2e6]">
          ${contractDisplay}
        </td>

        <!-- Balans / Qarz -->
        <td class="px-3 py-2 text-right border-r border-[#dee2e6] font-mono font-bold ${s.balance < 0 ? 'text-rose-600' : 'text-emerald-600'}">
          ${formatUzs(Math.abs(s.balance || 0))} ${s.balance < 0 ? '(Qarzimiz)' : ''}
        </td>

        <!-- Amallar -->
        <td class="px-3 py-1.5 text-center space-x-1 whitespace-nowrap">
          <button type="button" onclick="event.stopPropagation(); startPurchaseForSupplier(${s.id})" class="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[11px] font-semibold shadow-2xs" title="Ushbu ta'minotchidan kirim qilish">
            <i class="fa-solid fa-plus text-[10px]"></i> Kirim
          </button>
          <button type="button" onclick="event.stopPropagation(); openNewContractModalForSupplier(${s.id})" class="px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-300 rounded text-[11px] font-semibold" title="Yangi shartnoma tuzish">
            <i class="fa-solid fa-file-contract text-[10px]"></i>
          </button>
          <button type="button" onclick="event.stopPropagation(); editCounterparty(${s.id})" class="px-1.5 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded text-[11px]" title="Tahrirlash">
            <i class="fa-solid fa-pen text-[10px]"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

function selectSupplierCatalogRow(id) {
  selectedSupplierCatalogId = id;
  const s = (globalCounterparties || []).find(c => c.id === id);
  const infoEl = document.getElementById('sup-catalog-selected-info');
  if (infoEl) infoEl.innerText = s ? `Tanlangan: ${s.name}` : '';
  renderSuppliersCatalogTable();
}

function startPurchaseForSupplier(cpId) {
  closeModal('modal-1c-suppliers-catalog');
  openPurchaseModal();
  const s = (globalCounterparties || []).find(c => c.id === cpId);
  if (s) {
    document.getElementById('pur-counterparty-search').value = s.name;
    document.getElementById('pur-counterparty').value = s.id;
    loadSupplierContracts(s.id);
  }
}

function openNewContractModalForSupplier(cpId) {
  const s = (globalCounterparties || []).find(c => c.id === cpId);
  if (!s) return;
  document.getElementById('pur-counterparty').value = s.id;
  document.getElementById('pur-counterparty-search').value = s.name;
  openNewContractModal();
}

async function promptCreateSupplierGroup(prefill = '') {
  const gName = prompt("Yangi ta'minotchilar guruhi nomini kiriting:\n(Masalan: Go'sht, Qadoqlash, Ziravorlar, Transport):", prefill);
  if (!gName || !gName.trim()) return null;
  const trimmed = gName.trim();

  try {
    const res = await fetch('/api/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: trimmed, type: 'supplier' })
    });
    const result = await res.json();
    if (result.success) {
      await fetchCatalogGroups();
      activeSupplierCatalogGroup = trimmed;
      updateSupplierCatalogGroupButtons();
      renderSuppliersCatalogTable();
      alert(`✅ Yangi ta'minotchi guruhi "${trimmed}" bazada muvaffaqiyatli saqlandi!`);
      return trimmed;
    } else {
      alert('Xatolik: ' + (result.error || 'Guruhni saqlashda xatolik yuz berdi'));
    }
  } catch (err) {
    alert('Guruhni saqlashda server xatosi: ' + err.message);
  }
  return null;
}

async function promptCreateSupplierGroupFromCpModal() {
  const name = await promptCreateSupplierGroup();
  if (name) {
    populateGroupSelects();
    const cpGroup = document.getElementById('cp-group');
    if (cpGroup) cpGroup.value = name;
  }
}

async function deleteCatalogGroupPrompt(id, name, type) {
  if (!confirm(`Haqiqatan ham "${name}" guruhini bazadan o'chirmoqchimisiz?`)) return;
  try {
    const res = await fetch(`/api/groups/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      await fetchCatalogGroups();
      if (type === 'supplier') {
        if (activeSupplierCatalogGroup === name) activeSupplierCatalogGroup = 'all';
        updateSupplierCatalogGroupButtons();
        renderSuppliersCatalogTable();
      } else {
        if (activeNomenclatureCatalogGroup === name) activeNomenclatureCatalogGroup = 'all';
        updateNomenclatureCatalogGroupButtons();
        renderNomenclatureCatalogTable();
      }
      alert(`✅ Guruh "${name}" bazadan o'chirildi.`);
    } else {
      alert('Xatolik: ' + data.error);
    }
  } catch(err) {
    alert('O\'chirishda xatolik: ' + err.message);
  }
}

function printSuppliersCatalog() {
  window.print();
}

// ----------------------------------------------------------------------------
// 1C: "СПРАВОЧНИК: НОМЕНКЛАТУРА" (MAHSULOTLAR GURUHLARI VA RO'YXATI)
// ----------------------------------------------------------------------------
let activeNomenclatureCatalogGroup = 'all';
let selectedNomenclatureCatalogId = null;

async function openNomenclature1cCatalog(selectGroupId = 'all') {
  activeNomenclatureCatalogGroup = selectGroupId;
  selectedNomenclatureCatalogId = null;
  const searchInput = document.getElementById('nom-catalog-search');
  if (searchInput) searchInput.value = '';

  await fetchCatalogGroups();

  updateNomenclatureCatalogGroupButtons();
  renderNomenclatureCatalogTable();

  // Breadcrumb bar
  const breadcrumbBar = document.getElementById('nom-catalog-breadcrumb-bar');
  const groupLabel = document.getElementById('nom-catalog-current-group-label');
  if (breadcrumbBar) {
    if (selectGroupId === 'all') {
      breadcrumbBar.classList.add('hidden');
      breadcrumbBar.classList.remove('flex');
    } else {
      breadcrumbBar.classList.remove('hidden');
      breadcrumbBar.classList.add('flex');
      if (groupLabel) {
        groupLabel.textContent = selectGroupId === 'ungrouped' ? 'Guruhsiz' : selectGroupId;
      }
    }
  }

  openModal('modal-1c-nomenclature-catalog');
  push1cNavigation({ modalId: 'modal-1c-nomenclature-catalog', group: selectGroupId });
}

function selectNomenclatureCatalogGroup(groupKey, recordHistory = true) {
  activeNomenclatureCatalogGroup = groupKey;
  updateNomenclatureCatalogGroupButtons();
  renderNomenclatureCatalogTable();

  // Breadcrumb bar yangilash
  const breadcrumbBar = document.getElementById('nom-catalog-breadcrumb-bar');
  const groupLabel = document.getElementById('nom-catalog-current-group-label');
  if (breadcrumbBar) {
    if (groupKey === 'all') {
      breadcrumbBar.classList.add('hidden');
      breadcrumbBar.classList.remove('flex');
    } else {
      breadcrumbBar.classList.remove('hidden');
      breadcrumbBar.classList.add('flex');
      if (groupLabel) {
        groupLabel.textContent = groupKey === 'ungrouped' ? 'Guruhsiz' : groupKey;
      }
    }
  }

  if (recordHistory) {
    push1cNavigation({ modalId: 'modal-1c-nomenclature-catalog', group: groupKey });
  } else {
    update1cNavButtonsState();
  }
}

function updateNomenclatureCatalogGroupButtons() {
  const btnAll = document.getElementById('btn-ncg-all');
  const dynContainer = document.getElementById('ncg-dynamic-list');
  const items = globalItems || [];

  const totalCount = items.length;
  let ungroupedCount = 0;
  items.forEach(it => {
    if (!it.group_name || !it.group_name.trim()) ungroupedCount++;
  });

  const countAllEl = document.getElementById('ncg-count-all');
  if (countAllEl) countAllEl.innerText = totalCount;

  if (btnAll) {
    btnAll.className = activeNomenclatureCatalogGroup === 'all' ?
      'w-full text-left px-3.5 py-2.5 rounded-xl font-bold transition-all duration-200 flex items-center justify-between category-card-kinetic cursor-pointer bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-md shadow-amber-500/25' :
      'w-full text-left px-3.5 py-2.5 rounded-xl font-medium transition-all duration-200 flex items-center justify-between category-card-kinetic cursor-pointer bg-white hover:bg-amber-50/80 text-slate-700 border border-slate-200/80 hover:border-amber-300 shadow-2xs';
  }

  if (!dynContainer) return;

  let html = '';

  if (globalItemGroups.length === 0) {
    html += `
      <div class="py-6 px-3 text-center text-slate-400 italic text-xs bg-slate-50 rounded-xl border border-dashed border-slate-300">
        <i class="fa-regular fa-folder-open text-xl mb-1.5 block text-amber-400/80"></i>
        Tovar guruhlari hali yaratilmagan.<br/>
        <button type="button" onclick="promptCreateNomenclatureGroup()" class="mt-2.5 px-3 py-1 bg-amber-50 hover:bg-amber-100 text-amber-700 font-bold rounded-lg border border-amber-300 text-xs shadow-2xs transition btn-kinetic">
          + Yangi guruh ochish
        </button>
      </div>
    `;
  } else {
    globalItemGroups.forEach(g => {
      const gName = g.name.trim();
      const isActive = activeNomenclatureCatalogGroup.toLowerCase() === gName.toLowerCase();
      const count = items.filter(it => (it.group_name || '').trim().toLowerCase() === gName.toLowerCase()).length;

      html += `
        <div class="group flex items-center justify-between rounded-xl px-3.5 py-2.5 cursor-pointer category-card-kinetic transition-all duration-200 ${isActive ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-md shadow-amber-500/25 font-bold' : 'bg-white hover:bg-amber-50/80 text-slate-700 border border-slate-200/80 hover:border-amber-300 shadow-2xs'}" onclick="selectNomenclatureCatalogGroup(decodeURIComponent('${escapeJs(gName)}'))">
          <span class="flex items-center gap-2.5 truncate">
            <i class="fa-solid ${isActive ? 'fa-folder-open text-amber-100' : 'fa-folder text-amber-500 group-hover:scale-110'} text-sm transition-transform"></i>
            <span class="truncate">${escapeHtml(gName)}</span>
          </span>
          <div class="flex items-center gap-1.5 shrink-0">
            <span class="text-[11px] font-mono px-2 py-0.5 rounded-full font-bold ${isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'}">${count}</span>
            <button type="button" onclick="event.stopPropagation(); deleteCatalogGroupPrompt(${g.id}, decodeURIComponent('${escapeJs(gName)}'), 'item')" class="opacity-0 group-hover:opacity-100 hover:text-red-500 hover:bg-red-50 rounded-md p-1 text-xs text-slate-400 transition" title="Guruhni o'chirish"><i class="fa-regular fa-trash-can text-[11px]"></i></button>
          </div>
        </div>
      `;
    });
  }

  if (ungroupedCount > 0) {
    const isUngroupedActive = activeNomenclatureCatalogGroup === 'ungrouped';
    html += `
      <div class="group flex items-center justify-between rounded-xl px-3.5 py-2.5 cursor-pointer category-card-kinetic transition-all duration-200 mt-2 border-t border-slate-200 pt-2 ${isUngroupedActive ? 'bg-gradient-to-r from-slate-700 to-slate-800 text-white shadow-md shadow-slate-700/25 font-bold' : 'bg-white/80 hover:bg-slate-100 text-slate-500 border border-dashed border-slate-300 shadow-2xs'}" onclick="selectNomenclatureCatalogGroup('ungrouped')">
        <span class="flex items-center gap-2 truncate italic">
          <i class="fa-regular fa-folder text-slate-400"></i> Guruhsiz (Papkaga kirmagan)
        </span>
        <span class="text-[11px] font-mono px-2 py-0.5 rounded-full font-bold ${isUngroupedActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'}">${ungroupedCount}</span>
      </div>
    `;
  }

  dynContainer.innerHTML = html;
}

function filterNomenclatureCatalogTable() {
  renderNomenclatureCatalogTable();
}

function renderNomenclatureCatalogTable() {
  const tbody = document.getElementById('nom-catalog-table-body');
  if (!tbody) return;

  const search = (document.getElementById('nom-catalog-search')?.value || '').trim().toLowerCase();
  const items = globalItems || [];

  const filtered = items.filter(it => {
    const itGroup = (it.group_name || '').trim();

    if (activeNomenclatureCatalogGroup === 'all') {
      // all
    } else if (activeNomenclatureCatalogGroup === 'ungrouped') {
      if (itGroup !== '') return false;
    } else {
      if (itGroup.toLowerCase() !== activeNomenclatureCatalogGroup.trim().toLowerCase()) return false;
    }

    if (search) {
      const matchName = it.name.toLowerCase().includes(search);
      const matchBarcode = (it.barcode || '').toLowerCase().includes(search);
      const matchGrp = itGroup.toLowerCase().includes(search);
      return matchName || matchBarcode || matchGrp;
    }
    return true;
  });

  let totalStockVal = 0;
  filtered.forEach(it => {
    const qty = it.stock_qty !== undefined ? it.stock_qty : (it.stock_quantity || 0);
    totalStockVal += (qty * (it.cost_price || 0));
  });

  const totCountEl = document.getElementById('nom-catalog-total-count');
  if (totCountEl) {
    const grpLabel = activeNomenclatureCatalogGroup === 'all' ? 'Barcha tovarlar' : activeNomenclatureCatalogGroup;
    totCountEl.innerHTML = `<i class="fa-solid fa-boxes-stacked text-amber-400"></i> Jami: ${filtered.length} ta mahsulot <span class="text-amber-300 font-normal">(${escapeHtml(grpLabel)})</span>`;
  }

  const stockSumEl = document.getElementById('nom-catalog-stock-sum');
  if (stockSumEl) stockSumEl.innerText = `${formatUzs(totalStockVal)} сум`;

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="px-4 py-12 text-center text-slate-400 italic bg-slate-50/50"><i class="fa-solid fa-magnifying-glass text-2xl text-slate-300 mb-2 block"></i> Ushbu guruhda mahsulot topilmadi.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map((it, idx) => {
    const isSelected = selectedNomenclatureCatalogId === it.id;
    const groupName = it.group_name && it.group_name.trim() ? it.group_name : 'Guruhsiz';
    const hasGroup = it.group_name && it.group_name.trim();
    const groupBadge = hasGroup 
      ? 'bg-amber-50 text-amber-900 border-amber-200 font-semibold' 
      : 'bg-slate-100 text-slate-500 border-slate-200 italic';

    const stockQty = it.stock_qty !== undefined ? it.stock_qty : (it.stock_quantity || 0);
    const stockTotal = stockQty * (it.cost_price || 0);

    const stockBadge = stockQty > 0 
      ? `<span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-2xs"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span> ${stockQty} ${escapeHtml(it.unit || 'kg')}</span>`
      : `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-rose-50 text-rose-600 border border-rose-200"><span class="w-1.5 h-1.5 rounded-full bg-rose-400"></span> 0 ${escapeHtml(it.unit || 'kg')}</span>`;

    return `
      <tr onclick="selectNomenclatureCatalogRow(${it.id})" class="border-b border-slate-100 cursor-pointer transition-all duration-150 group ${isSelected ? 'selected-row' : 'hover:bg-amber-50/50'}">
        <td class="px-3 py-2.5 text-center font-mono text-slate-500 border-r border-slate-100 text-xs font-semibold">${idx + 1}</td>
        
        <!-- Guruh nomi -->
        <td class="px-3 py-2.5 border-r border-slate-100">
          <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] border ${groupBadge}">
            <i class="fa-solid ${hasGroup ? 'fa-folder text-amber-500' : 'fa-folder-open text-slate-400'} text-[10px]"></i>
            <span class="truncate max-w-[120px]">${escapeHtml(groupName)}</span>
          </span>
        </td>

        <!-- Nomi -->
        <td class="px-4 py-2.5 border-r border-slate-100">
          <div class="font-bold text-slate-900 flex items-center gap-2 group-hover:text-amber-800 transition-colors text-xs">
            <span class="w-6 h-6 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-100 text-[11px]">
              <i class="fa-solid fa-box"></i>
            </span>
            <span class="leading-tight">${escapeHtml(it.name)}</span>
          </div>
          <div class="text-[10px] text-slate-400 font-mono mt-0.5 flex items-center gap-1.5 pl-8">
            <i class="fa-solid fa-barcode text-[9px]"></i>
            <span>${escapeHtml(it.barcode || 'Shtrixkod yo\'q')}</span>
          </div>
        </td>

        <!-- Birlik -->
        <td class="px-2 py-2.5 text-center font-mono font-medium text-slate-700 border-r border-slate-100">
          <span class="px-2 py-0.5 bg-slate-100 rounded text-slate-700 text-[11px] font-bold border border-slate-200/80">${escapeHtml(it.unit || 'kg')}</span>
        </td>

        <!-- Tannarx -->
        <td class="px-3 py-2.5 text-right font-mono border-r border-slate-100">
          <div class="font-bold text-slate-900 text-xs">${formatUzs(it.cost_price || 0)} <span class="text-[10px] text-slate-500 font-normal">so'm</span></div>
          <div class="text-[10px] text-slate-400 font-normal">($ ${((it.cost_price || 0) / 13000).toFixed(2)})</div>
        </td>

        <!-- Sotish narxi -->
        <td class="px-3 py-2.5 text-right font-mono border-r border-slate-100">
          <div class="font-bold text-blue-700 text-xs">${formatUzs(it.sale_price || 0)} <span class="text-[10px] text-blue-400 font-normal">so'm</span></div>
        </td>

        <!-- Qoldiq -->
        <td class="px-3 py-2.5 text-right font-mono border-r border-slate-100">
          ${stockBadge}
        </td>

        <!-- Qoldiq qiymati -->
        <td class="px-3 py-2.5 text-right font-mono font-bold text-slate-900 border-r border-slate-100 text-xs">
          ${formatUzs(stockTotal)} <span class="text-[10px] text-slate-400 font-normal">so'm</span>
        </td>

        <!-- Amallar -->
        <td class="px-3 py-2 text-center space-x-1.5 whitespace-nowrap">
          <button type="button" onclick="event.stopPropagation(); startPurchaseForNomenclature(${it.id})" class="px-2.5 py-1 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-lg text-xs font-bold shadow-2xs hover:shadow-md active:scale-95 transition-all inline-flex items-center gap-1 btn-kinetic" title="Ushbu tovardan yangi kirim ochish">
            <i class="fa-solid fa-plus text-[10px]"></i> Kirim
          </button>
          <button type="button" onclick="event.stopPropagation(); editItem(${it.id})" class="p-1 px-2 bg-slate-100 hover:bg-indigo-50 text-slate-600 hover:text-indigo-600 rounded-lg text-xs border border-slate-200 hover:border-indigo-200 active:scale-95 transition-all inline-flex items-center btn-kinetic" title="Tahrirlash">
            <i class="fa-solid fa-pen text-[10px]"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

function selectNomenclatureCatalogRow(id) {
  selectedNomenclatureCatalogId = id;
  const it = (globalItems || []).find(i => i.id === id);
  const infoEl = document.getElementById('nom-catalog-selected-info');
  if (infoEl) {
    if (it) {
      infoEl.innerHTML = `<i class="fa-solid fa-check-circle text-amber-400 mr-1"></i> Tanlangan: <strong>${escapeHtml(it.name)}</strong> (${formatUzs(it.sale_price || 0)} so'm)`;
    } else {
      infoEl.innerText = 'Mahsulot tanlanmagan';
    }
  }
  renderNomenclatureCatalogTable();
}

function startPurchaseForNomenclature(itemId) {
  closeModal('modal-1c-nomenclature-catalog');
  openPurchaseModal();
  const item = (globalItems || []).find(i => i.id === itemId);
  if (item) {
    purchaseDocRows = [{
      item_id: item.id,
      unit: item.unit || 'кг',
      barcode: item.barcode || '',
      gross_weight: 0,
      tare_weight: 0,
      quantity: 1,
      unit_price: item.cost_price || 0,
      discount_percent: 0,
      discount_amount: 0,
      total_price: item.cost_price || 0,
      custom_price: item.sale_price || 0,
      custom_price2: 0
    }];
    renderPurchaseDocRows();
  }
}

async function promptCreateNomenclatureGroup(prefill = '') {
  const gName = prompt("Yangi tovar / nomenklatura guruhi nomini kiriting:\n(Masalan: Go'sht xomashyosi, Qadoqlash materiallari, Ziravorlar, Tayyor mahsulotlar):", prefill);
  if (!gName || !gName.trim()) return null;
  const trimmed = gName.trim();

  try {
    const res = await fetch('/api/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: trimmed, type: 'item' })
    });
    const result = await res.json();
    if (result.success) {
      await fetchCatalogGroups();
      activeNomenclatureCatalogGroup = trimmed;
      updateNomenclatureCatalogGroupButtons();
      renderNomenclatureCatalogTable();
      alert(`✅ Yangi tovar guruhi "${trimmed}" bazada muvaffaqiyatli saqlandi!`);
      return trimmed;
    } else {
      alert('Xatolik: ' + (result.error || 'Guruhni saqlashda xatolik yuz berdi'));
    }
  } catch (err) {
    alert('Guruhni saqlashda server xatosi: ' + err.message);
  }
  return null;
}

function promptCreateItemCategoryGroup() {
  return promptCreateNomenclatureGroup();
}

async function promptCreateNomenclatureGroupFromItemModal() {
  const name = await promptCreateNomenclatureGroup();
  if (name) {
    populateGroupSelects();
    const itemGroup = document.getElementById('item-group');
    if (itemGroup) itemGroup.value = name;
  }
}

function update1cPanelActiveTab(actionKey) {
  const btnSuppliers = document.getElementById('btn-1c-suppliers');
  const btnInvoices = document.getElementById('btn-1c-purchase-invoices');
  const btnNomen = document.getElementById('btn-1c-nomenklatura');
  const cardTitle = document.getElementById('panel-1c-active-title');
  const cardDesc = document.getElementById('panel-1c-active-desc');
  const cardActions = document.getElementById('panel-1c-active-actions');

  const defaultBtnClass = 'group text-gray-300 hover:text-white transition flex items-center gap-2 text-left py-0.5 w-full';
  const activeBtnClass = 'border border-dashed border-rose-400 bg-rose-950/50 text-rose-200 px-2.5 py-1 rounded font-semibold flex items-center gap-2 shadow-sm transition w-full';

  if (btnSuppliers) btnSuppliers.className = defaultBtnClass;
  if (btnInvoices) btnInvoices.className = defaultBtnClass;
  if (btnNomen) btnNomen.className = defaultBtnClass;

  if (actionKey === 'suppliers') {
    if (btnSuppliers) btnSuppliers.className = activeBtnClass;
    if (cardTitle) cardTitle.innerText = "Tanlangan registr: Ta'minotchilar";
    if (cardDesc) cardDesc.innerText = "\"Ta'minotchilar (Поставщики)\" ma'lumotnomasi tanlandi. Guruhlar va ta'minotchilar ro'yxatini ko'rish uchun quyidagi tugmani bosing.";
    if (cardActions) {
      cardActions.innerHTML = `
        <button onclick="openSuppliers1cCatalog()" class="w-full py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-lg text-xs flex items-center justify-center gap-2 shadow-lg transition">
          <i class="fa-solid fa-folder-open"></i> Ta'minotchilar Katalogini Ochish (1C)
        </button>
        <button onclick="openCounterpartyModal('supplier')" class="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-xs flex items-center justify-center gap-2 shadow-lg transition">
          <i class="fa-solid fa-plus"></i> + Yangi Ta'minotchi (Создать)
        </button>
      `;
    }
  } else if (actionKey === 'nomenklatura') {
    if (btnNomen) btnNomen.className = activeBtnClass;
    if (cardTitle) cardTitle.innerText = "Tanlangan registr: Nomenklatura";
    if (cardDesc) cardDesc.innerText = "\"Nomenklatura (Номенклатура)\" ma'lumotnomasi tanlandi. Guruhlar va tovarlar ro'yxatini ko'rish uchun quyidagi tugmani bosing.";
    if (cardActions) {
      cardActions.innerHTML = `
        <button onclick="openNomenclature1cCatalog()" class="w-full py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-lg text-xs flex items-center justify-center gap-2 shadow-lg transition">
          <i class="fa-solid fa-folder-open"></i> Nomenklatura Katalogini Ochish (1C)
        </button>
        <button onclick="openItemModal()" class="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-xs flex items-center justify-center gap-2 shadow-lg transition">
          <i class="fa-solid fa-plus"></i> + Yangi Mahsulot (Создать)
        </button>
      `;
    }
  } else {
    if (btnInvoices) btnInvoices.className = activeBtnClass;
    if (cardTitle) cardTitle.innerText = "Tanlangan registr: Kirim yuk xatlari";
    if (cardDesc) cardDesc.innerText = "\"Kirim yuk xatlari (Приходные накладные)\" bandi tanlangan. Tugmani bosganingizda alohida 1C jurnali oynasi ochiladi.";
    if (cardActions) {
      cardActions.innerHTML = `
        <button onclick="openPurchasesJournal()" class="w-full py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-lg text-xs flex items-center justify-center gap-2 shadow-lg transition">
          <i class="fa-solid fa-folder-open"></i> Kirim Jurnalini Ochish (1C)
        </button>
        <button onclick="openPurchaseModal()" class="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-xs flex items-center justify-center gap-2 shadow-lg transition">
          <i class="fa-solid fa-plus"></i> + Yangi Kirim (Создать)
        </button>
      `;
    }
  }
}

// 1C harakatlarini qayta ishlash
function handle1cAction(actionKey) {
  // 1. Ta'minotchilar -> 1C Ma'lumotnoma oynasi (Guruhlar va Ro'yxat)
  if (actionKey === 'suppliers') {
    update1cPanelActiveTab('suppliers');
    openSuppliers1cCatalog();
    return;
  }

  // 2. Kirim yuk xatlari (Приходные накладные) -> Alohida 1C jurnali oynasi ochiladi
  if (actionKey === 'purchase_invoices') {
    update1cPanelActiveTab('purchase_invoices');
    openPurchasesJournal();
    return;
  }

  // 3. Nomenklatura -> 1C Ma'lumotnoma oynasi (Guruhlar va Ro'yxat)
  if (actionKey === 'nomenklatura') {
    update1cPanelActiveTab('nomenklatura');
    openNomenclature1cCatalog();
    return;
  }

  // 4. Analitika / Hisobotlar -> Hisobotlar bo'limiga o'tish
  if (actionKey === 'reports') {
    switchTab('reports');
    return;
  }

  // Boshqa 1C operatsiyalari uchun maxsus konfiguratsiya
  const opConfigs = {
    extra_expenses: {
      title: "Qo'shimcha xarajatlar (Дополнительные расходы)",
      subtitle: "Xarid qilingan go'sht va xomashyo partiyasiga transport, yuklash yoki bojxona xarajatlarini qo'shish",
      prefix: "EXP-",
      entityLabel: "Xizmat ko'rsatuvchi firma / Tashkilot",
      icon: "fa-solid fa-receipt"
    },
    supplier_order: {
      title: "Ta'minotchiga buyurtma (Заказ поставщику)",
      subtitle: "Kelgusida xomashyo yetkazib berish bo'yicha oldindan buyurtma rasmiylashtirish",
      prefix: "ZAK-",
      entityLabel: "Ta'minotchi (Поставщик)",
      icon: "fa-solid fa-cart-flatbed"
    },
    return_inventory: {
      title: "Foydalanishdan materiallarni qaytarish (Возврат из эксплуатации)",
      subtitle: "Xodimlardan maxsus kiyim yoki asbob-uskunani omborga qayta topshirish",
      prefix: "RET-",
      entityLabel: "Xodim / Mas'ul shaxs (F.I.SH)",
      icon: "fa-solid fa-arrow-rotate-left"
    },
    issue_inventory: {
      title: "Materiallarni foydalanishga topshirish (Передача в эксплуатацию)",
      subtitle: "Ishchilarga maxsus forma, pichoqlar va inventarlarni foydalanishga berish",
      prefix: "ISS-",
      entityLabel: "Xodim / Tsex boshlig'i",
      icon: "fa-solid fa-vest"
    },
    scrap_inventory: {
      title: "Foydalanishdagi materiallarni hisobdan chiqarish (Списание из эксплуатации)",
      subtitle: "Eskirgan yoki yaroqsiz bo'lgan maxsus kiyim va inventarlarni balansdan chiqarish",
      prefix: "SCR-",
      entityLabel: "Hisobdan chiqarish komissiyasi",
      icon: "fa-solid fa-trash-arrow-up"
    },
    stock_transfer: {
      title: "Zaxiralarni ko'chirish (Перемещение запасов)",
      subtitle: "Xomashyo omboridan go'shtni maydalash tsexiga yoki qadoqlash bo'limiga ko'chirish",
      prefix: "TRN-",
      entityLabel: "Qabul qiluvchi tsex / Omborchi",
      icon: "fa-solid fa-truck-moving"
    },
    cell_distribution: {
      title: "Qoldiqlarni yacheykalarga taqsimlash (Распределить по ячейкам)",
      subtitle: "Muzlatkich kameralari va ombor yacheykalari bo'yicha partiyalarni joylashtirish",
      prefix: "CEL-",
      entityLabel: "Ombor bo'limi / Kamera №",
      icon: "fa-solid fa-table-cells"
    },
    stock_audit: {
      title: "Zaxiralarni inventarizatsiya qilish (Инвентаризация запасов)",
      subtitle: "Haqiqiy go'sht va xomashyo qoldig'ini tekshirish hamda tizim qoldig'i bilan solishtirish",
      prefix: "INV-",
      entityLabel: "Komissiya raisi / Auditor",
      icon: "fa-solid fa-clipboard-check"
    },
    warehouse_acts: {
      title: "Ombor dalolatnomalari (Складские акты)",
      subtitle: "Vazn yo'qotishi, erish (defrost) va texnologik kamayish dalolatnomalari",
      prefix: "ACT-",
      entityLabel: "Mas'ul komissiya a'zolari",
      icon: "fa-solid fa-file-signature"
    },
    stock_surplus: {
      title: "Zaxiralarni kirim qilish (Оприходования запасов)",
      subtitle: "Qayta hisoblashda aniqlangan ortiqcha xomashyo va mahsulotlarni kirim qilish",
      prefix: "OPR-",
      entityLabel: "Ombor mudiri",
      icon: "fa-solid fa-square-plus"
    },
    stock_mixup: {
      title: "Zaxiralar navi aralashuvi (Пересортица запасов)",
      subtitle: "Go'sht va buyumlar navlarining o'zaro nomutanosibligini to'g'rilash (pereortisa)",
      prefix: "PRS-",
      entityLabel: "Texnolog / Sifat nazorati",
      icon: "fa-solid fa-shuffle"
    },
    stock_writeoff: {
      title: "Zaxiralarni hisobdan chiqarish (Списания запасов)",
      subtitle: "Buzilgan, sifatsiz yoki yaroqlilik muddati o'tgan go'sht mahsulotlarini hisobdan chiqarish",
      prefix: "SPI-",
      entityLabel: "Hisobdan chiqarish asosi",
      icon: "fa-solid fa-dumpster-fire"
    },
    processors_reports: {
      title: "Qayta ishlovchilar hisobotlari (Отчеты переработчиков)",
      subtitle: "Xomashyoni qayta ishlashga olgan tashqi pudratchilar bo'yicha hisobot",
      prefix: "PER-",
      entityLabel: "Pudratchi / Hamkor korxona",
      icon: "fa-solid fa-handshake-angle"
    },
    more_settings: {
      title: "Xaridlar va Ombor sozlamalari (Настройки)",
      subtitle: "1C tizimi xarid shartnomalari, yetkazib berish qoidalari va limitlar",
      prefix: "SET-",
      entityLabel: "Boshqaruvchi / Mas'ul",
      icon: "fa-solid fa-sliders"
    }
  };

  const config = opConfigs[actionKey];
  if (!config) return;

  // Modal ma'lumotlarini o'rnatish
  document.getElementById('modal-1c-title').innerText = config.title;
  document.getElementById('modal-1c-subtitle').innerText = config.subtitle;
  document.getElementById('op-1c-type').value = actionKey;
  document.getElementById('op-1c-entity-label').innerText = config.entityLabel;

  const iconEl = document.getElementById('modal-1c-icon');
  if (iconEl) iconEl.className = config.icon + ' text-sm';

  // Hujjat raqami va sana generatsiyasi
  const randomNum = Math.floor(10000 + Math.random() * 90000);
  document.getElementById('op-1c-num').value = `${config.prefix}${randomNum}`;
  document.getElementById('op-1c-date').value = new Date().toISOString().slice(0, 10);
  document.getElementById('op-1c-entity').value = '';
  document.getElementById('op-1c-qty').value = 1;
  document.getElementById('op-1c-amount').value = 0;
  document.getElementById('op-1c-notes').value = '';

  // Nomenklaturani selectga to'ldirish
  const itemSelect = document.getElementById('op-1c-item');
  if (itemSelect) {
    if (globalItems && globalItems.length > 0) {
      itemSelect.innerHTML = globalItems.map(it => 
        `<option value="${it.id}">${it.name} (${it.category === 'raw' ? 'Xomashyo' : it.category === 'finished' ? 'Tayyor' : 'Qadoq'})</option>`
      ).join('');
    } else {
      itemSelect.innerHTML = '<option value="">(Nomenklatura mavjud emas)</option>';
    }
  }

  openModal('modal-1c-operation');
}

// 1C operatsiyasini saqlash
async function handleSave1cOperation(e) {
  e.preventDefault();
  const type = document.getElementById('op-1c-type').value;
  const num = document.getElementById('op-1c-num').value;
  const date = document.getElementById('op-1c-date').value;
  const entity = document.getElementById('op-1c-entity').value;
  const itemId = document.getElementById('op-1c-item').value;
  const qty = Number(document.getElementById('op-1c-qty').value) || 0;
  const amount = Number(document.getElementById('op-1c-amount').value) || 0;
  const notes = document.getElementById('op-1c-notes').value;

  closeModal('modal-1c-operation');
  if (typeof playSuccessSound === 'function') playSuccessSound();
  
  // Muvaffaqiyat xabari
  alert(`✅ 1C:ERP Hujjati muvaffaqiyatli o'tkazildi!\n\nHujjat №: ${num}\nSana: ${date}\nMas'ul: ${entity || 'Kiritilmagan'}\nHarakat turi: ${type}\n\nOmbor harakatlari va registrlar yangilandi.`);
  
  await refreshAllData();
}

// ============================================================================
// 12. ROLE-BASED ACCESS CONTROL (RBAC) & USER MANAGEMENT
// ============================================================================

let currentUser = null;
let globalRoles = [];
let globalUsers = [];
let currentEditingRoleId = null;

// Auth & RBAC initialization
function initAuthAndRbac() {
  try {
    const saved = localStorage.getItem('meatcity_current_user');
    if (saved) {
      currentUser = JSON.parse(saved);
    }
  } catch (e) {
    console.error('Error loading saved user:', e);
  }

  // Default to Super Admin if not logged in
  if (!currentUser) {
    currentUser = {
      id: 1,
      username: 'admin',
      full_name: 'Super Admin (Boshqaruvchi)',
      role_id: 1,
      role_name: 'Super Admin',
      is_super_admin: true,
      permissions: [
        'dashboard', 'purchases', 'production', 'sales', 'money', 'stock', 'reports', 'catalogs',
        'view_prices', 'view_profit', 'delete_docs', 'print_docs', 'admin_access'
      ]
    };
    localStorage.setItem('meatcity_current_user', JSON.stringify(currentUser));
  }

  // Close dropdown on click outside
  document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('dropdown-user-menu');
    const profileBtn = document.getElementById('btn-user-profile');
    if (dropdown && !dropdown.classList.contains('hidden')) {
      if (profileBtn && !profileBtn.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.classList.add('hidden');
      }
    }
  });

  applyUserPermissions();
}

// Check permission
function hasPerm(permKey) {
  if (!currentUser) return false;
  if (currentUser.is_super_admin) return true;
  if (!currentUser.permissions || !Array.isArray(currentUser.permissions)) return false;
  return currentUser.permissions.includes(permKey);
}

// Apply user permissions to UI
function applyUserPermissions() {
  if (!currentUser) return;

  // Header & Sidebar display
  const nameEl = document.getElementById('user-display-name');
  const roleEl = document.getElementById('user-display-role');
  const sbNameEl = document.getElementById('sidebar-user-name');
  const sbRoleEl = document.getElementById('sidebar-user-role');
  const initialsEl = document.getElementById('user-avatar-initials');
  const menuNameEl = document.getElementById('menu-user-fullname');
  const menuRoleEl = document.getElementById('menu-user-role');

  const fullName = currentUser.full_name || currentUser.username;
  const roleTitle = currentUser.role_name || (currentUser.is_super_admin ? 'Super Admin' : 'Foydalanuvchi');

  if (nameEl) nameEl.innerText = fullName;
  if (roleEl) roleEl.innerText = roleTitle;
  if (sbNameEl) sbNameEl.innerText = fullName;
  if (sbRoleEl) sbRoleEl.innerText = roleTitle;
  if (menuNameEl) menuNameEl.innerText = fullName;
  if (menuRoleEl) menuRoleEl.innerText = `${roleTitle} (${currentUser.is_super_admin ? 'Super Admin' : 'Foydalanuvchi'})`;
  if (initialsEl) {
    if (currentUser.is_super_admin) {
      initialsEl.innerText = '👑';
    } else {
      const parts = (currentUser.full_name || currentUser.username).trim().split(' ');
      const init = parts.length > 1 ? (parts[0][0] + parts[1][0]).toUpperCase() : parts[0].slice(0, 2).toUpperCase();
      initialsEl.innerText = init;
    }
  }

  // Admin-only controls
  const btnReset = document.getElementById('btn-reset-db');
  if (btnReset) {
    if (hasPerm('admin_access') || currentUser.is_super_admin) {
      btnReset.classList.remove('hidden');
    } else {
      btnReset.classList.add('hidden');
    }
  }

  const btnRbac = document.getElementById('btn-menu-rbac');
  if (btnRbac) {
    if (hasPerm('admin_access') || currentUser.is_super_admin) {
      btnRbac.classList.remove('hidden');
    } else {
      btnRbac.classList.add('hidden');
    }
  }

  // Navigation tabs visibility
  const allModules = ['dashboard', 'purchases', 'production', 'sales', 'money', 'stock', 'reports', 'catalogs'];
  let firstPermitted = null;

  allModules.forEach(mod => {
    const navEl = document.getElementById(`nav-${mod}`);
    const permitted = hasPerm(mod);
    if (navEl) {
      if (permitted) {
        navEl.classList.remove('hidden');
        if (!firstPermitted) firstPermitted = mod;
      } else {
        navEl.classList.add('hidden');
      }
    }
  });

  // If current activeTab is not permitted, switch to first permitted
  if (!hasPerm(activeTab) && firstPermitted) {
    switchTab(firstPermitted);
  }
}

// User Profile dropdown
function toggleUserDropdown(event) {
  if (event) event.stopPropagation();
  const menu = document.getElementById('dropdown-user-menu');
  if (menu) {
    menu.classList.toggle('hidden');
  }
}

function closeUserDropdown() {
  const menu = document.getElementById('dropdown-user-menu');
  if (menu) menu.classList.add('hidden');
}

// ----------------------------------------------------------------------------
// RBAC Modal & Role Constructor
// ----------------------------------------------------------------------------
async function openRbacModal() {
  if (!hasPerm('admin_access') && !currentUser?.is_super_admin) {
    alert('Ruxsat cheklangan! Ushbu bo\'lim faqat Super Admin va tizim boshqaruvchilari uchun.');
    return;
  }
  openModal('modal-rbac-management');
  switchRbacTab('roles');
  await Promise.all([loadRoles(), loadUsers()]);
}

function switchRbacTab(tab) {
  const btnRoles = document.getElementById('tab-btn-roles');
  const btnUsers = document.getElementById('tab-btn-users');
  const viewRoles = document.getElementById('rbac-view-roles');
  const viewUsers = document.getElementById('rbac-view-users');

  if (tab === 'roles') {
    if (btnRoles) btnRoles.className = 'px-4 py-2 rounded-lg font-bold flex items-center gap-2 bg-rose-600 text-white shadow-sm transition';
    if (btnUsers) btnUsers.className = 'px-4 py-2 rounded-lg font-bold flex items-center gap-2 text-gray-400 hover:text-white hover:bg-gray-800 transition';
    if (viewRoles) viewRoles.classList.remove('hidden');
    if (viewUsers) viewUsers.classList.add('hidden');
  } else {
    if (btnUsers) btnUsers.className = 'px-4 py-2 rounded-lg font-bold flex items-center gap-2 bg-rose-600 text-white shadow-sm transition';
    if (btnRoles) btnRoles.className = 'px-4 py-2 rounded-lg font-bold flex items-center gap-2 text-gray-400 hover:text-white hover:bg-gray-800 transition';
    if (viewUsers) viewUsers.classList.remove('hidden');
    if (viewRoles) viewRoles.classList.add('hidden');
    loadUsers();
  }
}

async function loadRoles() {
  try {
    const res = await fetch('/api/roles');
    const json = await res.json();
    if (json.success && json.data) {
      globalRoles = json.data;
      renderRolesList();
      // Select first role if none selected or current is deleted
      if (!currentEditingRoleId && globalRoles.length > 0) {
        selectRoleForEdit(globalRoles[0].id);
      } else if (currentEditingRoleId) {
        const found = globalRoles.find(r => r.id === currentEditingRoleId);
        if (found) selectRoleForEdit(found.id);
        else if (globalRoles.length > 0) selectRoleForEdit(globalRoles[0].id);
      }
    }
  } catch (err) {
    console.error('Rollar yuklanmadi:', err);
  }
}

function renderRolesList() {
  const container = document.getElementById('rbac-roles-list');
  if (!container) return;

  if (globalRoles.length === 0) {
    container.innerHTML = '<div class="text-center py-6 text-gray-500 text-xs">Rollar mavjud emas</div>';
    return;
  }

  container.innerHTML = globalRoles.map(role => {
    const isSelected = currentEditingRoleId === role.id;
    const isSys = Boolean(role.is_system);
    const permCount = Array.isArray(role.permissions) ? role.permissions.length : 0;

    return `
      <div onclick="selectRoleForEdit(${role.id})" class="p-3 rounded-xl border transition cursor-pointer flex flex-col gap-1.5 ${
        isSelected 
          ? 'bg-rose-950/40 border-rose-500/80 shadow-md ring-1 ring-rose-500/40' 
          : 'bg-gray-900/80 border-gray-800 hover:border-gray-700 hover:bg-gray-900'
      }">
        <div class="flex items-center justify-between">
          <div class="font-bold text-white text-xs flex items-center gap-1.5">
            ${isSys ? '👑' : '🛡️'} <span>${role.name}</span>
          </div>
          ${isSys 
            ? '<span class="px-2 py-0.5 text-[9px] font-black uppercase rounded-full bg-amber-950 text-amber-300 border border-amber-800/60">Super Admin</span>'
            : '<span class="px-2 py-0.5 text-[9px] font-bold uppercase rounded-full bg-blue-950 text-blue-300 border border-blue-800/60">Maxsus rol</span>'
          }
        </div>
        <p class="text-[11px] text-gray-400 line-clamp-1">${role.description || 'Tavsif mavjud emas'}</p>
        <div class="flex items-center justify-between pt-1 border-t border-gray-800/60 text-[10px] text-gray-400 font-mono">
          <span>Ruxsatlar: <strong class="text-rose-400">${permCount}</strong> ta</span>
          <span class="text-gray-500">${isSelected ? 'Tanlangan ✓' : 'Tanlash →'}</span>
        </div>
      </div>
    `;
  }).join('');
}

function startNewRole() {
  currentEditingRoleId = null;
  document.getElementById('role-edit-id').value = '';
  document.getElementById('role-edit-name').value = '';
  document.getElementById('role-edit-name').readOnly = false;
  document.getElementById('role-edit-desc').value = '';
  document.getElementById('role-form-title').innerText = 'Yangi Rol Yaratish';
  document.getElementById('role-form-icon').innerText = '➕';
  document.getElementById('role-badge-status').innerText = 'Yangi rol';
  document.getElementById('role-badge-status').className = 'px-2 py-0.5 text-[10px] rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800/60 font-semibold';
  
  const btnDel = document.getElementById('btn-delete-role');
  if (btnDel) btnDel.classList.add('hidden');

  selectAllRolePerms(false);
  renderRolesList();
}

function selectRoleForEdit(roleId) {
  const role = globalRoles.find(r => r.id === roleId);
  if (!role) return;

  currentEditingRoleId = role.id;
  document.getElementById('role-edit-id').value = role.id;
  document.getElementById('role-edit-name').value = role.name;
  document.getElementById('role-edit-name').readOnly = Boolean(role.is_system);
  document.getElementById('role-edit-desc').value = role.description || '';
  document.getElementById('role-form-title').innerText = role.name;
  document.getElementById('role-form-icon').innerText = role.is_system ? '👑' : '✏️';

  const badge = document.getElementById('role-badge-status');
  if (badge) {
    if (role.is_system) {
      badge.innerText = 'Asosiy Tizim Roli';
      badge.className = 'px-2 py-0.5 text-[10px] rounded-full bg-amber-950 text-amber-300 border border-amber-800/60 font-semibold';
    } else {
      badge.innerText = 'Tahrirlash rejimi';
      badge.className = 'px-2 py-0.5 text-[10px] rounded-full bg-blue-950 text-blue-300 border border-blue-800/60 font-semibold';
    }
  }

  const btnDel = document.getElementById('btn-delete-role');
  if (btnDel) {
    if (role.is_system) {
      btnDel.classList.add('hidden');
    } else {
      btnDel.classList.remove('hidden');
    }
  }

  // Set permissions checkboxes
  const perms = Array.isArray(role.permissions) ? role.permissions : [];
  
  const allPermCheckboxes = document.querySelectorAll('.perm-module-checkbox, .perm-special-checkbox');
  allPermCheckboxes.forEach(cb => {
    cb.checked = perms.includes(cb.value);
    if (role.is_system) {
      cb.checked = true; // Super admin has everything
    }
  });

  renderRolesList();
}

function selectAllRolePerms(check) {
  const allPermCheckboxes = document.querySelectorAll('.perm-module-checkbox, .perm-special-checkbox');
  allPermCheckboxes.forEach(cb => {
    cb.checked = check;
  });
}

async function handleSaveRole(e) {
  e.preventDefault();
  const id = document.getElementById('role-edit-id').value;
  const name = document.getElementById('role-edit-name').value.trim();
  const description = document.getElementById('role-edit-desc').value.trim();

  if (!name) {
    alert('Rol nomini kiriting!');
    return;
  }

  const perms = [];
  const allPermCheckboxes = document.querySelectorAll('.perm-module-checkbox, .perm-special-checkbox');
  allPermCheckboxes.forEach(cb => {
    if (cb.checked) perms.push(cb.value);
  });

  const payload = { name, description, permissions: perms };

  try {
    let res;
    if (id) {
      res = await fetch(`/api/roles/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } else {
      res = await fetch('/api/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    }

    const data = await res.json();
    if (!res.ok || !data.success) {
      alert(`Xatolik: ${data.error || 'Rolni saqlab bo\'lmadi'}`);
      return;
    }

    if (typeof playSuccessSound === 'function') playSuccessSound();
    alert(`✅ Rol muvaffaqiyatli saqlandi: "${name}"`);
    await loadRoles();
    if (data.data?.id) {
      selectRoleForEdit(data.data.id);
    }

    // Agar joriy foydalanuvchining roli tahrirlangan bo'lsa, huquqlarni darhol yangilaymiz
    if (currentUser && currentUser.role_id === Number(id)) {
      currentUser.role_name = name;
      currentUser.permissions = perms;
      localStorage.setItem('meatcity_current_user', JSON.stringify(currentUser));
      applyUserPermissions();
    }
  } catch (err) {
    console.error('Rol saqlashda xatolik:', err);
    alert('Rolni saqlashda server xatosi yuz berdi');
  }
}

async function handleDeleteCurrentRole() {
  if (!currentEditingRoleId) return;
  const role = globalRoles.find(r => r.id === currentEditingRoleId);
  if (!role) return;

  if (role.is_system) {
    alert('Tizimning asosiy Super Admin rolini o\'chirib bo\'lmaydi!');
    return;
  }

  if (!confirm(`Haqiqatan ham "${role.name}" rolini o'chirmoqchimisiz?`)) return;

  try {
    const res = await fetch(`/api/roles/${role.id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok || !data.success) {
      alert(`Xatolik: ${data.error || 'Rolni o\'chirib bo\'lmadi'}`);
      return;
    }

    alert(`✅ "${role.name}" roli o'chirildi`);
    currentEditingRoleId = null;
    await loadRoles();
  } catch (err) {
    console.error('Rol o\'chirishda xatolik:', err);
    alert('Rolni o\'chirishda xatolik yuz berdi');
  }
}

// ----------------------------------------------------------------------------
// Users Management Logic
// ----------------------------------------------------------------------------
async function loadUsers() {
  try {
    const res = await fetch('/api/users');
    const json = await res.json();
    if (json.success && json.data) {
      globalUsers = json.data;
      renderUsersList();
      const badge = document.getElementById('users-count-badge');
      if (badge) badge.innerText = `${globalUsers.length} ta xodim`;
    }
  } catch (err) {
    console.error('Xodimlarni yuklashda xato:', err);
  }
}

function renderUsersList() {
  const tbody = document.getElementById('table-users-body');
  if (!tbody) return;

  if (globalUsers.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="py-6 text-center text-gray-500">Xodimlar mavjud emas</td></tr>';
    return;
  }

  tbody.innerHTML = globalUsers.map(u => {
    const isCurrent = currentUser && currentUser.id === u.id;
    const isSuper = Boolean(u.is_super_admin) || u.username === 'admin';
    const isActive = u.status === 'active';

    return `
      <tr class="hover:bg-gray-850/50 transition ${isCurrent ? 'bg-rose-950/20' : ''}">
        <td class="py-2.5 px-3">
          <div class="flex items-center gap-2">
            <div class="w-7 h-7 rounded-full bg-gradient-to-tr ${isSuper ? 'from-rose-600 to-amber-500' : 'from-blue-600 to-indigo-600'} text-white flex items-center justify-center text-[10px] font-bold">
              ${isSuper ? '👑' : u.full_name ? u.full_name[0].toUpperCase() : '👤'}
            </div>
            <div>
              <div class="font-bold text-white flex items-center gap-1.5">
                <span>${u.full_name || u.username}</span>
                ${isCurrent ? '<span class="px-1.5 py-0.2 text-[9px] rounded bg-rose-600 text-white font-mono">Siz</span>' : ''}
              </div>
              <div class="text-[10px] text-gray-500">ID: ${u.id}</div>
            </div>
          </div>
        </td>
        <td class="py-2.5 px-3 font-mono text-gray-300">@${u.username}</td>
        <td class="py-2.5 px-3">
          <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${
            isSuper ? 'bg-amber-950 text-amber-300 border border-amber-800/60' : 'bg-blue-950 text-blue-300 border border-blue-800/60'
          }">
            ${u.role_name || 'Roli yo\'q'}
          </span>
        </td>
        <td class="py-2.5 px-3 font-mono text-gray-400">${u.phone || '—'}</td>
        <td class="py-2.5 px-3 font-mono text-gray-400">${u.pin_code ? '••••' : '—'}</td>
        <td class="py-2.5 px-3">
          <span class="px-2 py-0.5 rounded-full text-[10px] font-semibold ${
            isActive ? 'bg-emerald-950 text-emerald-300 border border-emerald-800/60' : 'bg-red-950 text-red-300 border border-red-800/60'
          }">
            ${isActive ? 'Faol' : 'Bloklangan'}
          </span>
        </td>
        <td class="py-2.5 px-3 text-right">
          <div class="flex items-center justify-end gap-1.5">
            <button onclick="quickSwitchToUser(${u.id})" class="px-2 py-1 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded font-semibold text-[10px] flex items-center gap-1 transition" title="Ushbu hisobga o'tish">
              <i class="fa-solid fa-arrow-right-to-bracket text-rose-400"></i> Kirish
            </button>
            <button onclick="openUserFormModal(${u.id})" class="p-1 text-gray-400 hover:text-white transition" title="Tahrirlash">
              <i class="fa-solid fa-pen-to-square"></i>
            </button>
            ${!isSuper ? `
              <button onclick="handleDeleteUser(${u.id})" class="p-1 text-gray-500 hover:text-red-400 transition" title="O'chirish">
                <i class="fa-solid fa-trash-can"></i>
              </button>
            ` : ''}
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function openUserFormModal(userId = null) {
  // Populate roles select
  const select = document.getElementById('user-role-id');
  if (select) {
    select.innerHTML = globalRoles.map(r => 
      `<option value="${r.id}">${r.name} ${r.is_system ? '(Super Admin)' : ''}</option>`
    ).join('');
  }

  const idInput = document.getElementById('user-edit-id');
  const nameInput = document.getElementById('user-fullname');
  const userInput = document.getElementById('user-username');
  const passInput = document.getElementById('user-password');
  const passHint = document.getElementById('user-password-hint');
  const phoneInput = document.getElementById('user-phone');
  const pinInput = document.getElementById('user-pin');
  const statusSelect = document.getElementById('user-status');
  const titleEl = document.getElementById('modal-user-title');

  if (userId) {
    const user = globalUsers.find(u => u.id === userId);
    if (!user) return;
    idInput.value = user.id;
    nameInput.value = user.full_name || '';
    userInput.value = user.username || '';
    userInput.readOnly = user.username === 'admin';
    passInput.value = '';
    passInput.required = false;
    if (passHint) passHint.classList.remove('hidden');
    if (select) select.value = user.role_id;
    phoneInput.value = user.phone || '';
    pinInput.value = user.pin_code || '';
    if (statusSelect) statusSelect.value = user.status || 'active';
    if (titleEl) titleEl.innerText = `Xodimni Tahrirlash: ${user.full_name}`;
  } else {
    idInput.value = '';
    nameInput.value = '';
    userInput.value = '';
    userInput.readOnly = false;
    passInput.value = '';
    passInput.required = true;
    if (passHint) passHint.classList.add('hidden');
    if (select && globalRoles.length > 0) select.value = globalRoles[0].id;
    phoneInput.value = '';
    pinInput.value = '';
    if (statusSelect) statusSelect.value = 'active';
    if (titleEl) titleEl.innerText = 'Yangi Xodim Qo\'shish';
  }

  openModal('modal-user-form');
}

async function handleSaveUser(e) {
  e.preventDefault();
  const id = document.getElementById('user-edit-id').value;
  const full_name = document.getElementById('user-fullname').value.trim();
  const username = document.getElementById('user-username').value.trim();
  const password = document.getElementById('user-password').value.trim();
  const role_id = Number(document.getElementById('user-role-id').value);
  const phone = document.getElementById('user-phone').value.trim();
  const pin_code = document.getElementById('user-pin').value.trim();
  const status = document.getElementById('user-status').value;

  if (!full_name || !username) {
    alert('F.I.Sh. va Login kiritilishi shart!');
    return;
  }

  if (!id && !password) {
    alert('Yangi xodim uchun parol kiritilishi shart!');
    return;
  }

  const payload = { full_name, username, role_id, phone, pin_code, status };
  if (password) payload.password = password;

  try {
    let res;
    if (id) {
      res = await fetch(`/api/users/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } else {
      res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    }

    const data = await res.json();
    if (!res.ok || !data.success) {
      alert(`Xatolik: ${data.error || 'Xodimni saqlab bo\'lmadi'}`);
      return;
    }

    closeModal('modal-user-form');
    if (typeof playSuccessSound === 'function') playSuccessSound();
    alert(`✅ Xodim muvaffaqiyatli saqlandi: ${full_name}`);
    await loadUsers();

    // Agar joriy foydalanuvchi tahrirlangan bo'lsa
    if (currentUser && currentUser.id === Number(id)) {
      currentUser.full_name = full_name;
      currentUser.username = username;
      currentUser.role_id = role_id;
      const role = globalRoles.find(r => r.id === role_id);
      if (role) {
        currentUser.role_name = role.name;
        currentUser.permissions = role.permissions;
      }
      localStorage.setItem('meatcity_current_user', JSON.stringify(currentUser));
      applyUserPermissions();
    }
  } catch (err) {
    console.error('Xodim saqlashda xato:', err);
    alert('Server bilan bog\'lanishda xato yuz berdi');
  }
}

async function handleDeleteUser(userId) {
  const user = globalUsers.find(u => u.id === userId);
  if (!user) return;

  if (user.username === 'admin') {
    alert('Super Admin hisobini o\'chirib bo\'lmaydi!');
    return;
  }

  if (!confirm(`Haqiqatan ham "${user.full_name || user.username}" hisobini o'chirmoqchimisiz?`)) return;

  try {
    const res = await fetch(`/api/users/${userId}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok || !data.success) {
      alert(`Xatolik: ${data.error || 'Xodimni o\'chirib bo\'lmadi'}`);
      return;
    }

    alert(`✅ Xodim o'chirildi`);
    await loadUsers();
  } catch (err) {
    console.error('Xodim o\'chirishda xatolik:', err);
    alert('Xodimni o\'chirishda server xatosi');
  }
}

// ----------------------------------------------------------------------------
// Auth & Login Logic
// ----------------------------------------------------------------------------
async function openLoginModal() {
  document.getElementById('login-username').value = '';
  document.getElementById('login-password').value = '';
  document.getElementById('login-pin').value = '';
  
  const errBox = document.getElementById('login-error-msg');
  if (errBox) errBox.classList.add('hidden');

  // Load users for quick buttons
  if (globalUsers.length === 0) {
    await loadUsers();
  }

  const chipsContainer = document.getElementById('login-quick-users-list');
  if (chipsContainer) {
    chipsContainer.innerHTML = globalUsers.map(u => `
      <button type="button" onclick="selectQuickUser('${u.username}')" class="p-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg text-left flex items-center gap-2 transition group">
        <span class="w-6 h-6 rounded-full bg-rose-600 text-white flex items-center justify-center text-[10px] font-bold">
          ${u.username === 'admin' ? '👑' : u.full_name ? u.full_name[0].toUpperCase() : '👤'}
        </span>
        <div class="overflow-hidden">
          <div class="font-bold text-white text-[11px] truncate group-hover:text-rose-400">${u.full_name || u.username}</div>
          <div class="text-[9px] text-gray-400 truncate">${u.role_name}</div>
        </div>
      </button>
    `).join('');
  }

  openModal('modal-login');
}

function selectQuickUser(username) {
  document.getElementById('login-username').value = username;
  document.getElementById('login-password').focus();
}

async function quickSwitchToUser(userId) {
  const user = globalUsers.find(u => u.id === userId);
  if (!user) return;

  if (user.pin_code) {
    const enteredPin = prompt(`"${user.full_name || user.username}" hisobiga o'tish uchun 4 xonali PIN-kodni kiriting:`);
    if (enteredPin === null) return;
    if (enteredPin.trim() !== user.pin_code.trim()) {
      alert('PIN-kod noto\'g\'ri!');
      return;
    }
  } else {
    const enteredPass = prompt(`"${user.full_name || user.username}" hisobi parolini kiriting:`);
    if (enteredPass === null) return;
    if (enteredPass.trim() !== user.password.trim()) {
      alert('Parol noto\'g\'ri!');
      return;
    }
  }

  // Set currentUser
  currentUser = {
    id: user.id,
    username: user.username,
    full_name: user.full_name,
    role_id: user.role_id,
    role_name: user.role_name,
    is_super_admin: Boolean(user.is_super_admin) || user.username === 'admin',
    permissions: user.role_permissions || []
  };

  localStorage.setItem('meatcity_current_user', JSON.stringify(currentUser));
  closeModal('modal-rbac-management');
  closeModal('modal-login');
  applyUserPermissions();
  alert(`✅ Xush kelibsiz, ${currentUser.full_name}! (${currentUser.role_name})`);
}

async function handleUserLogin(e) {
  e.preventDefault();
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value.trim();
  const pin = document.getElementById('login-pin').value.trim();

  const errBox = document.getElementById('login-error-msg');
  const errText = document.getElementById('login-error-text');

  if (!pin && (!username || !password)) {
    if (errBox) {
      errBox.classList.remove('hidden');
      errText.innerText = 'Login va parolni kiriting yoki 4 xonali PIN-kodni yozing!';
    }
    return;
  }

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, pin })
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      if (errBox) {
        errBox.classList.remove('hidden');
        errText.innerText = data.error || 'Kirish ma\'lumotlari noto\'g\'ri!';
      }
      return;
    }

    // Success
    currentUser = data.data;
    localStorage.setItem('meatcity_current_user', JSON.stringify(currentUser));
    
    closeModal('modal-login');
    applyUserPermissions();
    if (typeof playSuccessSound === 'function') playSuccessSound();
    alert(`✅ Xush kelibsiz, ${currentUser.full_name}!\nRol: ${currentUser.role_name}`);
    await refreshAllData();
  } catch (err) {
    console.error('Kirishda xatolik:', err);
    if (errBox) {
      errBox.classList.remove('hidden');
      errText.innerText = 'Server bilan bog\'lanishda xatolik yuz berdi';
    }
  }
}

function logoutCurrentUser() {
  if (!confirm('Haqiqatan ham tizimdan chiqmoqchimisiz?')) return;
  
  localStorage.removeItem('meatcity_current_user');
  currentUser = null;
  openLoginModal();
}

// ============================================================================
// 13. KINETIC MICRO-INTERACTIONS & AUDIO SYNTHESIZER
// ============================================================================

let soundFxEnabled = localStorage.getItem('meatcity_sound_fx') !== 'false';
let audioCtx = null;

// Web Audio API sintezatorini yaratish
function getAudioContext() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

// Yengil taktil bosish chertkisi (soft tactile pop 35ms)
function playClickSound() {
  if (!soundFxEnabled) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'sine';
    const now = ctx.currentTime;
    osc.frequency.setValueAtTime(640, now);
    osc.frequency.exponentialRampToValueAtTime(320, now + 0.035);
    
    gain.gain.setValueAtTime(0.045, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start(now);
    osc.stop(now + 0.035);
  } catch (e) {
    // Autoplay cheklovi bo'lsa xatoni e'tiborsiz qoldirish
  }
}

// Oyna yoki bo'lim ochilgandagi havodor tovush (airy chime 80ms)
function playOpenSound() {
  if (!soundFxEnabled) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'triangle';
    const now = ctx.currentTime;
    osc.frequency.setValueAtTime(380, now);
    osc.frequency.exponentialRampToValueAtTime(760, now + 0.08);
    
    gain.gain.setValueAtTime(0.04, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start(now);
    osc.stop(now + 0.08);
  } catch (e) {}
}

// Hujjat saqlanganda yoki muvaffaqiyatli yakunlanganda yoqimli akkord (140ms)
function playSuccessSound() {
  if (!soundFxEnabled) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    [523.25, 659.25, 783.99].forEach((freq, i) => { // C5, E5, G5
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const now = ctx.currentTime + (i * 0.04);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(0.05, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.14);
    });
  } catch (e) {}
}

// Ovoz effektlarini yoqish / o'chirish
function toggleSoundFx() {
  soundFxEnabled = !soundFxEnabled;
  localStorage.setItem('meatcity_sound_fx', soundFxEnabled);
  updateSoundButtonUI();
  if (soundFxEnabled) {
    playSuccessSound();
  }
}

function updateSoundButtonUI() {
  const icon = document.getElementById('sound-icon');
  const label = document.getElementById('sound-label');
  const btn = document.getElementById('btn-sound-toggle');

  if (soundFxEnabled) {
    if (icon) icon.className = 'fa-solid fa-volume-high text-rose-400';
    if (label) label.innerText = 'Ovoz: Yoqilgan';
    if (btn) btn.classList.remove('opacity-60');
  } else {
    if (icon) icon.className = 'fa-solid fa-volume-xmark text-gray-500';
    if (label) label.innerText = 'Ovoz: O\'chirilgan';
    if (btn) btn.classList.add('opacity-60');
  }
}

// Sichqoncha bosilganda to'lqin (Ripple) va yozuv qimirlash harakatlari
function initKineticInteractions() {
  updateSoundButtonUI();

  document.addEventListener('click', (e) => {
    // 1. Sichqoncha bosilgan nuqtadan nurli to'lqin tarqalishi (Ripple Shockwave)
    createClickRipple(e.clientX, e.clientY);

    // 2. Tugma, tab yoki karta bosilganda yozuv va ikonka qimirlashi
    const targetBtn = e.target.closest('button, .nav-tab, a, .cursor-pointer, input[type="submit"]');
    if (targetBtn) {
      playClickSound();

      // Matn / yozuvga kinetik qimirlash effekti (text-jiggle) berish
      const textSpan = targetBtn.querySelector('span') || targetBtn;
      const icon = targetBtn.querySelector('i');
      
      if (textSpan && textSpan !== targetBtn) {
        textSpan.classList.remove('text-jiggle');
        void textSpan.offsetWidth;
        textSpan.classList.add('text-jiggle');
        setTimeout(() => textSpan.classList.remove('text-jiggle'), 350);
      } else {
        targetBtn.classList.remove('text-jiggle');
        void targetBtn.offsetWidth;
        targetBtn.classList.add('text-jiggle');
        setTimeout(() => targetBtn.classList.remove('text-jiggle'), 350);
      }

      if (icon) {
        icon.classList.remove('text-jiggle');
        void icon.offsetWidth;
        icon.classList.add('text-jiggle');
        setTimeout(() => icon.classList.remove('text-jiggle'), 350);
      }
    }
  }, true);
}

// Sichqoncha bosilgan joyda to'lqin (Ripple) hosil qilish
function createClickRipple(x, y) {
  if (x === undefined || y === undefined || (x === 0 && y === 0)) return;
  const ripple = document.createElement('div');
  ripple.className = 'click-ripple';
  const size = 50;
  ripple.style.width = `${size}px`;
  ripple.style.height = `${size}px`;
  ripple.style.left = `${x}px`;
  ripple.style.top = `${y}px`;
  
  document.body.appendChild(ripple);
  setTimeout(() => {
    ripple.remove();
  }, 600);
}

// ============================================================================
// 14. EXECUTIVE SPLASH SCREEN CONTROLS
// ============================================================================
let splashDismissed = false;

function initSplashScreen() {
  const bar = document.getElementById('splash-progress-bar');
  const status = document.getElementById('splash-status-text');
  const percent = document.getElementById('splash-percent-text');

  if (bar) bar.style.width = '35%';

  setTimeout(() => {
    if (splashDismissed) return;
    if (bar) bar.style.width = '75%';
    if (status) status.innerHTML = '<span class="w-2 h-2 rounded-full bg-amber-400 animate-ping"></span> 1C Registrlari tekshirilmoqda...';
    if (percent) percent.innerText = '75%';
  }, 350);

  setTimeout(() => {
    if (splashDismissed) return;
    if (bar) bar.style.width = '100%';
    if (status) status.innerHTML = '<span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span> Boshqaruv Tizimi tayyor!';
    if (percent) percent.innerText = '100%';
  }, 750);

  setTimeout(() => {
    dismissSplashScreen();
  }, 1250);
}

function dismissSplashScreen() {
  if (splashDismissed) return;
  splashDismissed = true;
  const splash = document.getElementById('app-splash-screen');
  if (splash) {
    splash.classList.add('splash-fade-out');
    setTimeout(() => {
      splash.remove();
    }, 600);
  }
}

