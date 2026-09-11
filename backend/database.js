const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'meatcity_erp.db');

// Bazani ulash
const db = new DatabaseSync(DB_PATH);

// Jadvallarni initsializatsiya qilish
function initDatabase() {
  db.exec(`
    PRAGMA foreign_keys = ON;

    -- 1. Sozlamalar va rekvizitlar
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    -- 2. Kassa va Bank hisobvaraqlari (Деньги)
    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL, -- 'cash' (Kassa) yoki 'bank' (Hisobraqam)
      currency TEXT NOT NULL DEFAULT 'UZS', -- 'UZS' yoki 'USD'
      balance REAL NOT NULL DEFAULT 0,
      account_number TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 3. Kontragentlar (Mijozlar va Ta'minotchilar)
    CREATE TABLE IF NOT EXISTS counterparties (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL, -- 'supplier' (Ta'minotchi), 'customer' (Xaridor), 'both'
      phone TEXT,
      address TEXT,
      balance REAL NOT NULL DEFAULT 0, -- Musbat (+) bo'lsa bizdan qarzdor (Debitor), Manfiy (-) bo'lsa biz qarzmiz (Kreditor)
      inn TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 4. Nomenklatura (Xomashyo, Tayyor mahsulot, Yarim tayyor mahsulot)
    CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT NOT NULL, -- 'raw' (Xomashyo), 'finished' (Tayyor mahsulot), 'semi' (Yarim tayyor), 'packaging' (Qadoqlash)
      unit TEXT NOT NULL DEFAULT 'kg', -- 'kg', 'dona', 'litr', 'metr'
      stock_qty REAL NOT NULL DEFAULT 0,
      cost_price REAL NOT NULL DEFAULT 0, -- O'rtacha tannarx
      sale_price REAL NOT NULL DEFAULT 0, -- Sotish narxi
      min_limit REAL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 5. Mahsulot Me'yoriy Tarkibi (Retseptura / Spetsifikatsiya / BOM)
    CREATE TABLE IF NOT EXISTS bom (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      finished_item_id INTEGER NOT NULL,
      raw_item_id INTEGER NOT NULL,
      quantity REAL NOT NULL, -- 1 birlik tayyor mahsulot uchun kerakli miqdor
      FOREIGN KEY (finished_item_id) REFERENCES items(id) ON DELETE CASCADE,
      FOREIGN KEY (raw_item_id) REFERENCES items(id) ON DELETE CASCADE
    );

    -- 6. Hujjatlar (Kirim, Sotuv, Ishlab chiqarish, Kassa/Bank orderlari)
    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      doc_number TEXT NOT NULL UNIQUE,
      doc_type TEXT NOT NULL, -- 'PURCHASE' (Kirim), 'SALE' (Sotuv), 'PRODUCTION' (Ishlab chiqarish), 'PAYMENT_IN' (Kassa kirim), 'PAYMENT_OUT' (Kassa chiqim)
      doc_date DATE NOT NULL,
      counterparty_id INTEGER,
      account_id INTEGER,
      total_amount REAL NOT NULL DEFAULT 0,
      status TEXT DEFAULT 'POSTED', -- 'POSTED' (O'tkazilgan), 'DRAFT' (Qoralama)
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (counterparty_id) REFERENCES counterparties(id),
      FOREIGN KEY (account_id) REFERENCES accounts(id)
    );

    -- 7. Hujjat qatorlari (Tovar/Xomashyo tafsilotlari)
    CREATE TABLE IF NOT EXISTS document_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id INTEGER NOT NULL,
      item_id INTEGER NOT NULL,
      quantity REAL NOT NULL,
      unit_price REAL NOT NULL,
      total_price REAL NOT NULL,
      FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
      FOREIGN KEY (item_id) REFERENCES items(id)
    );

    -- 8. Ombor harakatlari registri (Движение товаров)
    CREATE TABLE IF NOT EXISTS stock_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id INTEGER NOT NULL,
      item_id INTEGER NOT NULL,
      movement_type TEXT NOT NULL, -- 'IN' (Kirim/Vipusk), 'OUT' (Sotuv/Spisanie)
      quantity REAL NOT NULL,
      unit_cost REAL NOT NULL,
      total_cost REAL NOT NULL,
      movement_date DATE NOT NULL,
      notes TEXT,
      FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
      FOREIGN KEY (item_id) REFERENCES items(id)
    );

    -- 9. Pul harakatlari registri (Движение денег)
    CREATE TABLE IF NOT EXISTS money_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id INTEGER,
      account_id INTEGER NOT NULL,
      counterparty_id INTEGER,
      movement_type TEXT NOT NULL, -- 'IN' (Kirim), 'OUT' (Chiqim)
      amount REAL NOT NULL,
      category TEXT NOT NULL, -- 'SALES_INCOME', 'SUPPLIER_PAYMENT', 'SALARY', 'RENT_UTILITIES', 'OTHER'
      movement_date DATE NOT NULL,
      notes TEXT,
      FOREIGN KEY (account_id) REFERENCES accounts(id),
      FOREIGN KEY (counterparty_id) REFERENCES counterparties(id)
    );

    -- 10. Rollar va Ruxsatlar Konstruktori (RBAC)
    CREATE TABLE IF NOT EXISTS roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      permissions TEXT NOT NULL, -- JSON massiv: ['dashboard', 'purchases', ...]
      is_system INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 11. Xodimlar va Foydalanuvchilar
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role_id INTEGER NOT NULL,
      phone TEXT,
      pin_code TEXT,
      status TEXT NOT NULL DEFAULT 'active', -- 'active', 'blocked'
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (role_id) REFERENCES roles(id)
    );

    -- 12. Shartnomalar (Договоры контрагентов)
    CREATE TABLE IF NOT EXISTS contracts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      counterparty_id INTEGER NOT NULL,
      contract_number TEXT NOT NULL,
      name TEXT NOT NULL,
      currency TEXT NOT NULL DEFAULT 'UZS', -- 'UZS' yoki 'USD'
      exchange_rate REAL DEFAULT 1,
      start_date DATE,
      end_date DATE,
      status TEXT DEFAULT 'active',
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (counterparty_id) REFERENCES counterparties(id) ON DELETE CASCADE
    );
    -- 13. Katalog Guruhlari (Справочник Групп: Ta'minotchilar va Nomenklatura)
    CREATE TABLE IF NOT EXISTS catalog_groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL, -- 'supplier' (Ta'minotchi guruhi) yoki 'item' (Nomenklatura guruhi)
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(name, type)
    );
  `);

  // documents jadvaliga 1C ustunlarini qo'shish (agar yo'q bo'lsa)
  try { db.exec("ALTER TABLE documents ADD COLUMN warehouse TEXT DEFAULT '<склад в табличной части>'"); } catch(e) {}
  try { db.exec("ALTER TABLE documents ADD COLUMN operation_type TEXT DEFAULT 'Поступление от поставщика'"); } catch(e) {}
  try { db.exec("ALTER TABLE documents ADD COLUMN author TEXT DEFAULT 'Yuk qabul qilish bo''limi'"); } catch(e) {}
  try { db.exec("ALTER TABLE documents ADD COLUMN currency TEXT DEFAULT 'UZS'"); } catch(e) {}
  try { db.exec("ALTER TABLE documents ADD COLUMN incoming_number TEXT DEFAULT ''"); } catch(e) {}
  try { db.exec("ALTER TABLE documents ADD COLUMN incoming_date DATE"); } catch(e) {}
  try { db.exec("ALTER TABLE documents ADD COLUMN organization TEXT DEFAULT 'ZAVOD'"); } catch(e) {}
  try { db.exec("ALTER TABLE documents ADD COLUMN contract_id INTEGER"); } catch(e) {}
  try { db.exec("ALTER TABLE documents ADD COLUMN contract_name TEXT DEFAULT ''"); } catch(e) {}
  try { db.exec("ALTER TABLE documents ADD COLUMN exchange_rate REAL DEFAULT 1"); } catch(e) {}

  // counterparties va items jadvallariga guruh ustunlarini qo'shish
  try { db.exec("ALTER TABLE counterparties ADD COLUMN group_name TEXT DEFAULT ''"); } catch(e) {}
  try { db.exec("ALTER TABLE counterparties ADD COLUMN category_group TEXT DEFAULT ''"); } catch(e) {}
  try { db.exec("ALTER TABLE items ADD COLUMN group_name TEXT DEFAULT ''"); } catch(e) {}

  // Yangi guruhlar jadvalini tekshirish
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS catalog_groups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(name, type)
      );
    `);
  } catch(e) {}

  // document_items jadvaliga 1C ustunlarini qo'shish
  try { db.exec("ALTER TABLE document_items ADD COLUMN barcode TEXT DEFAULT ''"); } catch(e) {}
  try { db.exec("ALTER TABLE document_items ADD COLUMN gross_weight REAL DEFAULT 0"); } catch(e) {}
  try { db.exec("ALTER TABLE document_items ADD COLUMN tare_weight REAL DEFAULT 0"); } catch(e) {}
  try { db.exec("ALTER TABLE document_items ADD COLUMN discount_percent REAL DEFAULT 0"); } catch(e) {}
  try { db.exec("ALTER TABLE document_items ADD COLUMN discount_amount REAL DEFAULT 0"); } catch(e) {}
  try { db.exec("ALTER TABLE document_items ADD COLUMN custom_price REAL DEFAULT 0"); } catch(e) {}
  try { db.exec("ALTER TABLE document_items ADD COLUMN custom_price2 REAL DEFAULT 0"); } catch(e) {}

  // Shartnomalarni tekshirish va birlamchi namunaviy shartnomalar qo'shish
  try {
    const contractCount = db.prepare("SELECT COUNT(*) as cnt FROM contracts").get();
    if (contractCount.cnt === 0) {
      const cps = db.prepare("SELECT id, name, type FROM counterparties WHERE type = 'supplier' OR type = 'both'").all();
      const insertContract = db.prepare(`
        INSERT INTO contracts (counterparty_id, contract_number, name, currency, exchange_rate, start_date, status, notes)
        VALUES (?, ?, ?, ?, ?, ?, 'active', ?)
      `);
      for (const cp of cps) {
        const cleanName = cp.name.split('(')[0].trim();
        insertContract.run(cp.id, `DOG-${cp.id}01`, `Bosh shartnoma (UZS) - ${cleanName}`, 'UZS', 1, '2026-01-01', 'Bosh xo\'jalik shartnomasi');
        insertContract.run(cp.id, `DOG-${cp.id}02`, `Valyutali shartnoma (USD) - ${cleanName}`, 'USD', 13000, '2026-01-01', 'Valyutada yetkazib berish (1 USD = 13 000 UZS)');
      }
    }
  } catch(e) {
    console.error('Shartnomalarni initsializatsiya qilishda xato:', e);
  }

  // Super Admin roli va foydalanuvchisini tekshirish/yaratish
  try {
    let adminRole = db.prepare("SELECT * FROM roles WHERE name = 'Super Admin (Boshqaruvchi)'").get();
    let adminRoleId = adminRole ? adminRole.id : null;
    if (!adminRole) {
      const allPerms = JSON.stringify([
        'dashboard', 'purchases', 'production', 'sales', 'money', 'stock', 'reports', 'catalogs',
        'view_prices', 'view_profit', 'delete_docs', 'print_docs', 'admin_access'
      ]);
      const res = db.prepare(`
        INSERT INTO roles (name, description, permissions, is_system)
        VALUES (?, ?, ?, 1)
      `).run('Super Admin (Boshqaruvchi)', 'Barcha bo\'limlar, hisobotlar va tizim boshqaruviga to\'liq cheklovsiz ruxsat', allPerms);
      adminRoleId = Number(res.lastInsertRowid);

      // Boshlang'ich qo'shimcha tahrirlanadigan namunaviy rollar:
      const buxgalterPerms = JSON.stringify(['purchases', 'sales', 'money', 'reports', 'catalogs', 'view_prices', 'view_profit', 'print_docs']);
      db.prepare("INSERT OR IGNORE INTO roles (name, description, permissions, is_system) VALUES (?, ?, ?, 0)")
        .run('Bosh Buxgalter / Moliyachi', 'Kirim, Chiqim, Kassa, Moliyaviy hisobotlar va P&L', buxgalterPerms);

      const omborPerms = JSON.stringify(['purchases', 'production', 'stock', 'catalogs', 'print_docs']);
      db.prepare("INSERT OR IGNORE INTO roles (name, description, permissions, is_system) VALUES (?, ?, ?, 0)")
        .run('Zavsklad / Ombor Mudiri', 'Kirim, Ishlab chiqarish va Ombor qoldiqlari (narxlarsiz/miqdoriy)', omborPerms);

      const taroziPerms = JSON.stringify(['purchases', 'print_docs']);
      db.prepare("INSERT OR IGNORE INTO roles (name, description, permissions, is_system) VALUES (?, ?, ?, 0)")
        .run('Tarozi Qabulchisi (Xomashyo)', 'Faqat Kirim yuk xatlari va elektron tarozi orqali qabul qilish', taroziPerms);
    }

    const checkAdminUser = db.prepare("SELECT * FROM users WHERE username = 'admin'").get();
    if (!checkAdminUser && adminRoleId) {
      db.prepare(`
        INSERT INTO users (username, password, full_name, role_id, phone, pin_code, status)
        VALUES (?, ?, ?, ?, ?, ?, 'active')
      `).run('admin', 'admin123', 'Boshqaruvchi (Super Admin)', adminRoleId, '+998 90 000-00-00', '1234');
      console.log('[DB] Super Admin (admin / admin123) muvaffaqiyatli yaratildi.');
    }
  } catch(e) {
    console.error('[DB] Rollar va foydalanuvchilarni initsializatsiya qilishda xato:', e);
  }

  console.log('[DB] SQLite relyatsion jadvallari muvaffaqiyatli tekshirildi/yaratildi.');
}

// Boshlang'ich namuna ma'lumotlar bilan to'ldirish (Agar baza bo'sh bo'lsa)
function seedInitialData(forceReset = false) {
  if (forceReset) {
    db.exec(`
      DELETE FROM money_movements;
      DELETE FROM stock_movements;
      DELETE FROM document_items;
      DELETE FROM documents;
      DELETE FROM bom;
      DELETE FROM items;
      DELETE FROM counterparties;
      DELETE FROM accounts;
      DELETE FROM settings;
      DELETE FROM sqlite_sequence;
    `);
    console.log('[DB] Barcha ma\'lumotlar noldan tozalandi.');
  }

  // Hisoblar sonini tekshiramiz
  const checkAccounts = db.prepare('SELECT COUNT(*) as cnt FROM accounts').get();
  if (checkAccounts.cnt > 0 && !forceReset) {
    return; // Allaqachon ma'lumot bor
  }

  console.log('[DB] Boshlang\'ich korxona ma\'lumotlari va 1C ko\'rsatkichlari yuklanmoqda...');

  // 1. Sozlamalar
  const insertSetting = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  insertSetting.run('company_name', 'MEAT CITY');
  insertSetting.run('usd_rate', '13000');
  insertSetting.run('base_currency', 'UZS');

  // 2. Kassa va Bank hisobvaraqlari (1C skrinshotidagi kabi)
  const insertAccount = db.prepare('INSERT INTO accounts (name, type, currency, balance, account_number) VALUES (?, ?, ?, ?, ?)');
  insertAccount.run('Asosiy Kassa (UZS)', 'cash', 'UZS', 8788428902.76, 'KASSA-01');
  insertAccount.run('Ipak Yo\'li Bank (Hisobraqam UZS)', 'bank', 'UZS', 1338849344.12, '20208000900123456001');
  insertAccount.run('Valyuta Kassasi (USD)', 'cash', 'USD', 50000.00, 'KASSA-USD');

  // 3. Kontragentlar (Ta'minotchilar va Xaridorlar - skrinshotdagi qarz ko'rsatkichlari bilan)
  const insertCp = db.prepare('INSERT INTO counterparties (name, type, phone, address, balance) VALUES (?, ?, ?, ?, ?)');
  // Xaridorlar (Debitorlar jami: ~64.77 mlrd)
  const cp1 = insertCp.run('Korzinka Supermarketlar Tarmog\'i', 'customer', '+998 78 140 14 14', 'Toshkent sh.', 28500000000.00).lastInsertRowid;
  const cp2 = insertCp.run('Havas Diskounter Do\'konlari', 'customer', '+998 71 205 55 55', 'Toshkent viloyati', 19200000000.00).lastInsertRowid;
  const cp3 = insertCp.run('Makro Supermarketlar Tarmog\'i', 'customer', '+998 71 205 12 34', 'Toshkent sh.', 11800000000.00).lastInsertRowid;
  const cp4 = insertCp.run('Samarqand Oazis Distribyutsiya', 'customer', '+998 90 123 45 67', 'Samarqand sh.', 5275648480.77).lastInsertRowid;

  // Ta'minotchilar (Kreditorlar jami: -45.96 mlrd)
  insertCp.run('Agro-Go\'sht Kompleks MCHJ (Mol go\'shti)', 'supplier', '+998 91 333 44 55', 'Jizzax viloyati', -24500000000.00);
  insertCp.run('Parranda Baraka Fayz (Tovuq go\'shti)', 'supplier', '+998 93 555 66 77', 'Toshkent viloyati', -12800000000.00);
  insertCp.run('Polimer Upakovka Savdo (Vakuum va qobiqlar)', 'supplier', '+998 90 777 88 99', 'Toshkent sh.', -5400000000.00);
  insertCp.run('Spices & Food Ingredients (Ziravorlar)', 'supplier', '+998 94 888 99 00', 'Toshkent sh.', -3261939362.40);

  // 4. Tovar va Xomashyolar (Items)
  const insertItem = db.prepare('INSERT INTO items (name, category, unit, stock_qty, cost_price, sale_price) VALUES (?, ?, ?, ?, ?, ?)');

  // Xomashyolar (Raw materials)
  const raw1 = insertItem.run('Mol go\'shti (Suyaksiz lahm)', 'raw', 'kg', 45000, 72000, 0).lastInsertRowid;
  const raw2 = insertItem.run('Tovuq filesi (Go\'sht)', 'raw', 'kg', 32000, 38000, 0).lastInsertRowid;
  const raw3 = insertItem.run('Charvi / Dumba yog\'i', 'raw', 'kg', 12000, 42000, 0).lastInsertRowid;
  const raw4 = insertItem.run('Maxsus Ziravorlar Kompozitsiyasi №4', 'raw', 'kg', 2500, 110000, 0).lastInsertRowid;
  const raw5 = insertItem.run('Vakuum Rulon 250 (Qadoq)', 'packaging', 'dona', 85000, 1200, 0).lastInsertRowid;
  const raw6 = insertItem.run('Kolbasa Qobig\'i (Kollagen 45mm)', 'packaging', 'metr', 40000, 2500, 0).lastInsertRowid;

  // Tayyor mahsulotlar (1C skrinshotidagi mashhur tovarlar: Мезбон, Изхор, Хумо)
  const fg1 = insertItem.run('Мезбон Эскинча Иштаха 0.8', 'finished', 'dona', 14500, 36500, 48000).lastInsertRowid;
  const fg2 = insertItem.run('Мезбоn Эстонская Варёные 1.5', 'finished', 'dona', 9800, 52000, 68000).lastInsertRowid;
  const fg3 = insertItem.run('Изхор Сосиски Говяжий в/к', 'finished', 'kg', 12400, 41000, 55000).lastInsertRowid;
  const fg4 = insertItem.run('Изхор Комбо Аксия Зирали', 'finished', 'dona', 8200, 39000, 52000).lastInsertRowid;
  const fg5 = insertItem.run('Изхор п/к Белорусские 0.9', 'finished', 'dona', 11000, 44000, 59000).lastInsertRowid;
  const fg6 = insertItem.run('Хумо Салями Боярский 0.5', 'finished', 'dona', 16500, 32000, 45000).lastInsertRowid;
  const fg7 = insertItem.run('Мезбон Докторская наклейка 0.9', 'finished', 'dona', 13200, 38000, 51000).lastInsertRowid;
  const fg8 = insertItem.run('Эзоз п/к Баварские 1.2 кг', 'finished', 'dona', 7400, 56000, 74000).lastInsertRowid;
  const fg9 = insertItem.run('Уммон п/к Миллий 0.9', 'finished', 'dona', 9100, 42000, 56000).lastInsertRowid;

  // 5. Retseptura / Me'yoriy tarkib (BOM - Spetsifikatsiya)
  const insertBom = db.prepare('INSERT INTO bom (finished_item_id, raw_item_id, quantity) VALUES (?, ?, ?)');

  // "Хумо Салями Боярский 0.5" uchun retsept:
  insertBom.run(fg6, raw1, 0.35); // 350g mol go'shti
  insertBom.run(fg6, raw3, 0.12); // 120g dumba
  insertBom.run(fg6, raw4, 0.02); // 20g ziravor
  insertBom.run(fg6, raw5, 1.0);  // 1 dona vakuum rulon

  // "Изхор Сосиски Говяжий в/к" (1 kg) uchun retsept:
  insertBom.run(fg3, raw1, 0.50); // 500g mol go'shti
  insertBom.run(fg3, raw2, 0.30); // 300g tovuq filesi
  insertBom.run(fg3, raw3, 0.15); // 150g charvi
  insertBom.run(fg3, raw4, 0.03); // 30g ziravor
  insertBom.run(fg3, raw6, 2.0);  // 2 metr qobiq

  // "Мезбон Эскинча Иштаха 0.8" uchun retsept:
  insertBom.run(fg1, raw1, 0.55); // 550g mol go'shti
  insertBom.run(fg1, raw2, 0.20); // 200g tovuq go'shti
  insertBom.run(fg1, raw3, 0.10); // 100g charvi
  insertBom.run(fg1, raw4, 0.025); // 25g ziravor
  insertBom.run(fg1, raw5, 1.0);

  // 6. Namunaviy Hujjatlar (Sotuvlar va Sotuv Dinamikasi 1C skrinshotidagidek)
  const insertDoc = db.prepare(`
    INSERT INTO documents (doc_number, doc_type, doc_date, counterparty_id, account_id, total_amount, status, notes)
    VALUES (?, ?, ?, ?, ?, ?, 'POSTED', ?)
  `);

  const insertDocItem = db.prepare(`
    INSERT INTO document_items (document_id, item_id, quantity, unit_price, total_price)
    VALUES (?, ?, ?, ?, ?)
  `);

  const insertStockMov = db.prepare(`
    INSERT INTO stock_movements (document_id, item_id, movement_type, quantity, unit_cost, total_cost, movement_date, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Sotuv 1: 4-sentabr 2026 (Korzinka: 1 650 000 000 UZS)
  const docSale1 = insertDoc.run('SOT-000101', 'SALE', '2026-09-04', cp1, null, 1650000000, 'ZAVOD - Korzinka tarmoqlari yetkazmasi').lastInsertRowid;
  insertDocItem.run(docSale1, fg1, 20000, 48000, 960000000);
  insertDocItem.run(docSale1, fg6, 15333, 45000, 690000000);
  insertStockMov.run(docSale1, fg1, 'OUT', 20000, 36500, 730000000, '2026-09-04', 'Sotuv chiqimi');
  insertStockMov.run(docSale1, fg6, 'OUT', 15333, 32000, 490656000, '2026-09-04', 'Sotuv chiqimi');

  // Sotuv 2: 5-sentabr 2026 (1 809 953 673 UZS - 1C skrinshotidagi nuqta)
  const docSale2 = insertDoc.run('SOT-000102', 'SALE', '2026-09-05', cp2, null, 1809953673, 'ZAVOD - Havas diskounter yetkazmasi').lastInsertRowid;
  insertDocItem.run(docSale2, fg3, 22000, 55000, 1210000000);
  insertDocItem.run(docSale2, fg2, 8822.8, 68000, 599953673);
  insertStockMov.run(docSale2, fg3, 'OUT', 22000, 41000, 902000000, '2026-09-05', 'Sotuv chiqimi');
  insertStockMov.run(docSale2, fg2, 'OUT', 8822.8, 52000, 458785600, '2026-09-05', 'Sotuv chiqimi');

  // Sotuv 3: 6-sentabr 2026 (Makro: 480 000 000 UZS)
  const docSale3 = insertDoc.run('SOT-000103', 'SALE', '2026-09-06', cp3, null, 480000000, 'ZAVOD - Makro do\'konlari').lastInsertRowid;
  insertDocItem.run(docSale3, fg5, 8135.5, 59000, 480000000);
  insertStockMov.run(docSale3, fg5, 'OUT', 8135.5, 44000, 357962000, '2026-09-06', 'Sotuv chiqimi');

  // Sotuv 4: 7-sentabr 2026 (Oazis: 1 220 000 000 UZS)
  const docSale4 = insertDoc.run('SOT-000104', 'SALE', '2026-09-07', cp4, null, 1220000000, 'ZAVOD - Samarqand Oazis yetkazmasi').lastInsertRowid;
  insertDocItem.run(docSale4, fg4, 15000, 52000, 780000000);
  insertDocItem.run(docSale4, fg7, 8627.4, 51000, 440000000);
  insertStockMov.run(docSale4, fg4, 'OUT', 15000, 39000, 585000000, '2026-09-07', 'Sotuv chiqimi');
  insertStockMov.run(docSale4, fg7, 'OUT', 8627.4, 38000, 327841200, '2026-09-07', 'Sotuv chiqimi');

  console.log('[DB] Boshlang\'ich ma\'lumotlar muvaffaqiyatli kiritildi.');
}

// Bazani ishga tushirish
initDatabase();
seedInitialData();

module.exports = {
  db,
  initDatabase,
  seedInitialData
};
