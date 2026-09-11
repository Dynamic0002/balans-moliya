# MEAT CITY — Ta'sischilar Moliyaviy Boshqaruv Dashboardi (Executive View)

Mazkur loyiha **"MEAT CITY"** go'shtni qayta ishlash korxonasining 1C bazasi (`http://192.168.2.197/db45099115`) bilan to'g'ridan-to'g'ri integratsiya qilingan ta'sischilar (uchreditelelar) va boshqaruv kengashi uchun real vaqt rejimida ishlovchi boshqaruv panelidir.

---

## 📌 Asosiy Tahliliy Bloklar

1. **1-Blok: Pul qayerda? (Cash & Liquidity)**
   * Bank hisobraqamlari (UZS va USD) hamda Kassa qoldiqlari.
   * Sof aylanma mablag' (NWC = Pul + Debitorlik + Zaxira – Qarzlar).
   * 7 kunlik kashgap (Cash-Gap) xatari monitoringi.

2. **2-Blok: Biznes qancha topyapti? (P&L / Daromad tahlili)**
   * 1C "Анализ бизнеса" hisoboti bo'yicha 2026 yil oylik dinamikasi (Yanvar - Avgust).
   * Jami tushum (174.8 mlrd), Tannarx (84.6 mlrd) va Sof foyda (43.5 mlrd, 24.9% marja).
   * O'zgaruvchan vs Doimiy xarajatlar tahlili va Zararsizlik nuqtasi (Точка безубыточности: 4.28 mlrd).

3. **3-Blok: Xatarlar va Zaxiralar (Risk & Assets)**
   * Debitorlik qarzlari: 9.24 mlrd (Muddati o'tgan / Prosrochka: 1.45 mlrd - 15.7%).
   * Ombordagi muzlagan mablag': 9.65 mlrd (Go'sht xomashyosi, Yarim tayyor mahsulotlar, Tayyor kolbasa).
   * Kreditorlik qarzlari: 5.12 mlrd (Ta'minotchilarga).

---

## 📂 Loyiha Tuzilmasi

```
balans moliya/
├── 1c-service/
│   ├── HTTPService_ExecutiveDashboard.bsl   # 1C Konfiguratori uchun to'liq HTTP-Service BSL kodi
│   └── 1C_Setup_Guide.md                    # 1C dasturchisi uchun sozlash va nashr qilish qo'llanmasi
├── backend/
│   ├── server.js                            # Express.js REST API Gateway
│   ├── dataService.js                       # 1C integratsiyasi va keshlovchi xizmat
│   ├── config.js                            # Ulanish parametrlari (192.168.2.197)
│   └── package.json
├── frontend/
│   ├── index.html                           # Executive Dashboard interfeysi
│   ├── styles.css                           # Tailwind va korporativ stillar
│   └── app.js                               # Grafiklar va dinamik kalkulyator
├── start_dashboard.bat                      # 1-bosishda ishga tushiruvchi skript
└── README.md
```

---

## 🚀 Tizimni Ishga Tushirish

### Usul 1: Avtomatik (Eng oson)
* Papkadagi `start_dashboard.bat` faylini ikki marta bosing. U avtomatik tarzda serverni yoqadi va brauzerda dashboardni ochadi.

### Usul 2: Qo'lda buyruq orqali
```bash
cd backend
npm install
npm start
```
Brauzerda oching: `http://localhost:3000`

---

## 🔒 1C Bazasini Ulanishini Faollashtirish
1. `1c-service/1C_Setup_Guide.md` faylidagi qo'llanma asosida 1C Konfiguratorida HTTP-servisni yoqing va nashr qiling.
2. `backend/config.js` faylidagi foydalanuvchi nomi va parolini kiriting.
3. Dashboarddagi **"1C dan Yangilash"** tugmasini bosing.
