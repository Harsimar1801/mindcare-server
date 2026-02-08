self.addEventListener("install", e => {
  e.waitUntil(
    caches.open("mindcare").then(cache => {
      return cache.addAll([
        "/",
        "/index.html",
        "/style.css",
        "/script.js"
      ]);
    })
  );
});
