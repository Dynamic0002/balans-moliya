const localtunnel = require('localtunnel');
const port = 3000;
const subdomain = 'meatcity-executive';

let activeTunnel = null;

async function startTunnel() {
  try {
    if (activeTunnel) {
      try { activeTunnel.close(); } catch (e) {}
      activeTunnel = null;
    }

    console.log(`[Tunnel] ${subdomain} ulanish ochilmoqda...`);
    activeTunnel = await localtunnel({ port: port, subdomain: subdomain });

    console.log('====================================================');
    console.log(`🌐 Global Havola: ${activeTunnel.url}`);
    console.log('====================================================');

    activeTunnel.on('close', () => {
      console.log('[Tunnel] Ulanish yopildi. 3 soniyada qayta ochiladi...');
      setTimeout(startTunnel, 3000);
    });

    activeTunnel.on('error', (err) => {
      console.warn(`[Tunnel Xato]: ${err.message}. 3 soniyada qayta ochiladi...`);
      setTimeout(startTunnel, 3000);
    });
  } catch (err) {
    console.warn(`[Tunnel Start Xatosi]: ${err.message}. 3 soniyada qayta uriniladi...`);
    setTimeout(startTunnel, 3000);
  }
}

// Node processini doimiy ushlab turish (Heartbeat)
setInterval(() => {}, 1000 * 60 * 60);

startTunnel();
