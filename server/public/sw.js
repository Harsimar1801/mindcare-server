self.addEventListener("push", function (event) {

  let data = {};

  if (event.data) {
    data = event.data.json();
  }

  const title = data.notification?.title || "MindCare 💙";
  const body = data.notification?.body || "New message";

  const message = data.data?.message || "";

  const options = {
    body,
    icon: "/icon.png",
    badge: "/icon.png",

    data: {
      url: "/chat.html?msg=" + encodeURIComponent(message)
    }
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});


// When user clicks notification
self.addEventListener("notificationclick", function (event) {

  event.notification.close();

  const url = event.notification.data.url;

  event.waitUntil(

    clients.matchAll({ type: "window", includeUncontrolled: true })

      .then(function (clientList) {

        // If app already open → focus
        for (let client of clientList) {

          if (client.url.includes("/chat.html")) {
            return client.focus();
          }
        }

        // Else open new tab
        if (clients.openWindow) {
          return clients.openWindow(url);
        }

      })
  );
});