self.addEventListener("push", function (event) {

  let data = {};

  if (event.data) {
    data = event.data.json();
  }

  const title = data.notification?.title || "MindCare 💙";
  const body = data.notification?.body || "";
  const url = data.data?.url || "/chat.html";

  const options = {
    body,
    data: {
      url: url
    }
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});


// 🔥 THIS IS THE MAIN FIX
self.addEventListener("notificationclick", function (event) {

  event.notification.close();

  const url = event.notification.data?.url || "/chat.html";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true })
      .then(function (clientList) {

        // If app already open → focus
        for (const client of clientList) {
          if (client.url.includes("/chat.html")) {
            return client.focus();
          }
        }

        // Else open new
        return clients.openWindow(url);
      })
  );
});