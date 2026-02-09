

// ================= TOKEN =================

function setFCMToken(token) {
  console.log("Saved Token:", token);
  localStorage.setItem("fcmToken", token);
  loadServerChat();
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



// ================= UI =================

const chat = document.getElementById("chat");
const input = document.getElementById("msg");
const sendBtn = document.querySelector(".send-btn");
const themePicker = document.getElementById("themePicker");
const app = document.querySelector(".app");
const header = document.querySelector(".header");
const inputBox = document.querySelector(".input-box");
const langSelect = document.getElementById("langSelect");



// ================= LANGUAGE =================

// Load saved language
const savedLang = localStorage.getItem("userLang") || "hinglish";

if (langSelect) {
  langSelect.value = savedLang;
}

// Save on change
if (langSelect) {

  langSelect.addEventListener("change", () => {

    const lang = langSelect.value;

    localStorage.setItem("userLang", lang);

    addMessage("MindCare: Language set to " + lang + " ✅", "bot");
  });
}



// ================= ADD MESSAGE =================

function addMessage(text, type) {

  const div = document.createElement("div");

  div.className = type;
  div.innerText = text;

  chat.appendChild(div);

  chat.scrollTop = chat.scrollHeight;
}



// ================= LOAD CHAT FROM SERVER =================

async function loadServerChat() {

  const token = localStorage.getItem("fcmToken");

  if (!token) return;

  try {

    const res = await fetch(`/history/${token}`);

    const data = await res.json();

    chat.innerHTML = "";

    data.forEach(m => {

      if (m.role === "user") {
        addMessage("You: " + m.content, "user");
      }

      if (m.role === "assistant") {
        addMessage("MindCare: " + m.content, "bot");
      }

    });

  } catch (err) {

    console.log("History load error:", err);
  }
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

  const lang = localStorage.getItem("userLang") || "hinglish";



  try {

    const res = await fetch("/chat", {

      method: "POST",

      headers: {
        "Content-Type": "application/json"
      },

      body: JSON.stringify({
        message: text,
        fcmToken: token,
        language: lang   // ✅ SEND LANGUAGE
      })
    });


    const data = await res.json();

    chat.removeChild(typing);

    addMessage("MindCare: " + data.reply, "bot");


    // Apply mood theme
    if (data.mood) {

      localStorage.setItem("userMood", data.mood);

      if (moodThemes[data.mood]) {
        applyTheme(moodThemes[data.mood]);
      }
    }

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



// ================= AUTO LOAD =================

window.addEventListener("load", () => {

  const token = localStorage.getItem("fcmToken");

  if (token) {
    loadServerChat();
  }

});