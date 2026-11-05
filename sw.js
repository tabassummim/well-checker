// Service worker for the tubewell screening app. APP_VERSION changes -> browser installs the new app shell.
const APP_VERSION = "1.1.0";
const SHELL = "tw-shell-" + APP_VERSION;
const DATA = "tw-data";
const SHELL_FILES = ["./", "index.html", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png"];

self.addEventListener("install", e => {
  e.waitUntil((async () => {
    const c = await caches.open(SHELL);
    await c.addAll(SHELL_FILES);
    try {                                   // save the current version file and its data right away
      const r = await fetch("version.json", { cache: "no-store" });
      const v = await r.clone().json();
      await c.put("version.json", r);
      const d = await fetch(v.data_file);
      if (d.ok) await (await caches.open(DATA)).put(v.data_file, d);
    } catch (err) {}
  })());
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith("tw-shell-") && k !== SHELL) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener("message", e => { if (e.data === "skipWaiting") self.skipWaiting(); });

function timeout(ms) { return new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms)); }

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  const path = url.pathname;
  if (path.endsWith("/version.json")) {                       // network first, saved copy when offline
    e.respondWith((async () => {
      const c = await caches.open(SHELL);
      try {
        const r = await Promise.race([fetch(e.request, { cache: "no-store" }), timeout(5000)]);
        if (r.ok) { await c.put("version.json", r.clone()); return r; }
        throw new Error("bad");
      } catch (err) { return (await c.match("version.json")) || Response.error(); }
    })());
  } else if (path.includes("/data/")) {                       // data files never change once published: saved copy first
    e.respondWith((async () => {
      const c = await caches.open(DATA);
      const hit = await c.match(e.request, { ignoreSearch: true });
      if (hit) return hit;
      const r = await fetch(e.request);
      if (r.ok) await c.put(e.request, r.clone());
      return r;
    })());
  } else {                                                    // app files: saved copy first, network if missing
    e.respondWith((async () => {
      const c = await caches.open(SHELL);
      const hit = await c.match(e.request, { ignoreSearch: true }) || (e.request.mode === "navigate" ? await c.match("index.html") : null);
      if (hit) return hit;
      try { return await fetch(e.request); } catch (err) { return Response.error(); }
    })());
  }
});
