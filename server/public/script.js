function setFCMToken(token) {

  console.log("FCM Token Saved:", token);

  localStorage.setItem("fcmToken", token);
}

// ================= SERVICE WORKER =================

if ("serviceWorker" in navigator) {
  navigator.serviceWorker
    .register("/sw.js")
    .then(() => console.log("Service Worker Registered"))
    .catch((err) => console.log("SW Error:", err));
}


// ================= NOTIFICATION PERMISSION =================

async function askPermission() {
  if ("Notification" in window) {
    const permission = await Notification.requestPermission();
    console.log("Permission:", permission);
  }
}

askPermission();


// ================= FCM TOKEN (ANDROID → WEBVIEW) =================

// Called from Android WebView
function setFCMToken(token) {

  console.log("FCM Token Saved:", token);

  localStorage.setItem("fcmToken", token);
}


// Ask Android app for token
if (window.Android && window.Android.getFCMToken) {
  window.Android.getFCMToken();
}


// ================= DEMO NOTIFICATION =================

function sendDemoNotification() {

  if (Notification.permission === "granted") {

    new Notification("🧠 MindCare Check-in", {
      body: "Hey Harsimar 💙 How are you feeling today?",
      icon: "/icon.png"
    });

  }
}


// Test after 5 sec
setTimeout(sendDemoNotification, 5000);


// Daily
setInterval(sendDemoNotification, 24 * 60 * 60 * 1000);


// ================= CHAT UI =================

const chat = document.getElementById("chat");
const input = document.getElementById("msg");


// Add message
function addMessage(text, type) {

  const div = document.createElement("div");

  div.className = type;

  div.innerText = text;

  chat.appendChild(div);

  chat.scrollTop = chat.scrollHeight;
}


// Welcome
addMessage("Yo Harsimar 😄💙 I'm here bro. Talk to me.", "bot");


// ================= SEND MESSAGE =================

async function send() {

  const text = input.value.trim();

  if (text === "") return;


  addMessage("You: " + text, "user");

  input.value = "";


  const typing = document.createElement("div");

  typing.className = "bot";

  typing.innerText = "MindCare is typing...";

  chat.appendChild(typing);

  chat.scrollTop = chat.scrollHeight;


  // Get saved FCM token
  const token = localStorage.getItem("fcmToken");


  try {

    const res = await fetch("/chat", {

      method: "POST",

      headers: {
        "Content-Type": "application/json"
      },

      body: JSON.stringify({

        message: text,

        fcmToken: token   // ✅ SEND TOKEN

      })

    });


    const data = await res.json();


    chat.removeChild(typing);


    addMessage("MindCare: " + data.reply, "bot");


  } catch (err) {

    console.log("Error:", err);

    chat.removeChild(typing);

    addMessage(
      "MindCare: Bro 😭 server down. Try later 💙",
      "bot"
    );
  }
}


// ================= ENTER KEY =================

input.addEventListener("keydown", (e) => {

  if (e.key === "Enter") {
    send();
  }

});
