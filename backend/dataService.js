const fs = require('fs');
const path = require('path');
const axios = require('axios');
const config = require('./config');

const DATA_FILE_PATH = path.join(__dirname, 'data.json');

// Standart boshlang'ich ma'lumotlar (1C "Анализ бизнеса" skrinshotidagi real raqamlar)
const initialDefaultData = {
  company: 'MEAT CITY',
  last_updated: new Date().toISOString(),
  source: 'MANUAL_ENTRY', // 'MANUAL_ENTRY' | '1C_LIVE' | 'EXCEL_UPLOAD'
  connection_status: 'custom_data',

  // 1-BLOK: Pul qayerda? (Cash & Liquidity)
  cash_liquidity: {
    bank_uzs: 4850000000,
    cash_uzs: 920000000,
    bank_usd: 85000,
    bank_usd_in_uzs: 1088000000,
    total_liquid_uzs: 6858000000,
    cash_gap_risk_7d: 'PAST (Xavfsiz)',
    expected_inflow_7d: 5200000000,
    expected_outflow_7d: 3800000000,
  },

  // 2-BLOK: Biznes qancha topyapti? (P&L Ko'rsatkichlari)
  pnl_summary: {
    ytd_revenue: 174817607030.01,
    ytd_cogs: 84593693182.07,
    ytd_gross_profit: 90223913850.00,
    ytd_gross_margin_pct: 51.61,
    ytd_net_profit: 43525202568.00,
    ytd_net_margin_pct: 24.90,
    ytd_fixed_expenses: 55448764274.00,
    ytd_variable_expenses: 84593693182.07,
    
    current_month_name: 'Avgust 2026',
    current_month_revenue: 17004122374.95,
    current_month_cogs: 6850695463.26,
    current_month_gross_profit: 10153426912.00,
    current_month_gross_margin_pct: 59.71,
    current_month_net_profit: 7681351598.00,
    current_month_net_margin_pct: 45.17,
    current_month_breakeven: 4277720716.60,
    operating_leverage: 1.32
  },

  // Oylik batafsil P&L dinamikasi (Yanvar - Avgust 2026)
  monthly_data: [
    {
      month: 'Yanvar 2026',
      revenue: 14452151474.90,
      cogs: 7322091730.45,
      gross_profit: 7130059745.00,
      gross_margin_pct: 49.34,
      net_profit: 2931479836.00,
      net_margin_pct: 20.28,
      fixed_expenses: 6530512537.00,
      variable_expenses: 7322091730.45,
      breakeven_point: 13236909615.00,
      operating_leverage: 2.43
    },
    {
      month: 'Fevral 2026',
      revenue: 23690641139.75,
      cogs: 12007275115.15,
      gross_profit: 11683366025.00,
      gross_margin_pct: 49.32,
      net_profit: 10798612705.00,
      net_margin_pct: 45.58,
      fixed_expenses: 2179296320.00,
      variable_expenses: 12007275115.15,
      breakeven_point: 4419011348.64,
      operating_leverage: 1.08
    },
    {
      month: 'Mart 2026',
      revenue: 25634203636.30,
      cogs: 13015592358.41,
      gross_profit: 12618611278.00,
      gross_margin_pct: 49.23,
      net_profit: -913915486.00,
      net_margin_pct: -3.57,
      fixed_expenses: 15154296072.00,
      variable_expenses: 13015592358.41,
      breakeven_point: 30785345781.05,
      operating_leverage: -13.81
    },
    {
      month: 'Aprel 2026',
      revenue: 26239446668.29,
      cogs: 1347119945.89,
      gross_profit: 12892326722.00,
      gross_margin_pct: 49.13,
      net_profit: 5309910723.00,
      net_margin_pct: 20.24,
      fixed_expenses: 8623066577.00,
      variable_expenses: 13347119945.89,
      breakeven_point: 17550322795.94,
      operating_leverage: 2.43
    },
    {
      month: 'May 2026',
      revenue: 22728221089.50,
      cogs: 11062283663.66,
      gross_profit: 11665937426.00,
      gross_margin_pct: 51.33,
      net_profit: 4880757914.00,
      net_margin_pct: 21.47,
      fixed_expenses: 7452449307.00,
      variable_expenses: 11062283663.66,
      breakeven_point: 14519271733.28,
      operating_leverage: 2.39
    },
    {
      month: 'Iyun 2026',
      revenue: 21186029012.70,
      cogs: 9713092017.30,
      gross_profit: 11472936996.00,
      gross_margin_pct: 54.15,
      net_profit: 3606778538.00,
      net_margin_pct: 17.02,
      fixed_expenses: 8935026625.00,
      variable_expenses: 9713092017.30,
      breakeven_point: 16499500814.41,
      operating_leverage: 3.18
    },
    {
      month: 'Iyul 2026',
      revenue: 23882791633.63,
      cogs: 11275542887.95,
      gross_profit: 12607248746.00,
      gross_margin_pct: 52.79,
      net_profit: 9230226740.00,
      net_margin_pct: 38.65,
      fixed_expenses: 4019823019.00,
      variable_expenses: 11275542887.95,
      breakeven_point: 7615031439.65,
      operating_leverage: 1.37
    },
    {
      month: 'Avgust 2026',
      revenue: 17004122374.95,
      cogs: 6850695463.26,
      gross_profit: 10153426912.00,
      gross_margin_pct: 59.71,
      net_profit: 7681351598.00,
      net_margin_pct: 45.17,
      fixed_expenses: 2554293817.00,
      variable_expenses: 6850695463.26,
      breakeven_point: 4277720716.60,
      operating_leverage: 1.32
    }
  ],

  // 3-BLOK: Xatarlar va Zaxiralar (Risk & Assets)
  risks_and_assets: {
    receivables_total: 9240000000,
    receivables_overdue: 1450000000,
    receivables_overdue_pct: 15.69,
    payables_suppliers: 5120000000,
    stock_raw_meat: 3800000000,
    stock_work_in_progress: 1200000000,
    stock_finished_goods: 4650000000,
    stock_total: 9650000000
  },

  // Sof Aylanma Mablag' (NWC = Pul + Debitorlik + Zaxiralar - Kreditorlik)
  net_working_capital_uzs: 20628000000
};

// Fayldan ma'lumotlarni o'qish yoki standartini yaratish
let currentCache = loadDataFromFile();

function loadDataFromFile() {
  try {
    if (fs.existsSync(DATA_FILE_PATH)) {
      const raw = fs.readFileSync(DATA_FILE_PATH, 'utf8');
      const parsed = JSON.parse(raw);
      console.log('[DataService] data.json faylidan ma\'lumotlar yuklandi.');
      return parsed;
    }
  } catch (e) {
    console.warn('[DataService] data.json o\'qishda xatolik:', e.message);
  }
  return JSON.parse(JSON.stringify(initialDefaultData));
}

// Foydalanuvchi kiritgan yoki yuklagan yangi ma'lumotlarni saqlash
function saveCustomData(newData) {
  try {
    // Avtomatik qayta hisoblashlar (Recalculations)
    if (newData.monthly_data && Array.isArray(newData.monthly_data)) {
      const months = newData.monthly_data;
      const totalRev = months.reduce((sum, m) => sum + (parseFloat(m.revenue) || 0), 0);
      const totalCogs = months.reduce((sum, m) => sum + (parseFloat(m.cogs) || 0), 0);
      const totalNet = months.reduce((sum, m) => sum + (parseFloat(m.net_profit) || 0), 0);
      const totalGross = totalRev - totalCogs;
      const totalFixed = months.reduce((sum, m) => sum + (parseFloat(m.fixed_expenses) || 0), 0);
      const totalVar = months.reduce((sum, m) => sum + (parseFloat(m.variable_expenses) || 0), 0);

      const lastMonth = months[months.length - 1] || {};

      newData.pnl_summary = {
        ytd_revenue: totalRev,
        ytd_cogs: totalCogs,
        ytd_gross_profit: totalGross,
        ytd_gross_margin_pct: totalRev > 0 ? ((totalGross / totalRev) * 100) : 0,
        ytd_net_profit: totalNet,
        ytd_net_margin_pct: totalRev > 0 ? ((totalNet / totalRev) * 100) : 0,
        ytd_fixed_expenses: totalFixed,
        ytd_variable_expenses: totalVar,
        
        current_month_name: lastMonth.month || 'Oxirgi oy',
        current_month_revenue: parseFloat(lastMonth.revenue) || 0,
        current_month_cogs: parseFloat(lastMonth.cogs) || 0,
        current_month_gross_profit: (parseFloat(lastMonth.revenue) || 0) - (parseFloat(lastMonth.cogs) || 0),
        current_month_gross_margin_pct: parseFloat(lastMonth.gross_margin_pct) || 0,
        current_month_net_profit: parseFloat(lastMonth.net_profit) || 0,
        current_month_net_margin_pct: parseFloat(lastMonth.net_margin_pct) || 0,
        current_month_breakeven: parseFloat(lastMonth.breakeven_point) || 0,
        operating_leverage: parseFloat(lastMonth.operating_leverage) || 1.32
      };
    }

    // Likvid pul va NWC ni avtomatik hisoblash
    if (newData.cash_liquidity) {
      const bankUzs = parseFloat(newData.cash_liquidity.bank_uzs) || 0;
      const cashUzs = parseFloat(newData.cash_liquidity.cash_uzs) || 0;
      const bankUsdInUzs = parseFloat(newData.cash_liquidity.bank_usd_in_uzs) || ((parseFloat(newData.cash_liquidity.bank_usd) || 0) * 12800);
      newData.cash_liquidity.total_liquid_uzs = bankUzs + cashUzs + bankUsdInUzs;
    }

    if (newData.risks_and_assets) {
      const rawMeat = parseFloat(newData.risks_and_assets.stock_raw_meat) || 0;
      const wip = parseFloat(newData.risks_and_assets.stock_work_in_progress) || 0;
      const finished = parseFloat(newData.risks_and_assets.stock_finished_goods) || 0;
      newData.risks_and_assets.stock_total = rawMeat + wip + finished;

      const recTotal = parseFloat(newData.risks_and_assets.receivables_total) || 0;
      const recOverdue = parseFloat(newData.risks_and_assets.receivables_overdue) || 0;
      newData.risks_and_assets.receivables_overdue_pct = recTotal > 0 ? ((recOverdue / recTotal) * 100) : 0;
    }

    // NWC = Total Cash + Receivables + Stock - Payables
    const totalCash = newData.cash_liquidity?.total_liquid_uzs || 0;
    const totalRec = newData.risks_and_assets?.receivables_total || 0;
    const totalStock = newData.risks_and_assets?.stock_total || 0;
    const totalPay = newData.risks_and_assets?.payables_suppliers || 0;
    newData.net_working_capital_uzs = (totalCash + totalRec + totalStock) - totalPay;

    newData.last_updated = new Date().toISOString();
    newData.source = 'MANUAL_ENTRY';

    currentCache = newData;

    // Faylga saqlash
    fs.writeFileSync(DATA_FILE_PATH, JSON.stringify(currentCache, null, 2), 'utf8');
    console.log('[DataService] Yangi ma\'lumotlar data.json ga muvaffaqiyatli saqlandi!');
    return { success: true, message: 'Ma\'lumotlar muvaffaqiyatli saqlandi va yangilandi', data: currentCache };
  } catch (err) {
    console.error('[DataService] Saqlash xatosi:', err.message);
    return { success: false, message: `Saqlashda xatolik: ${err.message}` };
  }
}

// 1C dan so'rov yuborib ma'lumotlarni sinxronizatsiya qilish (agar kerak bo'lsa)
async function syncDataFromOneC() {
  const onecConfig = config.ONEC;
  
  try {
    const authHeader = 'Basic ' + Buffer.from(`${onecConfig.USERNAME}:${onecConfig.PASSWORD}`).toString('base64');
    
    const response = await axios.get(`${onecConfig.BASE_URL}/summary`, {
      headers: {
        'Authorization': authHeader,
        'Accept': 'application/json'
      },
      timeout: onecConfig.TIMEOUT_MS
    });

    if (response.status === 200 && response.data) {
      const data = response.data;
      if (data.cash_liquidity) currentCache.cash_liquidity = { ...currentCache.cash_liquidity, ...data.cash_liquidity };
      if (data.pnl_summary) currentCache.pnl_summary = { ...currentCache.pnl_summary, ...data.pnl_summary };
      if (data.risks_and_assets) currentCache.risks_and_assets = { ...currentCache.risks_and_assets, ...data.risks_and_assets };
      if (data.net_working_capital_uzs) currentCache.net_working_capital_uzs = data.net_working_capital_uzs;
      
      currentCache.last_updated = new Date().toISOString();
      currentCache.source = '1C_LIVE';
      currentCache.connection_status = 'connected';
      
      fs.writeFileSync(DATA_FILE_PATH, JSON.stringify(currentCache, null, 2), 'utf8');
      console.log(`[1C SYNC] Muvaffaqiyatli sinxronizatsiya qilindi: ${currentCache.last_updated}`);
      return { success: true, message: '1C bazadan muvaffaqiyatli yuklandi', source: '1C_LIVE' };
    }
  } catch (error) {
    console.warn(`[1C SYNC OGOHLANTIRISH] 1C bazaga ulanib bo'lmadi (${error.message}). Keshdagi ma'lumotlar ishlatilmoqda.`);
    return { success: false, message: `1C ga ulanib bo'lmadi (${error.message}). Keshdagi ma'lumotlar faol.`, source: currentCache.source };
  }
}

// Barcha ma'lumotlarni olish
function getExecutiveData() {
  return currentCache;
}

module.exports = {
  getExecutiveData,
  saveCustomData,
  syncDataFromOneC
};
