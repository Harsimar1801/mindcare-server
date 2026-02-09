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
const inputBox = document.querySelector(".input-box");


// ================= CHAT STORAGE =================

// Save chat
function saveChat() {

  const messages = [];

  document.querySelectorAll("#chat .user, #chat .bot").forEach(msg => {
    messages.push({
      text: msg.innerText,
      type: msg.className
    });
  });

  localStorage.setItem("mindcare_chat", JSON.stringify(messages));
}


// Load chat
function loadChat() {

  const data = localStorage.getItem("mindcare_chat");

  if (!data) return;

  const messages = JSON.parse(data);

  messages.forEach(m => {

    const div = document.createElement("div");

    div.className = m.type;
    div.innerText = m.text;

    chat.appendChild(div);
  });

  chat.scrollTop = chat.scrollHeight;
}


// ================= ADD MESSAGE =================

function addMessage(text, type) {

  const div = document.createElement("div");

  div.className = type;
  div.innerText = text;

  chat.appendChild(div);

  chat.scrollTop = chat.scrollHeight;

  // ✅ Auto save
  saveChat();
}


// ================= LOAD OLD CHAT =================

loadChat();


// ================= WELCOME =================

// Only show welcome if chat is empty
if (chat.children.length === 0) {
  addMessage("Yo Harsimar 😄💙 I'm here bro.", "bot");
}


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

  chat.scrollTop = chat.scrollHeight;


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
// 🧠 MINDCARE SMART THEME ENGINE
// =====================================


// Mood → Soft Colors
const moodThemes = {
  happy: "#F7C59F",
  calm: "#7FB7BE",
  sad: "#6C63FF",
  anxious: "#C77DFF",
  stressed: "#FF9F68",
  tired: "#9CA3AF",
  lonely: "#B39DDB",
  excited: "#64DFDF"
};


// HEX → RGB
function hexToRgb(hex) {

  let num = parseInt(hex.replace("#", ""), 16);

  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255
  };
}


// Clamp
function clamp(v) {
  return Math.min(255, Math.max(0, v));
}


// Make color soft
function soften({ r, g, b }) {

  return {
    r: clamp(r * 0.6 + 50),
    g: clamp(g * 0.6 + 50),
    b: clamp(b * 0.6 + 50)
  };
}


// Brightness
function brightness({ r, g, b }) {

  return (r * 299 + g * 587 + b * 114) / 1000;
}


// APPLY THEME
function applyTheme(baseHex) {

  const rgb = hexToRgb(baseHex);
  const soft = soften(rgb);

  const bright = brightness(soft);
  const darkMode = bright < 135;


  // App background
  app.style.background = `
    linear-gradient(
      135deg,
      rgba(${soft.r},${soft.g},${soft.b},0.35),
      rgba(${soft.r - 25},${soft.g - 25},${soft.b - 25},0.35)
    )
  `;


  // Header
  header.style.background =
    `rgba(${soft.r},${soft.g},${soft.b},0.45)`;


  // Input area
  inputBox.style.background =
    `rgba(${soft.r},${soft.g},${soft.b},0.25)`;


  // Send button
  sendBtn.style.background =
    `rgb(${soft.r - 10},${soft.g - 10},${soft.b - 10})`;


  // Text colors
  const textColor = darkMode ? "#ffffff" : "#121212";

  app.style.color = textColor;
  input.style.color = textColor;

  input.style.background = darkMode
    ? "rgba(255,255,255,0.15)"
    : "rgba(0,0,0,0.15)";

  sendBtn.style.color = darkMode ? "#fff" : "#111";
}



// ================= LOAD SAVED THEME =================

// From picker
const savedColor = localStorage.getItem("themeColor");

if (savedColor) {
  applyTheme(savedColor);
}


// From mood
const savedMood = localStorage.getItem("userMood");

if (!savedColor && savedMood && moodThemes[savedMood]) {
  applyTheme(moodThemes[savedMood]);
}



// ================= PICKER =================

if (themePicker) {

  themePicker.addEventListener("input", () => {

    const color = themePicker.value;

    applyTheme(color);

    localStorage.setItem("themeColor", color);
  });
}