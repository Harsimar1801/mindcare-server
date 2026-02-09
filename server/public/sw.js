self.addEventListener("install", event => {
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(self.clients.claim());
});


// Handle push
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
      icon: "/icon.png",
      data: data.data || {}
    })
  );
});


// Handle click
self.addEventListener("notificationclick", event => {

  event.notification.close();

  const msg = event.notification.data?.message || "";

  let url = "/chat.html";

  if (msg) {
    url += "?msg=" + encodeURIComponent(msg);
  }

  event.waitUntil(
    clients.matchAll({ type: "window" }).then(clientList => {

      // If chat already open → focus
      for (let client of clientList) {
        if (client.url.includes("chat.html")) {
          return client.focus();
        }
      }

      // Else open new
      return clients.openWindow(url);
    })
  );
});