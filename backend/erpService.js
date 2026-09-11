const { db, seedInitialData } = require('./database');

// ----------------------------------------------------------------------------
// 1. DASHBOARD KPI VA GRAFIKLAR (1C ko'rsatkichlari)
// ----------------------------------------------------------------------------
function getDashboardKPI() {
  // 1. Kassa qoldig'i (UZS)
  const cashRow = db.prepare(`
    SELECT COALESCE(SUM(balance), 0) as total 
    FROM accounts 
    WHERE type = 'cash' AND currency = 'UZS'
  `).get();

  // 2. Bank hisoblar qoldig'i (UZS)
  const bankRow = db.prepare(`
    SELECT COALESCE(SUM(balance), 0) as total 
    FROM accounts 
    WHERE type = 'bank' AND currency = 'UZS'
  `).get();

  // USD kassa
  const usdCashRow = db.prepare(`
    SELECT COALESCE(SUM(balance), 0) as total 
    FROM accounts 
    WHERE currency = 'USD'
  `).get();

  // 3. Xaridorlar qarzdorligi (Debitorlar - bizga to'lashi kerak bo'lgan pul)
  const debitorRow = db.prepare(`
    SELECT COALESCE(SUM(balance), 0) as total 
    FROM counterparties 
    WHERE balance > 0
  `).get();

  // 4. Ta'minotchilar qarzdorligi (Kreditorlar - biz to'lashimiz kerak bo'lgan qarz, odatda manfiy)
  const kreditorRow = db.prepare(`
    SELECT COALESCE(SUM(balance), 0) as total 
    FROM counterparties 
    WHERE balance < 0
  `).get();

  // 5. Sotuv dinamikasi (Kunlik)
  const salesDaily = db.prepare(`
    SELECT doc_date, SUM(total_amount) as total
    FROM documents
    WHERE doc_type = 'SALE' AND status = 'POSTED'
    GROUP BY doc_date
    ORDER BY doc_date ASC
  `).all();

  // 6. Top sotilayotgan tovarlar
  const topProducts = db.prepare(`
    SELECT i.name, SUM(di.quantity) as total_qty, SUM(di.total_price) as total_sum
    FROM document_items di
    JOIN documents d ON di.document_id = d.id
    JOIN items i ON di.item_id = i.id
    WHERE d.doc_type = 'SALE' AND d.status = 'POSTED'
    GROUP BY i.id, i.name
    ORDER BY total_sum DESC
    LIMIT 15
  `).all();

  // 7. Ombor zaxiralari qiymati
  const stockSummary = db.prepare(`
    SELECT 
      category,
      COUNT(*) as count,
      SUM(stock_qty) as total_qty,
      SUM(stock_qty * cost_price) as total_value
    FROM items
    GROUP BY category
  `).all();

  // "Подробно" (Batafsil) modallari uchun ro'yxatlar:
  const cashAccountsList = db.prepare(`SELECT * FROM accounts WHERE type = 'cash'`).all();
  const bankAccountsList = db.prepare(`SELECT * FROM accounts WHERE type = 'bank'`).all();
  const customersList = db.prepare(`SELECT * FROM counterparties WHERE balance > 0 ORDER BY balance DESC`).all();
  const suppliersList = db.prepare(`SELECT * FROM counterparties WHERE balance < 0 ORDER BY balance ASC`).all();

  // Chuqur analitika: Top tovarlar, Muzlagan tovarlar, Top xomashyo, Muzlagan xomashyo
  const analytics = getDeepAnalytics();

  return {
    kassa_total: cashRow.total,
    bank_total: bankRow.total,
    usd_kassa: usdCashRow.total,
    debitor_total: debitorRow.total,
    kreditor_total: kreditorRow.total,
    sales_daily: salesDaily,
    top_products: topProducts,
    stock_summary: stockSummary,
    analytics: analytics,
    details: {
      cash_accounts: cashAccountsList,
      bank_accounts: bankAccountsList,
      customers: customersList,
      suppliers: suppliersList
    }
  };
}

// ----------------------------------------------------------------------------
// CHUQUR ANALITIKA (TOP VA MUZLAGAN TOVARLAR / XOMASHYOLAR)
// ----------------------------------------------------------------------------
function getDeepAnalytics() {
  // 1. TOP SOTUVLAR: Eng ko'p sotilgan va daromad keltirgan tayyor tovarlar
  const topSelling = db.prepare(`
    SELECT i.id, i.name, i.unit, i.stock_qty, i.cost_price, i.sale_price,
           COALESCE(SUM(di.quantity), 0) as sold_qty,
           COALESCE(SUM(di.total_price), 0) as total_revenue,
           COALESCE(SUM(di.quantity * i.cost_price), 0) as total_cogs,
           COALESCE(SUM(di.total_price - (di.quantity * i.cost_price)), 0) as total_profit
    FROM items i
    JOIN document_items di ON i.id = di.item_id
    JOIN documents d ON di.document_id = d.id AND d.doc_type = 'SALE' AND d.status = 'POSTED'
    WHERE i.category = 'finished'
    GROUP BY i.id, i.name
    ORDER BY total_revenue DESC
    LIMIT 10
  `).all();

  topSelling.forEach(item => {
    item.margin_pct = item.total_revenue > 0 ? ((item.total_profit / item.total_revenue) * 100).toFixed(1) : 0;
  });

  // 2. MUZLAGAN TAYYOR MAHSULOTLAR: Omborda bor, lekin sotilmay yotgan yoki aylanmasi past
  const allFinished = db.prepare(`
    SELECT i.id, i.name, i.unit, i.stock_qty, i.cost_price, i.sale_price,
           (i.stock_qty * i.cost_price) as frozen_capital,
           COALESCE(SUM(di.quantity), 0) as sold_qty
    FROM items i
    LEFT JOIN document_items di ON i.id = di.item_id
    LEFT JOIN documents d ON di.document_id = d.id AND d.doc_type = 'SALE' AND d.status = 'POSTED'
    WHERE i.category = 'finished' AND i.stock_qty > 0
    GROUP BY i.id, i.name
    ORDER BY sold_qty ASC, frozen_capital DESC
  `).all();

  // Sotilmagan yoki ombordagi soni sotuvidan ancha ko'p bo'lgan mahsulotlar
  const deadFinished = allFinished.filter(item => {
    return item.sold_qty === 0 || item.stock_qty >= 5000;
  });

  // 3. TOP XOMASHYOLAR: Ishlab chiqarishda eng ko'p ishlatilgan va asosiy xomashyolar
  const topRaw = db.prepare(`
    SELECT i.id, i.name, i.unit, i.stock_qty, i.cost_price,
           COALESCE(SUM(sm.quantity), 0) as consumed_qty,
           COALESCE(SUM(sm.total_cost), 0) as total_consumed_cost
    FROM items i
    LEFT JOIN stock_movements sm ON i.id = sm.item_id AND sm.movement_type = 'OUT' AND sm.notes LIKE '%Ishlab chiqarish%'
    WHERE i.category IN ('raw', 'packaging')
    GROUP BY i.id, i.name
    ORDER BY total_consumed_cost DESC, consumed_qty DESC
    LIMIT 10
  `).all();

  // 4. MUZLAGAN XOMASHYOLAR: Omborda yotgan, lekin ishlab chiqarishga kirmagan / kam sarflangan
  const allRaw = db.prepare(`
    SELECT i.id, i.name, i.unit, i.stock_qty, i.cost_price,
           (i.stock_qty * i.cost_price) as frozen_capital,
           COALESCE(SUM(sm.quantity), 0) as consumed_qty
    FROM items i
    LEFT JOIN stock_movements sm ON i.id = sm.item_id AND sm.movement_type = 'OUT' AND sm.notes LIKE '%Ishlab chiqarish%'
    WHERE i.category IN ('raw', 'packaging') AND i.stock_qty > 0
    GROUP BY i.id, i.name
    ORDER BY consumed_qty ASC, frozen_capital DESC
  `).all();

  // Ishlatilmagan (consumed_qty = 0) yoki katta miqdorda muzlab yotgan xomashyolar
  const deadRaw = allRaw.filter(item => item.consumed_qty === 0 || item.stock_qty > 20000);

  // Umumiy hisob-kitoblar
  const totalFrozenFinished = deadFinished.reduce((sum, it) => sum + (it.frozen_capital || 0), 0);
  const totalFrozenRaw = deadRaw.reduce((sum, it) => sum + (it.frozen_capital || 0), 0);
  const totalFrozenSum = totalFrozenFinished + totalFrozenRaw;

  return {
    top_selling: topSelling,
    dead_finished: deadFinished,
    top_raw: topRaw,
    dead_raw: deadRaw,
    total_frozen_finished: totalFrozenFinished,
    total_frozen_raw: totalFrozenRaw,
    total_frozen_sum: totalFrozenSum
  };
}

// ----------------------------------------------------------------------------
// 2. NOMENKLATURA (ITEMS)
// ----------------------------------------------------------------------------
function getItems(category = null) {
  if (category) {
    return db.prepare('SELECT * FROM items WHERE category = ? ORDER BY name ASC').all(category);
  }
  return db.prepare('SELECT * FROM items ORDER BY category, name ASC').all();
}

function createItem(data) {
  const groupName = (data.group_name || '').trim();
  const stmt = db.prepare(`
    INSERT INTO items (name, category, unit, stock_qty, cost_price, sale_price, min_limit, group_name)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    data.name,
    data.category || 'raw',
    data.unit || 'kg',
    Number(data.stock_qty) || 0,
    Number(data.cost_price) || 0,
    Number(data.sale_price) || 0,
    Number(data.min_limit) || 0,
    groupName
  );

  // Guruh kiritilgan bo'lsa, uni catalog_groups jadvaliga ham qayd qilamiz
  if (groupName) {
    try {
      db.prepare('INSERT OR IGNORE INTO catalog_groups (name, type) VALUES (?, ?)').run(groupName, 'item');
    } catch (e) {}
  }

  return { id: result.lastInsertRowid, ...data, group_name: groupName };
}

function updateItem(id, data) {
  const groupName = (data.group_name !== undefined ? data.group_name : '').trim();
  const stmt = db.prepare(`
    UPDATE items 
    SET name = ?, category = ?, unit = ?, stock_qty = ?, cost_price = ?, sale_price = ?, min_limit = ?, group_name = ?
    WHERE id = ?
  `);
  stmt.run(
    data.name,
    data.category,
    data.unit,
    Number(data.stock_qty),
    Number(data.cost_price),
    Number(data.sale_price),
    Number(data.min_limit),
    groupName,
    id
  );

  if (groupName) {
    try {
      db.prepare('INSERT OR IGNORE INTO catalog_groups (name, type) VALUES (?, ?)').run(groupName, 'item');
    } catch (e) {}
  }

  return { success: true };
}

function deleteItem(id) {
  db.prepare('DELETE FROM items WHERE id = ?').run(id);
  return { success: true };
}

// ----------------------------------------------------------------------------
// 3. KONTRAGENTLAR (Mijozlar va Ta'minotchilar)
// ----------------------------------------------------------------------------
function getCounterparties(type = null) {
  if (type) {
    return db.prepare('SELECT * FROM counterparties WHERE type = ? OR type = "both" ORDER BY name ASC').all(type);
  }
  return db.prepare('SELECT * FROM counterparties ORDER BY name ASC').all();
}

function createCounterparty(data) {
  const groupName = (data.group_name || data.category_group || '').trim();
  const stmt = db.prepare(`
    INSERT INTO counterparties (name, type, phone, address, balance, inn, group_name, category_group)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    data.name,
    data.type || 'customer',
    data.phone || '',
    data.address || '',
    Number(data.balance) || 0,
    data.inn || '',
    groupName,
    groupName
  );

  if (groupName && (data.type === 'supplier' || data.type === 'both')) {
    try {
      db.prepare('INSERT OR IGNORE INTO catalog_groups (name, type) VALUES (?, ?)').run(groupName, 'supplier');
    } catch (e) {}
  }

  return { id: result.lastInsertRowid, ...data, group_name: groupName, category_group: groupName };
}

function updateCounterparty(id, data) {
  const groupName = (data.group_name !== undefined ? data.group_name : (data.category_group || '')).trim();
  const stmt = db.prepare(`
    UPDATE counterparties 
    SET name = ?, type = ?, phone = ?, address = ?, inn = ?, group_name = ?, category_group = ?
    WHERE id = ?
  `);
  stmt.run(data.name, data.type, data.phone || '', data.address || '', data.inn || '', groupName, groupName, id);

  if (groupName && (data.type === 'supplier' || data.type === 'both')) {
    try {
      db.prepare('INSERT OR IGNORE INTO catalog_groups (name, type) VALUES (?, ?)').run(groupName, 'supplier');
    } catch (e) {}
  }

  return { success: true };
}

function deleteCounterparty(id) {
  db.prepare('DELETE FROM counterparties WHERE id = ?').run(id);
  return { success: true };
}

// ----------------------------------------------------------------------------
// 3.1 KATALOG GURUHLARI (Справочник Групп - Ta'minotchilar va Nomenklatura)
// ----------------------------------------------------------------------------
function getCatalogGroups(type = 'supplier') {
  const targetType = type === 'supplier' ? 'supplier' : 'item';
  const sourceTable = targetType === 'supplier' ? 'counterparties' : 'items';

  // 1. catalog_groups jadvalidan olish
  let groups = db.prepare('SELECT * FROM catalog_groups WHERE type = ? ORDER BY name ASC').all(targetType);

  // 2. Kontragentlar yoki Nomenklaturada mavjud, lekin guruhlar jadvaliga kirmagan nomlarni tekshirish
  try {
    const existingRows = db.prepare(`
      SELECT DISTINCT group_name FROM ${sourceTable} 
      WHERE group_name IS NOT NULL AND TRIM(group_name) != ''
    `).all();

    const existingNames = new Set(groups.map(g => g.name.trim().toLowerCase()));
    for (const row of existingRows) {
      const gName = (row.group_name || '').trim();
      if (gName && !existingNames.has(gName.toLowerCase())) {
        try {
          const ins = db.prepare('INSERT OR IGNORE INTO catalog_groups (name, type) VALUES (?, ?)');
          ins.run(gName, targetType);
          existingNames.add(gName.toLowerCase());
        } catch (e) {}
      }
    }
    // Qayta yangilangan ro'yxatni olish
    groups = db.prepare('SELECT * FROM catalog_groups WHERE type = ? ORDER BY name ASC').all(targetType);
  } catch (e) {}

  // 3. Har bir guruhdagi tovarlar yoki ta'minotchilar sonini hisoblash
  return groups.map(g => {
    let cnt = 0;
    try {
      const countRow = db.prepare(`
        SELECT COUNT(*) as cnt FROM ${sourceTable}
        WHERE LOWER(TRIM(group_name)) = LOWER(TRIM(?))
      `).get(g.name);
      cnt = countRow ? countRow.cnt : 0;
    } catch (e) {}

    return {
      id: g.id,
      name: g.name,
      type: g.type,
      count: cnt
    };
  });
}

function createCatalogGroup(data) {
  const name = (data.name || '').trim();
  const type = data.type === 'supplier' ? 'supplier' : 'item';
  if (!name) throw new Error('Guruh nomi kiritilishi shart!');

  const stmt = db.prepare('INSERT OR IGNORE INTO catalog_groups (name, type) VALUES (?, ?)');
  stmt.run(name, type);

  const group = db.prepare('SELECT * FROM catalog_groups WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) AND type = ?').get(name, type);
  return {
    id: group ? group.id : null,
    name: group ? group.name : name,
    type: type,
    count: 0
  };
}

function deleteCatalogGroup(id) {
  const grp = db.prepare('SELECT * FROM catalog_groups WHERE id = ?').get(id);
  if (grp) {
    const sourceTable = grp.type === 'supplier' ? 'counterparties' : 'items';
    try {
      db.prepare(`UPDATE ${sourceTable} SET group_name = '' WHERE LOWER(TRIM(group_name)) = LOWER(TRIM(?))`).run(grp.name);
    } catch (e) {}
    db.prepare('DELETE FROM catalog_groups WHERE id = ?').run(id);
  }
  return { success: true };
}

// Bulk Excel Import: Nomenklatura
function bulkCreateItems(itemsList) {
  let createdCount = 0;
  let updatedCount = 0;

  db.exec('BEGIN TRANSACTION');
  try {
    const checkStmt = db.prepare('SELECT id FROM items WHERE LOWER(name) = LOWER(?)');
    const updateStmt = db.prepare(`
      UPDATE items SET category = ?, unit = ?, stock_qty = ?, cost_price = ?, sale_price = ? WHERE id = ?
    `);
    const insertStmt = db.prepare(`
      INSERT INTO items (name, category, unit, stock_qty, cost_price, sale_price)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    for (const it of itemsList) {
      if (!it.name || !it.name.trim()) continue;
      const name = it.name.trim();
      const category = it.category || 'raw';
      const unit = it.unit || 'kg';
      const stock_qty = Number(it.stock_qty) || 0;
      const cost_price = Number(it.cost_price) || 0;
      const sale_price = Number(it.sale_price) || 0;

      const existing = checkStmt.get(name);
      if (existing) {
        updateStmt.run(category, unit, stock_qty, cost_price, sale_price, existing.id);
        updatedCount++;
      } else {
        insertStmt.run(name, category, unit, stock_qty, cost_price, sale_price);
        createdCount++;
      }
    }
    db.exec('COMMIT');
    return { success: true, createdCount, updatedCount, total: createdCount + updatedCount };
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

// Bulk Excel Import: Kontragentlar
function bulkCreateCounterparties(cpList) {
  let createdCount = 0;
  let updatedCount = 0;

  db.exec('BEGIN TRANSACTION');
  try {
    const checkStmt = db.prepare('SELECT id FROM counterparties WHERE LOWER(name) = LOWER(?)');
    const updateStmt = db.prepare(`
      UPDATE counterparties SET type = ?, phone = ?, address = ?, balance = ?, inn = ? WHERE id = ?
    `);
    const insertStmt = db.prepare(`
      INSERT INTO counterparties (name, type, phone, address, balance, inn)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    for (const cp of cpList) {
      if (!cp.name || !cp.name.trim()) continue;
      const name = cp.name.trim();
      const type = cp.type || 'customer';
      const phone = cp.phone || '';
      const address = cp.address || '';
      const balance = Number(cp.balance) || 0;
      const inn = cp.inn || '';

      const existing = checkStmt.get(name);
      if (existing) {
        updateStmt.run(type, phone, address, balance, inn, existing.id);
        updatedCount++;
      } else {
        insertStmt.run(name, type, phone, address, balance, inn);
        createdCount++;
      }
    }
    db.exec('COMMIT');
    return { success: true, createdCount, updatedCount, total: createdCount + updatedCount };
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

function createAccount(data) {
  const stmt = db.prepare(`
    INSERT INTO accounts (name, type, currency, balance, account_number)
    VALUES (?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    data.name,
    data.type || 'cash',
    data.currency || 'UZS',
    Number(data.balance) || 0,
    data.account_number || ''
  );
  return { id: result.lastInsertRowid, ...data };
}

function updateAccount(id, data) {
  const stmt = db.prepare(`
    UPDATE accounts SET name = ?, type = ?, currency = ?, balance = ?, account_number = ? WHERE id = ?
  `);
  stmt.run(data.name, data.type, data.currency, Number(data.balance), data.account_number || '', id);
  return { success: true };
}

function deleteAccount(id) {
  db.prepare('DELETE FROM accounts WHERE id = ?').run(id);
  return { success: true };
}

// ----------------------------------------------------------------------------
// 4. RETSEPTURA / BOM (Me'yoriy Tarkib)
// ----------------------------------------------------------------------------
function getBOMList() {
  const finishedItems = db.prepare("SELECT * FROM items WHERE category = 'finished' ORDER BY name ASC").all();
  return finishedItems.map(item => {
    const ingredients = db.prepare(`
      SELECT b.id as bom_id, b.quantity, r.id as raw_id, r.name as raw_name, r.unit, r.cost_price,
             (b.quantity * r.cost_price) as ingredient_cost
      FROM bom b
      JOIN items r ON b.raw_item_id = r.id
      WHERE b.finished_item_id = ?
    `).all(item.id);

    const calculated_cost = ingredients.reduce((sum, ing) => sum + (ing.ingredient_cost || 0), 0);

    return {
      ...item,
      ingredients,
      calculated_cost
    };
  });
}

function saveBOM(finishedItemId, ingredients) {
  db.exec('BEGIN TRANSACTION');
  try {
    db.prepare('DELETE FROM bom WHERE finished_item_id = ?').run(finishedItemId);
    const insertStmt = db.prepare('INSERT INTO bom (finished_item_id, raw_item_id, quantity) VALUES (?, ?, ?)');
    for (const ing of ingredients) {
      if (ing.raw_item_id && Number(ing.quantity) > 0) {
        insertStmt.run(finishedItemId, ing.raw_item_id, Number(ing.quantity));
      }
    }
    db.exec('COMMIT');
    return { success: true };
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

// ----------------------------------------------------------------------------
// 5. KIRIM / XARIDLAR (Закупки)
// ----------------------------------------------------------------------------
function getPurchases() {
  const docs = db.prepare(`
    SELECT d.*, c.name as counterparty_name, a.name as account_name
    FROM documents d
    LEFT JOIN counterparties c ON d.counterparty_id = c.id
    LEFT JOIN accounts a ON d.account_id = a.id
    WHERE d.doc_type = 'PURCHASE'
    ORDER BY d.doc_date DESC, d.id DESC
  `).all();

  return docs.map(doc => {
    const items = db.prepare(`
      SELECT di.*, i.name as item_name, i.unit
      FROM document_items di
      JOIN items i ON di.item_id = i.id
      WHERE di.document_id = ?
    `).all(doc.id);
    return { ...doc, items };
  });
}

function createPurchase(data) {
  db.exec('BEGIN TRANSACTION');
  try {
    const docNumber = data.doc_number || `KIR-${Date.now().toString().slice(-6)}`;
    const docDate = data.doc_date || new Date().toISOString().slice(0, 10);
    const counterpartyId = data.counterparty_id;
    const accountId = data.account_id || null; // Agar to'lov darhol qilingan bo'lsa
    const items = data.items || [];
    const status = data.status || 'POSTED';

    let totalAmount = 0;
    for (const it of items) {
      const qty = Number(it.quantity) || 0;
      const price = Number(it.unit_price) || 0;
      const discount = Number(it.discount_amount) || 0;
      totalAmount += Math.max(0, (qty * price) - discount);
    }

    const warehouse = data.warehouse || '<склад в табличной части>';
    const operationType = data.operation_type || 'Поступление от поставщика';
    const author = data.author || 'Yuk qabul qilish bo\'limi';
    const currency = data.currency || 'UZS';
    const incomingNumber = data.incoming_number || '';
    const incomingDate = data.incoming_date || null;
    const organization = data.organization || 'ZAVOD';
    const contractId = data.contract_id || null;
    const contractName = data.contract_name || '';
    const exchangeRate = Number(data.exchange_rate) || 1;

    // 1. Hujjat yaratish
    const docStmt = db.prepare(`
      INSERT INTO documents (doc_number, doc_type, doc_date, counterparty_id, account_id, total_amount, status, notes, warehouse, operation_type, author, currency, incoming_number, incoming_date, organization, contract_id, contract_name, exchange_rate)
      VALUES (?, 'PURCHASE', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const docResult = docStmt.run(docNumber, docDate, counterpartyId, accountId, totalAmount, status, data.notes || 'Kirim nakladnoyi', warehouse, operationType, author, currency, incomingNumber, incomingDate, organization, contractId, contractName, exchangeRate);
    const documentId = docResult.lastInsertRowid;

    // 2. Qatorlar va Ombor harakati
    const docItemStmt = db.prepare(`
      INSERT INTO document_items (document_id, item_id, quantity, unit_price, total_price, barcode, gross_weight, tare_weight, discount_percent, discount_amount, custom_price, custom_price2)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const stockMovStmt = db.prepare(`
      INSERT INTO stock_movements (document_id, item_id, movement_type, quantity, unit_cost, total_cost, movement_date, notes)
      VALUES (?, ?, 'IN', ?, ?, ?, ?, ?)
    `);

    for (const it of items) {
      const qty = Number(it.quantity) || 0;
      const price = Number(it.unit_price) || 0;
      const discountPercent = Number(it.discount_percent) || 0;
      const discountAmount = Number(it.discount_amount) || 0;
      const rowTotal = Math.max(0, (qty * price) - discountAmount);
      const barcode = it.barcode || '';
      const grossWeight = Number(it.gross_weight) || 0;
      const tareWeight = Number(it.tare_weight) || 0;
      const customPrice = Number(it.custom_price) || 0;
      const customPrice2 = Number(it.custom_price2) || 0;

      docItemStmt.run(documentId, it.item_id, qty, price, rowTotal, barcode, grossWeight, tareWeight, discountPercent, discountAmount, customPrice, customPrice2);

      if (status === 'POSTED') {
        stockMovStmt.run(documentId, it.item_id, qty, price, rowTotal, docDate, "Kirim hujjati bo'yicha");

        // Ombor qoldig'i va o'rtacha tannarxni yangilash (Weighted Average Cost)
        const currentItem = db.prepare('SELECT stock_qty, cost_price FROM items WHERE id = ?').get(it.item_id);
        if (currentItem) {
          const currentQty = currentItem.stock_qty || 0;
          const currentCost = currentItem.cost_price || 0;
          const newQty = currentQty + qty;
          const newCost = newQty > 0 ? ((currentQty * currentCost) + (qty * price)) / newQty : price;

          db.prepare('UPDATE items SET stock_qty = ?, cost_price = ? WHERE id = ?').run(newQty, newCost, it.item_id);
        }
      }
    }

    if (status === 'POSTED') {
      // 3. Ta'minotchi balansi (Kreditorlik qarzi oshadi: -totalAmount)
      if (counterpartyId) {
        db.prepare('UPDATE counterparties SET balance = balance - ? WHERE id = ?').run(totalAmount, counterpartyId);
      }

      // 4. Agar hisobdan to'lov qilingan bo'lsa (Naqd yoki Bank)
      if (accountId) {
        db.prepare('UPDATE accounts SET balance = balance - ? WHERE id = ?').run(totalAmount, accountId);
        if (counterpartyId) {
          db.prepare('UPDATE counterparties SET balance = balance + ? WHERE id = ?').run(totalAmount, counterpartyId);
        }
        db.prepare(`
          INSERT INTO money_movements (document_id, account_id, counterparty_id, movement_type, amount, category, movement_date, notes)
          VALUES (?, ?, ?, 'OUT', ?, 'SUPPLIER_PAYMENT', ?, ?)
        `).run(documentId, accountId, counterpartyId, totalAmount, docDate, "Kirim nakladnoyi to'lovi");
      }
    }

    db.exec('COMMIT');
    return { success: true, document_id: documentId, doc_number: docNumber, total_amount: totalAmount, status };
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

function deletePurchase(id) {
  db.exec('BEGIN TRANSACTION');
  try {
    const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(id);
    if (!doc) throw new Error('Hujjat topilmadi');

    // 1. Ombor harakatlarini qaytarish
    const stockMovs = db.prepare('SELECT * FROM stock_movements WHERE document_id = ?').all(id);
    for (const mov of stockMovs) {
      db.prepare('UPDATE items SET stock_qty = MAX(0, stock_qty - ?) WHERE id = ?').run(mov.quantity, mov.item_id);
    }

    // 2. Pul harakatini qaytarish
    const moneyMovs = db.prepare('SELECT * FROM money_movements WHERE document_id = ?').all(id);
    for (const mm of moneyMovs) {
      if (mm.movement_type === 'OUT') {
        db.prepare('UPDATE accounts SET balance = balance + ? WHERE id = ?').run(mm.amount, mm.account_id);
      }
    }

    // 3. Kontragent balansi
    if (doc.counterparty_id && !doc.account_id) {
      db.prepare('UPDATE counterparties SET balance = balance + ? WHERE id = ?').run(doc.total_amount, doc.counterparty_id);
    }

    db.prepare('DELETE FROM money_movements WHERE document_id = ?').run(id);
    db.prepare('DELETE FROM stock_movements WHERE document_id = ?').run(id);
    db.prepare('DELETE FROM document_items WHERE document_id = ?').run(id);
    db.prepare('DELETE FROM documents WHERE id = ?').run(id);

    db.exec('COMMIT');
    return { success: true };
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

// ----------------------------------------------------------------------------
// 6. CHIQIM / SOTUVLAR (Продажи)
// ----------------------------------------------------------------------------
function getSales() {
  const docs = db.prepare(`
    SELECT d.*, c.name as counterparty_name, a.name as account_name
    FROM documents d
    LEFT JOIN counterparties c ON d.counterparty_id = c.id
    LEFT JOIN accounts a ON d.account_id = a.id
    WHERE d.doc_type = 'SALE'
    ORDER BY d.doc_date DESC, d.id DESC
  `).all();

  return docs.map(doc => {
    const items = db.prepare(`
      SELECT di.*, i.name as item_name, i.unit, i.cost_price
      FROM document_items di
      JOIN items i ON di.item_id = i.id
      WHERE di.document_id = ?
    `).all(doc.id);
    return { ...doc, items };
  });
}

function createSale(data) {
  db.exec('BEGIN TRANSACTION');
  try {
    const docNumber = data.doc_number || `SOT-${Date.now().toString().slice(-6)}`;
    const docDate = data.doc_date || new Date().toISOString().slice(0, 10);
    const counterpartyId = data.counterparty_id;
    const accountId = data.account_id || null;
    const items = data.items || [];

    let totalAmount = 0;
    for (const it of items) {
      totalAmount += (Number(it.quantity) * Number(it.unit_price));
    }

    // 1. Hujjat yaratish
    const docStmt = db.prepare(`
      INSERT INTO documents (doc_number, doc_type, doc_date, counterparty_id, account_id, total_amount, status, notes)
      VALUES (?, 'SALE', ?, ?, ?, ?, 'POSTED', ?)
    `);
    const docResult = docStmt.run(docNumber, docDate, counterpartyId, accountId, totalAmount, data.notes || 'Sotuv nakladnoyi');
    const documentId = docResult.lastInsertRowid;

    // 2. Qatorlar va Ombor harakati
    const docItemStmt = db.prepare(`
      INSERT INTO document_items (document_id, item_id, quantity, unit_price, total_price)
      VALUES (?, ?, ?, ?, ?)
    `);

    const stockMovStmt = db.prepare(`
      INSERT INTO stock_movements (document_id, item_id, movement_type, quantity, unit_cost, total_cost, movement_date, notes)
      VALUES (?, ?, 'OUT', ?, ?, ?, ?, 'Sotuv chiqimi')
    `);

    for (const it of items) {
      const qty = Number(it.quantity);
      const price = Number(it.unit_price);
      const rowTotal = qty * price;

      const currentItem = db.prepare('SELECT stock_qty, cost_price FROM items WHERE id = ?').get(it.item_id);
      const itemCost = currentItem ? currentItem.cost_price : 0;

      docItemStmt.run(documentId, it.item_id, qty, price, rowTotal);
      stockMovStmt.run(documentId, it.item_id, qty, itemCost, qty * itemCost, docDate);

      // Ombor qoldig'idan chiqarish
      db.prepare('UPDATE items SET stock_qty = stock_qty - ? WHERE id = ?').run(qty, it.item_id);
    }

    // 3. Xaridor qarzdorligi (Debitorlik oshadi: +totalAmount)
    if (counterpartyId) {
      db.prepare('UPDATE counterparties SET balance = balance + ? WHERE id = ?').run(totalAmount, counterpartyId);
    }

    // 4. Agar to'lov naqd/bank orqali qabul qilingan bo'lsa
    if (accountId) {
      db.prepare('UPDATE accounts SET balance = balance + ? WHERE id = ?').run(totalAmount, accountId);
      if (counterpartyId) {
        db.prepare('UPDATE counterparties SET balance = balance - ? WHERE id = ?').run(totalAmount, counterpartyId);
      }
      db.prepare(`
        INSERT INTO money_movements (document_id, account_id, counterparty_id, movement_type, amount, category, movement_date, notes)
        VALUES (?, ?, ?, 'IN', ?, 'SALES_INCOME', ?, ?)
      `).run(documentId, accountId, counterpartyId, totalAmount, docDate, "Sotuvdan to'lov qabul qilindi");
    }

    db.exec('COMMIT');
    return { success: true, document_id: documentId, doc_number: docNumber, total_amount: totalAmount };
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

// ----------------------------------------------------------------------------
// 7. ISHLAB CHIQARISH (Производство)
// ----------------------------------------------------------------------------
function getProductions() {
  const docs = db.prepare(`
    SELECT d.*, i.name as finished_good_name, i.unit as finished_good_unit, di.quantity as produced_qty, di.unit_price as unit_cost
    FROM documents d
    JOIN document_items di ON d.id = di.document_id
    JOIN items i ON di.item_id = i.id
    WHERE d.doc_type = 'PRODUCTION'
    ORDER BY d.doc_date DESC, d.id DESC
  `).all();

  return docs.map(doc => {
    // Ishlab chiqarishga sarflangan xomashyolar ro'yxati
    const rawMovements = db.prepare(`
      SELECT sm.*, i.name as raw_name, i.unit as raw_unit
      FROM stock_movements sm
      JOIN items i ON sm.item_id = i.id
      WHERE sm.document_id = ? AND sm.movement_type = 'OUT'
    `).all(doc.id);

    return { ...doc, consumed_raw: rawMovements };
  });
}

function createProduction(data) {
  db.exec('BEGIN TRANSACTION');
  try {
    const docNumber = data.doc_number || `PRD-${Date.now().toString().slice(-6)}`;
    const docDate = data.doc_date || new Date().toISOString().slice(0, 10);
    const finishedItemId = Number(data.finished_item_id);
    const producedQty = Number(data.quantity);

    if (!finishedItemId || producedQty <= 0) {
      throw new Error('Tayyor mahsulot va miqdori to\'g\'ri ko\'rsatilmadi');
    }

    // Retseptni olamiz
    const bomIngredients = db.prepare(`
      SELECT b.raw_item_id, b.quantity, r.name, r.cost_price, r.stock_qty
      FROM bom b
      JOIN items r ON b.raw_item_id = r.id
      WHERE b.finished_item_id = ?
    `).all(finishedItemId);

    if (bomIngredients.length === 0) {
      throw new Error('Ushbu tayyor mahsulot uchun retseptura (BOM) topilmadi! Avval retseptni kiriting.');
    }

    // Jami tannarxni hisoblaymiz
    let totalBatchCost = 0;
    const rawRequirements = [];

    for (const ing of bomIngredients) {
      const neededQty = ing.quantity * producedQty;
      const costPerUnit = ing.cost_price || 0;
      const totalCost = neededQty * costPerUnit;
      totalBatchCost += totalCost;

      rawRequirements.push({
        raw_item_id: ing.raw_item_id,
        quantity: neededQty,
        unit_cost: costPerUnit,
        total_cost: totalCost
      });
    }

    const calculatedUnitCost = totalBatchCost / producedQty;

    // 1. Ishlab chiqarish hujjati
    const docStmt = db.prepare(`
      INSERT INTO documents (doc_number, doc_type, doc_date, total_amount, status, notes)
      VALUES (?, 'PRODUCTION', ?, ?, 'POSTED', ?)
    `);
    const docResult = docStmt.run(docNumber, docDate, totalBatchCost, data.notes || 'Ishlab chiqarish (Vipusk)');
    const documentId = docResult.lastInsertRowid;

    // 2. Tayyor mahsulotni hujjatga kiritish (document_items)
    db.prepare(`
      INSERT INTO document_items (document_id, item_id, quantity, unit_price, total_price)
      VALUES (?, ?, ?, ?, ?)
    `).run(documentId, finishedItemId, producedQty, calculatedUnitCost, totalBatchCost);

    // 3. Xomashyoni hisobdan chiqarish (Списание сырья)
    const stockMovStmt = db.prepare(`
      INSERT INTO stock_movements (document_id, item_id, movement_type, quantity, unit_cost, total_cost, movement_date, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const req of rawRequirements) {
      stockMovStmt.run(documentId, req.raw_item_id, 'OUT', req.quantity, req.unit_cost, req.total_cost, docDate, 'Ishlab chiqarish sarfi');
      // Ombordan xomashyo sonini kamaytirish
      db.prepare('UPDATE items SET stock_qty = stock_qty - ? WHERE id = ?').run(req.quantity, req.raw_item_id);
    }

    // 4. Tayyor mahsulotni omborga kirim qilish (Выпуск готовой продукции)
    stockMovStmt.run(documentId, finishedItemId, 'IN', producedQty, calculatedUnitCost, totalBatchCost, docDate, 'Tayyor mahsulot chiqarilishi');

    // Tayyor mahsulot qoldig'i va o'rtacha tannarxini yangilash
    const currentFinished = db.prepare('SELECT stock_qty, cost_price FROM items WHERE id = ?').get(finishedItemId);
    if (currentFinished) {
      const curQty = currentFinished.stock_qty || 0;
      const curCost = currentFinished.cost_price || 0;
      const newQty = curQty + producedQty;
      const newCost = newQty > 0 ? ((curQty * curCost) + (producedQty * calculatedUnitCost)) / newQty : calculatedUnitCost;

      db.prepare('UPDATE items SET stock_qty = ?, cost_price = ? WHERE id = ?').run(newQty, newCost, finishedItemId);
    }

    db.exec('COMMIT');
    return {
      success: true,
      document_id: documentId,
      doc_number: docNumber,
      produced_qty: producedQty,
      calculated_unit_cost: calculatedUnitCost,
      total_cost: totalBatchCost
    };
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

// ----------------------------------------------------------------------------
// 8. PUL / KASSA VA BANK (Деньги)
// ----------------------------------------------------------------------------
function getAccounts() {
  return db.prepare('SELECT * FROM accounts ORDER BY type, name ASC').all();
}

function getMoneyMovements() {
  return db.prepare(`
    SELECT mm.*, a.name as account_name, a.currency, c.name as counterparty_name
    FROM money_movements mm
    JOIN accounts a ON mm.account_id = a.id
    LEFT JOIN counterparties c ON mm.counterparty_id = c.id
    ORDER BY mm.movement_date DESC, mm.id DESC
  `).all();
}

function createMoneyOrder(data) {
  db.exec('BEGIN TRANSACTION');
  try {
    const accountId = Number(data.account_id);
    const counterpartyId = data.counterparty_id ? Number(data.counterparty_id) : null;
    const type = data.type; // 'IN' (Kirim) yoki 'OUT' (Chiqim)
    const amount = Number(data.amount);
    const category = data.category || 'OTHER';
    const date = data.date || new Date().toISOString().slice(0, 10);
    const notes = data.notes || '';

    if (!accountId || amount <= 0) {
      throw new Error('Hisob va to\'g\'ri summa ko\'rsatilmadi');
    }

    // 1. Kassa/Bank qoldig'ini o'zgartirish
    if (type === 'IN') {
      db.prepare('UPDATE accounts SET balance = balance + ? WHERE id = ?').run(amount, accountId);
      // Agar xaridordan qarz to'lovi tushsa, mijoz qarzi kamayadi
      if (counterpartyId) {
        db.prepare('UPDATE counterparties SET balance = balance - ? WHERE id = ?').run(amount, counterpartyId);
      }
    } else if (type === 'OUT') {
      db.prepare('UPDATE accounts SET balance = balance - ? WHERE id = ?').run(amount, accountId);
      // Agar ta'minotchiga qarz to'lansa, bizning qarzimiz kamayadi
      if (counterpartyId) {
        db.prepare('UPDATE counterparties SET balance = balance + ? WHERE id = ?').run(amount, counterpartyId);
      }
    } else {
      throw new Error('Noto\'g\'ri operatsiya turi (faqat IN yoki OUT)');
    }

    // 2. Pul harakatlari registriga yozish
    const stmt = db.prepare(`
      INSERT INTO money_movements (account_id, counterparty_id, movement_type, amount, category, movement_date, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(accountId, counterpartyId, type, amount, category, date, notes);

    db.exec('COMMIT');
    return { success: true, id: result.lastInsertRowid };
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

// ----------------------------------------------------------------------------
// 9. MOLIYAVIY HISOBOTLAR (P&L, BALANS, SVERKA, OMBOR QOLDIG'I)
// ----------------------------------------------------------------------------
function getFinancialReports() {
  // 1. P&L (Foyda va zararlar)
  // Jami Savdo Tushumi (Revenue)
  const revenueRow = db.prepare(`
    SELECT COALESCE(SUM(total_amount), 0) as total
    FROM documents
    WHERE doc_type = 'SALE' AND status = 'POSTED'
  `).get();
  const totalRevenue = revenueRow.total;

  // Jami Tannarx (COGS)
  const cogsRow = db.prepare(`
    SELECT COALESCE(SUM(total_cost), 0) as total
    FROM stock_movements
    WHERE movement_type = 'OUT' AND notes LIKE '%Sotuv%'
  `).get();
  const totalCogs = cogsRow.total;

  // Yalpi foyda (Gross Profit)
  const grossProfit = totalRevenue - totalCogs;
  const grossMarginPct = totalRevenue > 0 ? ((grossProfit / totalRevenue) * 100).toFixed(2) : 0;

  // Xarajatlar (Doimiy va operatsion xarajatlar - money_movements OUT)
  const expensesList = db.prepare(`
    SELECT category, SUM(amount) as total
    FROM money_movements
    WHERE movement_type = 'OUT' AND category != 'SUPPLIER_PAYMENT'
    GROUP BY category
  `).all();
  const totalExpenses = expensesList.reduce((sum, e) => sum + (e.total || 0), 0);

  // Sof foyda (Net Profit)
  const netProfit = grossProfit - totalExpenses;
  const netMarginPct = totalRevenue > 0 ? ((netProfit / totalRevenue) * 100).toFixed(2) : 0;

  // 2. BALANS (Balance Sheet)
  // AKTIVLAR
  const cashAccounts = db.prepare("SELECT COALESCE(SUM(balance), 0) as total FROM accounts WHERE type = 'cash' AND currency = 'UZS'").get().total;
  const bankAccounts = db.prepare("SELECT COALESCE(SUM(balance), 0) as total FROM accounts WHERE type = 'bank' AND currency = 'UZS'").get().total;
  const totalCash = cashAccounts + bankAccounts;

  const rawStock = db.prepare("SELECT COALESCE(SUM(stock_qty * cost_price), 0) as total FROM items WHERE category IN ('raw', 'packaging')").get().total;
  const finishedStock = db.prepare("SELECT COALESCE(SUM(stock_qty * cost_price), 0) as total FROM items WHERE category IN ('finished', 'semi')").get().total;
  const totalStock = rawStock + finishedStock;

  const totalDebtors = db.prepare("SELECT COALESCE(SUM(balance), 0) as total FROM counterparties WHERE balance > 0").get().total;

  const totalAssets = totalCash + totalStock + totalDebtors;

  // PASSIVLAR
  const rawCreditors = db.prepare("SELECT COALESCE(SUM(balance), 0) as total FROM counterparties WHERE balance < 0").get().total;
  const totalCreditors = Math.abs(rawCreditors); // Qarz musbat son ko'rinishida passivda

  // O'z kapitali va Taqsimlanmagan foyda = Aktivlar - Kreditorlik qarzi
  const equityAndProfit = totalAssets - totalCreditors;
  const totalLiabilities = totalCreditors + equityAndProfit;

  // 3. Ombor qoldig'i (Barcha tovarlar)
  const stockItems = db.prepare(`
    SELECT id, name, category, unit, stock_qty, cost_price, sale_price, (stock_qty * cost_price) as total_value
    FROM items
    ORDER BY category, name ASC
  `).all();

  return {
    pnl: {
      revenue: totalRevenue,
      cogs: totalCogs,
      gross_profit: grossProfit,
      gross_margin_pct: Number(grossMarginPct),
      expenses: expensesList,
      total_expenses: totalExpenses,
      net_profit: netProfit,
      net_margin_pct: Number(netMarginPct)
    },
    balance: {
      assets: {
        cash_and_bank: totalCash,
        cash_only: cashAccounts,
        bank_only: bankAccounts,
        raw_stock: rawStock,
        finished_stock: finishedStock,
        total_stock: totalStock,
        debtors: totalDebtors,
        total_assets: totalAssets
      },
      liabilities: {
        creditors: totalCreditors,
        equity: equityAndProfit,
        total_liabilities: totalLiabilities
      },
      balance_check: (totalAssets - totalLiabilities) === 0 ? 'MUVOZANATDA (OK)' : 'FARQ MAVJUD'
    },
    stock_items: stockItems
  };
}

// Sverka akti (Kontragent bo'yicha hisobot)
function getCounterpartySverka(counterpartyId) {
  const cp = db.prepare('SELECT * FROM counterparties WHERE id = ?').get(counterpartyId);
  if (!cp) return null;

  // Barcha hujjatlar va to'lovlar
  const documents = db.prepare(`
    SELECT doc_number, doc_type, doc_date, total_amount, notes
    FROM documents
    WHERE counterparty_id = ?
    ORDER BY doc_date ASC
  `).all(counterpartyId);

  const payments = db.prepare(`
    SELECT movement_type, amount, category, movement_date, notes
    FROM money_movements
    WHERE counterparty_id = ?
    ORDER BY movement_date ASC
  `).all(counterpartyId);

  return {
    counterparty: cp,
    documents,
    payments
  };
}

// ----------------------------------------------------------------------------
// 10. NOLDAN TOZALASH YOKI STANDART REJIM
// ----------------------------------------------------------------------------
function resetDatabase(mode = 'demo') {
  if (mode === 'clean_zero') {
    // Hammasini tozalash (Hujjatlar, operatsiyalar, tovarlar va kontragentlarni 0 ga tushirish)
    db.exec(`
      DELETE FROM money_movements;
      DELETE FROM stock_movements;
      DELETE FROM document_items;
      DELETE FROM documents;
      DELETE FROM bom;
      UPDATE items SET stock_qty = 0;
      UPDATE counterparties SET balance = 0;
      UPDATE accounts SET balance = 0;
    `);
    return { success: true, message: 'Barcha hisoblar va ombor qoldiqlari noldan tozalandi.' };
  } else {
    // 1C Skrinshotidagi ma'lumotlarni qayta tiklash
    seedInitialData(true);
    return { success: true, message: '1C skrinshotidagi boshlang\'ich ma\'lumotlar qayta tiklandi.' };
  }
}

// ----------------------------------------------------------------------------
// 10. ROLLAR VA FOYDALANUVCHILAR BOSHQARUVI (RBAC)
// ----------------------------------------------------------------------------
function getRoles() {
  const rows = db.prepare('SELECT * FROM roles ORDER BY is_system DESC, id ASC').all();
  return rows.map(r => ({
    ...r,
    permissions: JSON.parse(r.permissions || '[]')
  }));
}

function createRole(data) {
  if (!data.name || !data.name.trim()) throw new Error('Rol nomi kiritilishi shart');
  const perms = Array.isArray(data.permissions) ? JSON.stringify(data.permissions) : '[]';
  const res = db.prepare(`
    INSERT INTO roles (name, description, permissions, is_system)
    VALUES (?, ?, ?, 0)
  `).run(data.name.trim(), data.description || '', perms);
  return { id: Number(res.lastInsertRowid), name: data.name.trim(), description: data.description, permissions: Array.isArray(data.permissions) ? data.permissions : [] };
}

function updateRole(id, data) {
  const role = db.prepare('SELECT * FROM roles WHERE id = ?').get(id);
  if (!role) throw new Error('Rol topilmadi');
  const perms = Array.isArray(data.permissions) ? JSON.stringify(data.permissions) : role.permissions;
  const name = role.is_system ? role.name : (data.name ? data.name.trim() : role.name);
  const desc = data.description !== undefined ? data.description : role.description;
  db.prepare(`
    UPDATE roles 
    SET name = ?, description = ?, permissions = ?
    WHERE id = ?
  `).run(name, desc, perms, id);
  return { id: Number(id), name, description: desc, permissions: JSON.parse(perms) };
}

function deleteRole(id) {
  const role = db.prepare('SELECT * FROM roles WHERE id = ?').get(id);
  if (!role) throw new Error('Rol topilmadi');
  if (role.is_system) throw new Error('Tizimning asosiy Super Admin rolini o\'chirib bo\'lmaydi');
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users WHERE role_id = ?').get(id);
  if (userCount.count > 0) throw new Error(`Ushbu rolga ${userCount.count} ta xodim biriktirilgan. Avval xodimlarning rolini o'zgartiring`);
  db.prepare('DELETE FROM roles WHERE id = ?').run(id);
  return { success: true };
}

function getUsers() {
  const rows = db.prepare(`
    SELECT u.id, u.username, u.password, u.full_name, u.role_id, u.phone, u.pin_code, u.status, u.created_at,
           r.name as role_name, r.permissions as role_permissions, r.is_system as is_super_admin
    FROM users u
    LEFT JOIN roles r ON u.role_id = r.id
    ORDER BY u.id ASC
  `).all();
  return rows.map(u => ({
    ...u,
    role_permissions: JSON.parse(u.role_permissions || '[]')
  }));
}

function createUser(data) {
  if (!data.username || !data.password || !data.full_name) {
    throw new Error('Login, parol va xodimning to\'liq ismi kiritilishi shart');
  }
  const roleId = Number(data.role_id) || 1;
  const res = db.prepare(`
    INSERT INTO users (username, password, full_name, role_id, phone, pin_code, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    data.username.trim().toLowerCase(),
    data.password.trim(),
    data.full_name.trim(),
    roleId,
    data.phone || '',
    data.pin_code || '',
    data.status || 'active'
  );
  return { id: Number(res.lastInsertRowid), ...data };
}

function updateUser(id, data) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!user) throw new Error('Foydalanuvchi topilmadi');
  
  const username = user.username === 'admin' ? 'admin' : (data.username ? data.username.trim().toLowerCase() : user.username);
  const password = data.password ? data.password.trim() : user.password;
  const fullName = data.full_name ? data.full_name.trim() : user.full_name;
  const roleId = user.username === 'admin' ? user.role_id : (data.role_id ? Number(data.role_id) : user.role_id);
  const phone = data.phone !== undefined ? data.phone : user.phone;
  const pinCode = data.pin_code !== undefined ? data.pin_code : user.pin_code;
  const status = user.username === 'admin' ? 'active' : (data.status || user.status);

  db.prepare(`
    UPDATE users 
    SET username = ?, password = ?, full_name = ?, role_id = ?, phone = ?, pin_code = ?, status = ?
    WHERE id = ?
  `).run(username, password, fullName, roleId, phone, pinCode, status, id);

  return { id: Number(id), username, full_name: fullName, role_id: roleId, phone, pin_code: pinCode, status };
}

function deleteUser(id) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!user) throw new Error('Foydalanuvchi topilmadi');
  if (user.username === 'admin') throw new Error('Boshqaruvchi (Super Admin) hisobini o\'chirib bo\'lmaydi');
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  return { success: true };
}

function loginUser(username, password, pin) {
  let user = null;
  if (pin) {
    user = db.prepare(`
      SELECT u.*, r.name as role_name, r.permissions as role_permissions, r.is_system as is_super_admin
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.id
      WHERE u.pin_code = ? AND u.status = 'active'
    `).get(pin.trim());
  } else if (username && password) {
    user = db.prepare(`
      SELECT u.*, r.name as role_name, r.permissions as role_permissions, r.is_system as is_super_admin
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.id
      WHERE LOWER(u.username) = ? AND u.password = ? AND u.status = 'active'
    `).get(username.trim().toLowerCase(), password.trim());
  }
  if (!user) {
    throw new Error('Login, parol yoki PIN-kod noto\'g\'ri, yoki xodim bloklangan');
  }
  return {
    id: user.id,
    username: user.username,
    full_name: user.full_name,
    role_id: user.role_id,
    role_name: user.role_name,
    is_super_admin: Boolean(user.is_super_admin),
    permissions: JSON.parse(user.role_permissions || '[]')
  };
}

// ----------------------------------------------------------------------------
// 12. SHARTNOMALAR (Договоры контрагентов)
// ----------------------------------------------------------------------------
function getContracts(counterpartyId = null) {
  if (counterpartyId) {
    return db.prepare('SELECT * FROM contracts WHERE counterparty_id = ? ORDER BY id DESC').all(Number(counterpartyId));
  }
  return db.prepare(`
    SELECT c.*, cp.name as counterparty_name 
    FROM contracts c
    JOIN counterparties cp ON c.counterparty_id = cp.id
    ORDER BY c.id DESC
  `).all();
}

function createContract(data) {
  if (!data.counterparty_id || !data.contract_number || !data.name) {
    throw new Error('Kontragent, shartnoma raqami va nomi kiritilishi shart');
  }
  const stmt = db.prepare(`
    INSERT INTO contracts (counterparty_id, contract_number, name, currency, exchange_rate, start_date, status, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const res = stmt.run(
    Number(data.counterparty_id),
    data.contract_number.trim(),
    data.name.trim(),
    data.currency || 'UZS',
    Number(data.exchange_rate) || 1,
    data.start_date || new Date().toISOString().slice(0, 10),
    data.status || 'active',
    data.notes || ''
  );
  return { id: Number(res.lastInsertRowid), ...data };
}

module.exports = {
  getDashboardKPI,
  getItems,
  createItem,
  updateItem,
  deleteItem,
  bulkCreateItems,
  getCounterparties,
  createCounterparty,
  updateCounterparty,
  deleteCounterparty,
  bulkCreateCounterparties,
  getAccounts,
  createAccount,
  updateAccount,
  deleteAccount,
  getBOMList,
  saveBOM,
  getPurchases,
  createPurchase,
  deletePurchase,
  getSales,
  createSale,
  getProductions,
  createProduction,
  getMoneyMovements,
  createMoneyOrder,
  getFinancialReports,
  getCounterpartySverka,
  getDeepAnalytics,
  resetDatabase,
  getRoles,
  createRole,
  updateRole,
  deleteRole,
  getUsers,
  createUser,
  updateUser,
  deleteUser,
  loginUser,
  getContracts,
  createContract,
  getCatalogGroups,
  createCatalogGroup,
  deleteCatalogGroup
};

