// 오프라인 동작: 앱 파일을 캐시해 두고 네트워크 없이도 열리게 한다.
const CACHE = 'taskmind-v1';
const ASSETS = [
  './',
  'index.html',
  'css/style.css',
  'js/app.js',
  'js/data.js',
  'js/schedule.js',
  'js/store.js',
  'manifest.webmanifest',
  'icons/icon.svg',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// 네트워크 우선, 실패하면 캐시 (수정 사항이 바로 반영되도록)
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true })),
  );
});
