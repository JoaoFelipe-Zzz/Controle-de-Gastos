const CACHE_NAME = 'gastos-v3';
const APP_SHELL = [
  './',
  './index.html',
  './app.js',
  './style.css',
  './manifest.json',
  './icon.svg',
];

// Instala e pré-cacheia os arquivos do app
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

// Remove caches antigas ao ativar nova versão
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Estratégia: Network-first → sempre busca da rede, usa cache só se offline
self.addEventListener('fetch', (e) => {
  // Nunca intercepta chamadas à API Anthropic
  if (e.request.url.includes('anthropic.com')) return;
  // Só trata requisições GET
  if (e.request.method !== 'GET') return;

  e.respondWith(
    fetch(e.request)
      .then((response) => {
        // Resposta válida: atualiza o cache e retorna
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
        }
        return response;
      })
      .catch(() => {
        // Sem rede: serve do cache (modo offline)
        return caches.match(e.request).then((cached) => cached || caches.match('./index.html'));
      })
  );
});
