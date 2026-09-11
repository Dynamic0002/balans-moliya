module.exports = {
  // Server port
  PORT: process.env.PORT || 3000,

  // 1C Ulanish parametrlari
  ONEC: {
    BASE_URL: process.env.ONEC_URL || 'http://192.168.2.197/db45099115/hs/meatcity/v1',
    USERNAME: process.env.ONEC_USER || 'api_dashboard',
    PASSWORD: process.env.ONEC_PASSWORD || 'MeatCity2026!',
    TIMEOUT_MS: 8000,
  },

  // Avtomatik sinxronizatsiya davriyligi (millisekundda, masalan 10 daqiqa = 600000)
  SYNC_INTERVAL_MS: 10 * 60 * 1000,

  // Dashboard xavfsiz PIN kodi (ixtiyoriy)
  SECURITY_PIN: '2026',

  // Korxona nomi
  COMPANY_NAME: 'MEAT CITY'
};
