self.addEventListener("push", function (event) {

  let data = {};

  if (event.data) {
    data = event.data.json();
  }

  const title = data.notification?.title || "MindCare 💙";
  const body = data.notification?.body || "Hey bro!";
  const msg = data.data?.msg || body;

  const options = {
    body: body,
    icon: "/icon.png",

    data: {
      msg: msg // ⭐ VERY IMPORTANT
    }
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});


self.addEventListener("notificationclick", function (event) {

  event.notification.close();

  const msg = event.notification.data?.msg;

  let url = "/chat.html";

  // Attach message
  if (msg) {
    url += "?msg=" + encodeURIComponent(msg);
  }

  event.waitUntil(
    clients.openWindow(url)
  );
});