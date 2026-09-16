const CACHE = "mobile-code-editor-v6";
const CORE = [
  "/", "/index.html", "/style.css", "/app.js",
  "/manifest.webmanifest", "/icon-192.png", "/icon-512.png"
];
self.addEventListener("install", event => { event.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE))); self.skipWaiting(); });
self.addEventListener("activate", event => { event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))); self.clients.claim(); });
self.addEventListener("fetch", event => {
  if(event.request.method!=="GET") return;
  const url=new URL(event.request.url);
  if(url.origin===location.origin){
    event.respondWith(caches.match(event.request).then(cached=>{
      const fresh=fetch(event.request).then(r=>{if(r.ok){const copy=r.clone();caches.open(CACHE).then(c=>c.put(event.request,copy));}return r;}).catch(()=>cached);
      return cached || fresh;
    }));
  }
});
