// ================= AUTO THEME FROM MOOD =================

(function(){

  const mood = localStorage.getItem("userMood");

  if(!mood) return;

  const app = document.querySelector(".app");
  const header = document.querySelector(".header");
  const sendBtn = document.querySelector(".send-btn");

  const themes = {

    happy: "#FFD93D",
    calm: "#4D96FF",
    sad: "#6C63FF",
    anxious: "#FF6B6B",
    stressed: "#FF884B",
    tired: "#888888",
    lonely: "#845EC2",
    excited: "#00C9A7"
  };

  const color = themes[mood] || "#6C63FF"; // default


  function adjust(hex, amt){

    let num = parseInt(hex.replace("#",""),16);

    let r = Math.min(255, Math.max(0,(num>>16)+amt));
    let g = Math.min(255, Math.max(0,((num>>8)&255)+amt));
    let b = Math.min(255, Math.max(0,(num&255)+amt));

    return `rgb(${r},${g},${b})`;
  }


  app.style.background = adjust(color,40);
  header.style.background = adjust(color,-25);
  sendBtn.style.background = adjust(color,-10);

})();
// ================= TOKEN =================

function setFCMToken(token) {
  console.log("Saved Token:", token);
  localStorage.setItem("fcmToken", token);
}


// ================= SERVICE WORKER =================

if ("serviceWorker" in navigator) {
  navigator.serviceWorker
    .register("/sw.js")
    .then(() => console.log("SW Ready"))
    .catch(err => console.log("SW Error:", err));
}


// ================= PERMISSION =================

async function askPermission() {
  if ("Notification" in window) {
    const p = await Notification.requestPermission();
    console.log("Permission:", p);
  }
}

askPermission();


// ================= ANDROID BRIDGE =================

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

setTimeout(sendDemoNotification, 5000);
setInterval(sendDemoNotification, 24 * 60 * 60 * 1000);


// ================= UI =================

const chat = document.getElementById("chat");
const input = document.getElementById("msg");
const sendBtn = document.querySelector(".send-btn");
const themePicker = document.getElementById("themePicker");
const app = document.querySelector(".app");
const header = document.querySelector(".header");


// ================= ADD MESSAGE =================

function addMessage(text, type) {

  const div = document.createElement("div");

  div.className = type;
  div.innerText = text;

  chat.appendChild(div);

  chat.scrollTop = chat.scrollHeight;
}


// ================= WELCOME =================

addMessage("Yo Harsimar 😄💙 I'm here bro.", "bot");


// ================= SEND =================

async function send() {

  const text = input.value.trim();

  if (!text) return;

  addMessage("You: " + text, "user");

  input.value = "";


  // Typing
  const typing = document.createElement("div");
  typing.className = "bot";
  typing.innerText = "MindCare is typing...";
  chat.appendChild(typing);


  const token = localStorage.getItem("fcmToken");


  try {

    const res = await fetch("/chat", {

      method: "POST",

      headers: {
        "Content-Type": "application/json"
      },

      body: JSON.stringify({
        message: text,
        fcmToken: token
      })
    });


    const data = await res.json();

    chat.removeChild(typing);

    addMessage("MindCare: " + data.reply, "bot");

  }

  catch (err) {

    console.log(err);

    chat.removeChild(typing);

    addMessage("MindCare: Server down 😭 Try later bro 💙", "bot");
  }
}


// ================= ENTER =================

input.addEventListener("keydown", e => {
  if (e.key === "Enter") send();
});


// =====================================
// THEME + SEND BUTTON CONTRAST LOGIC
// =====================================


// Adjust brightness helper
function adjustColor(hex, amt) {

  let num = parseInt(hex.replace("#", ""), 16);

  let r = Math.min(255, Math.max(0, (num >> 16) + amt));
  let g = Math.min(255, Math.max(0, ((num >> 8) & 255) + amt));
  let b = Math.min(255, Math.max(0, (num & 255) + amt));

  return { r, g, b };
}


// Brightness (for contrast)
function getBrightness({ r, g, b }) {
  return (r * 299 + g * 587 + b * 114) / 1000;
}


// Theme picker
if (themePicker) {

  themePicker.addEventListener("input", () => {

    const base = themePicker.value;


    // App background (lighter)
    const main = adjustColor(base, 40);
    app.style.background = `rgb(${main.r},${main.g},${main.b})`;


    // Header (darker)
    const head = adjustColor(base, -25);
    header.style.background = `rgb(${head.r},${head.g},${head.b})`;


    // Button
    const btn = adjustColor(base, -10);
    sendBtn.style.background = `rgb(${btn.r},${btn.g},${btn.b})`;


    // Auto arrow contrast
    const brightness = getBrightness(btn);

    sendBtn.style.color =
      brightness < 140 ? "#ffffff" : "#1a1a1a";

  });

}