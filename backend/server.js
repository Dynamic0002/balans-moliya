const express = require('express');
const cors = require('cors');
const path = require('path');
const config = require('./config');
const erp = require('./erpService');

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Statik frontend fayllarni tarqatish
const frontendPath = path.join(__dirname, '..', 'frontend');
app.use(express.static(frontendPath));

// ----------------------------------------------------------------------------
// 1. DASHBOARD & SUMMARY (1C Bosh sahifasi)
// ----------------------------------------------------------------------------
app.get('/api/dashboard', (req, res) => {
  try {
    const kpi = erp.getDashboardKPI();
    res.json({ success: true, data: kpi });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/analytics', (req, res) => {
  try {
    const data = erp.getDeepAnalytics();
    res.json({ success: true, data: data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ----------------------------------------------------------------------------
// 2. NOMENKLATURA VA OMBOR (Items & Stock)
// ----------------------------------------------------------------------------
app.get('/api/items', (req, res) => {
  try {
    const items = erp.getItems(req.query.category);
    res.json({ success: true, data: items });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/items', (req, res) => {
  try {
    const item = erp.createItem(req.body);
    res.json({ success: true, data: item });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.put('/api/items/:id', (req, res) => {
  try {
    const result = erp.updateItem(req.params.id, req.body);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.post('/api/items/bulk', (req, res) => {
  try {
    const items = req.body.items || req.body;
    const result = erp.bulkCreateItems(items);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.delete('/api/items/:id', (req, res) => {
  try {
    const result = erp.deleteItem(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// ----------------------------------------------------------------------------
// 3. KONTRAGENTLAR (Mijozlar va Ta'minotchilar)
// ----------------------------------------------------------------------------
app.get('/api/counterparties', (req, res) => {
  try {
    const cps = erp.getCounterparties(req.query.type);
    res.json({ success: true, data: cps });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/counterparties', (req, res) => {
  try {
    const cp = erp.createCounterparty(req.body);
    res.json({ success: true, data: cp });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.post('/api/counterparties/bulk', (req, res) => {
  try {
    const cps = req.body.counterparties || req.body;
    const result = erp.bulkCreateCounterparties(cps);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.put('/api/counterparties/:id', (req, res) => {
  try {
    const result = erp.updateCounterparty(req.params.id, req.body);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.delete('/api/counterparties/:id', (req, res) => {
  try {
    const result = erp.deleteCounterparty(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// ----------------------------------------------------------------------------
// 4. RETSEPTURA / BOM (Me'yoriy tarkib)
// ----------------------------------------------------------------------------
app.get('/api/bom', (req, res) => {
  try {
    const boms = erp.getBOMList();
    res.json({ success: true, data: boms });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/bom', (req, res) => {
  try {
    const { finished_item_id, ingredients } = req.body;
    const result = erp.saveBOM(finished_item_id, ingredients);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// ----------------------------------------------------------------------------
// 5. KIRIM / XARIDLAR (Закупки)
// ----------------------------------------------------------------------------
app.get('/api/purchases', (req, res) => {
  try {
    const docs = erp.getPurchases();
    res.json({ success: true, data: docs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/purchases', (req, res) => {
  try {
    const result = erp.createPurchase(req.body);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.delete('/api/purchases/:id', (req, res) => {
  try {
    const result = erp.deletePurchase(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// ----------------------------------------------------------------------------
// 6. CHIQIM / SOTUVLAR (Продажи)
// ----------------------------------------------------------------------------
app.get('/api/sales', (req, res) => {
  try {
    const docs = erp.getSales();
    res.json({ success: true, data: docs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/sales', (req, res) => {
  try {
    const result = erp.createSale(req.body);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// ----------------------------------------------------------------------------
// 7. ISHLAB CHIQARISH (Производство)
// ----------------------------------------------------------------------------
app.get('/api/productions', (req, res) => {
  try {
    const docs = erp.getProductions();
    res.json({ success: true, data: docs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/productions', (req, res) => {
  try {
    const result = erp.createProduction(req.body);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// ----------------------------------------------------------------------------
// 8. PUL: KASSA VA BANK (Деньги)
// ----------------------------------------------------------------------------
app.get('/api/accounts', (req, res) => {
  try {
    const accounts = erp.getAccounts();
    res.json({ success: true, data: accounts });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/accounts', (req, res) => {
  try {
    const account = erp.createAccount(req.body);
    res.json({ success: true, data: account });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.put('/api/accounts/:id', (req, res) => {
  try {
    const result = erp.updateAccount(req.params.id, req.body);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.delete('/api/accounts/:id', (req, res) => {
  try {
    const result = erp.deleteAccount(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.get('/api/money-movements', (req, res) => {
  try {
    const movements = erp.getMoneyMovements();
    res.json({ success: true, data: movements });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/money-orders', (req, res) => {
  try {
    const result = erp.createMoneyOrder(req.body);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// ----------------------------------------------------------------------------
// 9. MOLIYAVIY HISOBOTLAR (P&L, Balans, Tovarlar qoldig'i, Sverka)
// ----------------------------------------------------------------------------
app.get('/api/reports', (req, res) => {
  try {
    const reports = erp.getFinancialReports();
    res.json({ success: true, data: reports });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/reports/sverka/:id', (req, res) => {
  try {
    const sverka = erp.getCounterpartySverka(req.params.id);
    if (!sverka) return res.status(404).json({ success: false, error: 'Kontragent topilmadi' });
    res.json({ success: true, data: sverka });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ----------------------------------------------------------------------------
// 10. BAZANI TOZALASH / NOLDAN BOSHLASH
// ----------------------------------------------------------------------------
app.post('/api/reset', (req, res) => {
  try {
    const mode = req.body.mode || 'demo'; // 'clean_zero' yoki 'demo'
    const result = erp.resetDatabase(mode);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ----------------------------------------------------------------------------
// 11. ROLLAR VA FOYDALANUVCHILAR BOSHQARUVI (RBAC & Auth)
// ----------------------------------------------------------------------------
// Avtorizatsiya (Login / PIN)
app.post('/api/auth/login', (req, res) => {
  try {
    const { username, password, pin } = req.body;
    const user = erp.loginUser(username, password, pin);
    res.json({ success: true, data: user });
  } catch (err) {
    res.status(401).json({ success: false, error: err.message });
  }
});

// Rollar CRUD
app.get('/api/roles', (req, res) => {
  try {
    const roles = erp.getRoles();
    res.json({ success: true, data: roles });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/roles', (req, res) => {
  try {
    const role = erp.createRole(req.body);
    res.json({ success: true, data: role });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.put('/api/roles/:id', (req, res) => {
  try {
    const role = erp.updateRole(req.params.id, req.body);
    res.json({ success: true, data: role });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.delete('/api/roles/:id', (req, res) => {
  try {
    const result = erp.deleteRole(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Foydalanuvchilar CRUD
app.get('/api/users', (req, res) => {
  try {
    const users = erp.getUsers();
    res.json({ success: true, data: users });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/users', (req, res) => {
  try {
    const user = erp.createUser(req.body);
    res.json({ success: true, data: user });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.put('/api/users/:id', (req, res) => {
  try {
    const user = erp.updateUser(req.params.id, req.body);
    res.json({ success: true, data: user });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.delete('/api/users/:id', (req, res) => {
  try {
    const result = erp.deleteUser(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Shartnomalar (Contracts)
app.get('/api/contracts', (req, res) => {
  try {
    const contracts = erp.getContracts(req.query.counterparty_id);
    res.json({ success: true, data: contracts });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/contracts', (req, res) => {
  try {
    const contract = erp.createContract(req.body);
    res.json({ success: true, data: contract });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Katalog Guruhlari (Справочник Групп: Ta'minotchilar va Nomenklatura)
app.get('/api/groups', (req, res) => {
  try {
    const groups = erp.getCatalogGroups(req.query.type || 'supplier');
    res.json({ success: true, data: groups });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/groups', (req, res) => {
  try {
    const group = erp.createCatalogGroup(req.body);
    res.json({ success: true, data: group });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.delete('/api/groups/:id', (req, res) => {
  try {
    const result = erp.deleteCatalogGroup(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// SPA routing (har qanday sahifani index.html ga yo'naltirish)
app.get('*', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// Serverni ishga tushirish
const PORT = config.PORT || 3000;
app.listen(PORT, () => {
  console.log('====================================================');
  console.log(`🚀 MEAT CITY Web ERP & Moliyaviy Tizim ishga tushdi!`);
  console.log(`🌐 Tizim manzili: http://localhost:${PORT}`);
  console.log(`💾 Relyatsion baza: SQLite (meatcity_erp.db)`);
  console.log('====================================================');
});
