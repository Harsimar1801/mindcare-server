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
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", () => {
  clients.claim();
});


// 🔔 Handle notification click
self.addEventListener("notificationclick", event => {

  event.notification.close();

  const msg = event.notification.data?.message || "";

  const url = msg
    ? `/chat.html?msg=${encodeURIComponent(msg)}`
    : "/chat.html";

  event.waitUntil(
    clients.openWindow(url)
  );
});


// 🔔 Background notification
self.addEventListener("push", event => {

  let data = {};

  if (event.data) {
    data = event.data.json();
  }

  const title = data.notification?.title || "MindCare 💙";
  const body = data.notification?.body || "Hey bro 😄";

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      data: data.data || {},
      icon: "/icon.png"
    })
  );
});