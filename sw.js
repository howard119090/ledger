const CACHE_NAME = 'minimal-ledger-v6.0-offline-cache';
const CORE_ASSETS = [
  './',
  './index.html',
  './sw.js'
];

// 安裝階段：僅快取同源本機檔案，避免外部 CDN 失敗導致整個離線快取中斷
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      for (const url of CORE_ASSETS) {
        try {
          const res = await fetch(new Request(url, { cache: 'reload' }));
          if (res && res.ok) {
            await cache.put(url, res);
          }
        } catch (err) {}
      }
    })
  );
});

// 啟動階段：清除舊版快取並立即接管所有頁面
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// 攔截請求：無論任何網址參數或路徑，斷網時一律秒回快取中的 index.html
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((networkRes) => {
          const clone = networkRes.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put('./index.html', clone.clone());
            cache.put('./', clone);
          });
          return networkRes;
        })
        .catch(async () => {
          const cache = await caches.open(CACHE_NAME);
          return (await cache.match('./index.html')) || (await cache.match('./')) || (await cache.match(event.request, { ignoreSearch: true }));
        })
    );
    return;
  }

  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((cachedRes) => {
      if (cachedRes) {
        fetch(event.request).then((netRes) => {
          if (netRes && (netRes.status === 200 || netRes.type === 'opaque')) {
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, netRes));
          }
        }).catch(() => {});
        return cachedRes;
      }
      return fetch(event.request).then((netRes) => {
        if (netRes && (netRes.status === 200 || netRes.type === 'opaque')) {
          const clone = netRes.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return netRes;
      }).catch(() => new Response('', { status: 200 }));
    })
  );
});