// 派對遊戲 service worker（獨立版專用；__VERSION__ / __HASH__ 由 build.py 填入）
// 策略：外殼（index.html、圖示、manifest）cache-first；其他同源檔案 network-first；
// 跨來源（Firestore、gstatic、Google Fonts…）完全不攔截，也不快取。
const VERSION = "__VERSION__";
const CACHE = "pg-shell-" + VERSION + "-__HASH__";
const SHELL = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./icon-maskable-512.png", "./apple-touch-icon.png"];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.all(SHELL.map(u => c.add(new Request(u, {cache: "reload"})).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith("pg-shell-") && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isShellPath(url) {
  const scope = new URL(self.registration.scope);
  const rel = url.pathname.startsWith(scope.pathname) ? url.pathname.slice(scope.pathname.length) : url.pathname;
  return rel === "" || rel === "index.html" || rel === "manifest.webmanifest" || /^(icon-|apple-touch-icon)/.test(rel);
}

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // 不碰 Firestore / gstatic / 字型
  if (isShellPath(url) || req.mode === "navigate") {
    // 分享連結帶 ?code=XXXX，所以比對時忽略 query
    event.respondWith(
      caches.open(CACHE).then(c => c.match(req.mode === "navigate" ? "./index.html" : req, {ignoreSearch: true}))
        .then(hit => hit || fetch(req))
    );
    return;
  }
  event.respondWith(
    fetch(req).then(res => {
      if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {}); }
      return res;
    }).catch(() => caches.match(req).then(hit => hit || Response.error()))
  );
});
