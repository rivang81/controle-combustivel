// Service worker — deixa o app 100% offline depois da primeira visita.
// Estratégia cache-first: tudo é estático e local, sem backend.
// Ao publicar mudanças, incremente a versão para renovar o cache.
const CACHE = 'combustivel-v2';
const ARQUIVOS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './voz.js',
  './manifest.json',
  './icone-192.png',
  './icone-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(ARQUIVOS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((chaves) => Promise.all(chaves.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  // ignoreSearch: a URL pode carregar ?mascote=... e outros overrides de teste
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((r) => r || fetch(e.request)),
  );
});
