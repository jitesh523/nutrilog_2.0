const CACHE = "nutrilog-shell-v2";
const FILES = [
  "/",
  "/index.html",
  "/dashboard",
  "/dashboard.html",
  "/styles.css",
  "/nutrition.js",
  "/planner.js",
  "/app.js",
  "/product.js",
  "/ai-client.js",
  "/offline.js",
  "/upgrades-client.js",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];
self.addEventListener("install", (event) =>
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES))),
);
self.addEventListener("activate", (event) =>
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith("nutrilog-shell-") && k !== CACHE)
            .map((k) => caches.delete(k)),
        ),
      ),
  ),
);
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (
    event.request.method !== "GET" ||
    url.origin !== location.origin ||
    url.pathname.startsWith("/api/") ||
    url.pathname === "/healthz"
  )
    return;
  if (!FILES.includes(url.pathname)) return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          event.waitUntil(
            caches.open(CACHE).then((cache) => cache.put(event.request, copy)),
          );
        }
        return response;
      })
      .catch(() =>
        caches
          .match(event.request)
          .then(
            (saved) =>
              saved ||
              (event.request.mode === "navigate"
                ? caches.match("/index.html")
                : Response.error()),
          ),
      ),
  );
});
