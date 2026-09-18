const CACHE = "academia-bans-v14";
const ROOT = new URL("./", self.location.href);
const FILES = [
  "./", "./index.html", "./css/global.css", "./css/login.css", "./css/portal.css", "./css/tasks.css", "./css/economy.css",
  "./js/app.js", "./js/firebase-config.js", "./js/router.js", "./js/tasks.js", "./js/house.js", "./js/economy.js", "./js/pwa.js",
  "./pages/home.html", "./pages/reglas.html", "./pages/lore.html", "./pages/ajustes.html", "./pages/casa.html", "./pages/calendario.html", "./pages/tareas.html", "./pages/tienda.html", "./pages/solicitudes.html",
  "./assets/images/banner-placeholder.svg", "./assets/images/coin.png", "./assets/images/members/default-member.svg",
  "./assets/icons/icon-192.png", "./assets/icons/icon-512.png", "./assets/icons/icon-maskable-512.png", "./assets/icons/apple-touch-icon.png",
  "./pwa/manifest.webmanifest", "./pwa/offline.html"
].map(path => new URL(path, ROOT).href);

self.addEventListener("install", event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES))));
self.addEventListener("activate", event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith("academia-bans-") && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).catch(() => caches.match(new URL("./pwa/offline.html", ROOT))));
    return;
  }
  if (!FILES.includes(url.href)) return;
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)));
});
