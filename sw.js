/* Network & IT Engineer Simulator v0.3.1 · 2026-10-25 */
const CACHE_NAME = 'netsim-pwa-v031-20261025-unique';
const ASSETS = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'];

// 安裝新版資源（繞過舊 HTTP 快取）。不會碰觸玩家的 localStorage 存檔。
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async cache => {
      await Promise.all(ASSETS.map(async file => {
        try {
          const response = await fetch(new Request(file, { cache: 'reload' }));
          if (response.ok) await cache.put(file, response);
        } catch (error) { /* 網路不穩時允許日後再快取 */ }
      }));
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(names => Promise.all(names.filter(name =>
      (name.startsWith('netsim-') || name.startsWith('netsim-pwa-')) && name !== CACHE_NAME
    ).map(name => caches.delete(name)))).then(() => self.clients.claim())
  );
});

// 與舊版不同：HTML 頁面一定先向 GitHub Pages 請求最新版。
// 完全離線時，才退回先前儲存的頁面；靜態圖示也有離線備援。
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      const response = await fetch(req, { cache: 'no-store' });
      if (response.ok) {
        const target = req.mode === 'navigate' ? './index.html' : req;
        await cache.put(target, response.clone()).catch(() => {});
      }
      return response;
    } catch (error) {
      const fallback = req.mode === 'navigate'
        ? await cache.match('./index.html') || await cache.match('./')
        : await cache.match(req, { ignoreSearch: true });
      if (fallback) return fallback;
      throw error;
    }
  })());
});
