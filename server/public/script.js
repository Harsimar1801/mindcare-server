// ================= UI =================

const chat = document.getElementById("chat");
const input = document.getElementById("msg");
const sendBtn = document.querySelector(".send-btn");
const app = document.querySelector(".app");
const header = document.querySelector(".header");
const inputBox = document.querySelector(".input-box");



// ================= CHAT STORAGE =================

function saveChat() {

  const messages = [];

  document.querySelectorAll("#chat .user, #chat .bot").forEach(m => {

    messages.push({
      text: m.innerText,
      type: m.className
    });

  });

  localStorage.setItem("mindcare_chat", JSON.stringify(messages));
}


function loadChat() {

  const data = localStorage.getItem("mindcare_chat");

  if (!data) return;

  JSON.parse(data).forEach(m => {

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

  saveChat();
}



// ================= LOAD CHAT =================

loadChat();

// ================= SHOW MOOD WELCOME =================

if (chat.children.length === 0) {

  const mood = localStorage.getItem("userMood") || "neutral";

  const msg = getMoodWelcome(mood);

  addMessage("MindCare: " + msg, "bot");
}

// ================= MOOD WELCOME =================

function getMoodWelcome(mood) {

  const map = {

    happy: "😄 You sound happy today bro! What made you smile?",
    sad: "🥺 You seem low… want to talk?",
    anxious: "😰 Feeling anxious? I'm here.",
    tired: "😴 You look tired bro…",
    lonely: "💙 Feeling alone? I'm here.",
    excited: "🔥 You sound excited!",
    neutral: "Hey bro 💙 How are you feeling today?"
  };

  return map[mood] || map.neutral;
}



// ================= FIRST MESSAGE =================

function showInitialMessage() {

  if (chat.children.length > 0) return;

  const mood = localStorage.getItem("userMood") || "neutral";

  addMessage("MindCare: " + getMoodWelcome(mood), "bot");
}

showInitialMessage();



// ================= SEND =================

async function send() {

  const text = input.value.trim();

  if (!text) return;

  addMessage("You: " + text, "user");

  input.value = "";


  const typing = document.createElement("div");
  typing.className = "bot";
  typing.innerText = "MindCare is typing...";
  chat.appendChild(typing);


  try {

    const res = await fetch("/chat", {

      method: "POST",

      headers: {
        "Content-Type": "application/json"
      },

      body: JSON.stringify({
        message: text,
        fcmToken: localStorage.getItem("fcmToken")
      })
    });


    const data = await res.json();
// ================= APPLY MOOD FROM SERVER =================

if (data.mood) {

  console.log("Mood from server:", data.mood);

  // Save mood
  localStorage.setItem("userMood", data.mood);

  // Apply theme instantly
  if (moodThemes[data.mood]) {
    applyTheme(moodThemes[data.mood]);
  }

  // Clear old welcome so it refreshes
  localStorage.removeItem("mindcare_chat");
}
    chat.removeChild(typing);

    addMessage("MindCare: " + data.reply, "bot");


    // ================= SAVE MOOD =================

    if (data.mood) {

      localStorage.setItem("userMood", data.mood);

      if (moodThemes[data.mood]) {
        applyTheme(moodThemes[data.mood]);
      }
    }


  } catch {

    chat.removeChild(typing);

    addMessage("MindCare: Server down 😭", "bot");
  }
}



// ================= ENTER =================

input.addEventListener("keydown", e => {
  if (e.key === "Enter") send();
});



// =====================================
// 🎨 THEME ENGINE
// =====================================


const moodThemes = {

  happy: "#F7C59F",
  calm: "#7FB7BE",
  sad: "#6C63FF",
  anxious: "#C77DFF",
  tired: "#9CA3AF",
  lonely: "#B39DDB",
  excited: "#64DFDF"
};



function hexToRgb(hex) {

  let num = parseInt(hex.replace("#", ""), 16);

  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255
  };
}


function clamp(v) {
  return Math.min(255, Math.max(0, v));
}


function soften({ r, g, b }) {

  return {
    r: clamp(r * 0.6 + 50),
    g: clamp(g * 0.6 + 50),
    b: clamp(b * 0.6 + 50)
  };
}


function brightness({ r, g, b }) {

  return (r * 299 + g * 587 + b * 114) / 1000;
}



function applyTheme(hex) {

  const soft = soften(hexToRgb(hex));

  const dark = brightness(soft) < 135;


  app.style.background = `
    linear-gradient(
      135deg,
      rgba(${soft.r},${soft.g},${soft.b},0.35),
      rgba(${soft.r-25},${soft.g-25},${soft.b-25},0.35)
    )
  `;


  header.style.background =
    `rgba(${soft.r},${soft.g},${soft.b},0.45)`;


  inputBox.style.background =
    `rgba(${soft.r},${soft.g},${soft.b},0.25)`;


  sendBtn.style.background =
    `rgb(${soft.r-10},${soft.g-10},${soft.b-10})`;


  const color = dark ? "#fff" : "#111";

  app.style.color = color;
  input.style.color = color;
  sendBtn.style.color = color;
}



// ================= APPLY ON LOAD =================

(function(){

  const mood = localStorage.getItem("userMood");

  if (mood && moodThemes[mood]) {

    applyTheme(moodThemes[mood]);
  }

})();