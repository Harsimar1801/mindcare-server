const path = require("path");
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const fs = require("fs");
const cron = require("node-cron");
const Groq = require("groq-sdk");
const admin = require("firebase-admin");


// ================= FIREBASE =================

if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
  console.error("❌ FIREBASE_SERVICE_ACCOUNT missing");
  process.exit(1);
}

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});


// ================= APP =================

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));


// ================= GROQ =================

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});


// ================= FILE DB =================

const DB_FILE = "./memory.json";

function loadDB() {
  if (!fs.existsSync(DB_FILE)) return {};
  return JSON.parse(fs.readFileSync(DB_FILE));
}

function saveDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}


// ================= HELPERS =================

function formatTime(ts) {
  return new Date(ts).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    day: "numeric",
    month: "short"
  });
}


// ================= MOOD DETECTOR =================

function detectMood(text) {

  const t = text.toLowerCase();

  if (t.includes("happy") || t.includes("excited")) return "happy";
  if (t.includes("sad") || t.includes("cry") || t.includes("down")) return "sad";
  if (t.includes("stress") || t.includes("anxious")) return "anxious";
  if (t.includes("tired") || t.includes("sleep")) return "tired";
  if (t.includes("alone") || t.includes("lonely")) return "lonely";

  return null;
}


// ================= MOOD REPLIES =================

const moodReplies = {

  happy: [
    "Ayy 😄 nice! Bata na, kya cheez ne happy kiya? 💙",
    "Bro 😤🔥 kya scene hai? Why so happy?"
  ],

  sad: [
    "Bro 🫂 kya hua? Bol na.",
    "Hey 😔 main hoon na, kya hua?"
  ],

  anxious: [
    "Relax 😤💙 kya tension chal rahi?",
    "Breathe bro 🤍 kya hua?"
  ],

  tired: [
    "Oof 😴 thak gaya kya? Rest liya?",
    "Bro exhausted lag raha 💙 kya hua?"
  ],

  lonely: [
    "Hey 🤍 tu akela nahi hai bro.",
    "Main hoon na 💙 kya chal raha?"
  ]
};


function randomFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}



// ================= DATE PARSER =================

async function parseDate(text) {

  const now = Date.now();
  const lower = text.toLowerCase();

  const minMatch = lower.match(/(\d+)\s*(min|mins|minute|minutes)/);

  if (minMatch) {
    return {
      timestamp: now + parseInt(minMatch[1]) * 60000
    };
  }

  return {
    timestamp: now + 5 * 60000
  };
}



// ================= CHAT =================

app.post("/chat", async (req, res) => {

  try {

    const { message, fcmToken } = req.body;

    if (!message || !fcmToken) {
      return res.json({
        reply: "Bro 😭 kuch bol na 💙",
        mood: null
      });
    }


    let db = loadDB();


    if (!db[fcmToken]) {

      db[fcmToken] = {
        profile: {
          mood: null
        },
        events: [],
        history: []
      };
    }


    const user = db[fcmToken];



    // ================= SAVE HISTORY =================

    user.history.push({
      role: "user",
      content: message
    });

    if (user.history.length > 15) user.history.shift();



    // ================= MOOD CHECK =================

    const mood = detectMood(message);

    if (mood) {

      user.profile.mood = mood;
      saveDB(db);

      if (moodReplies[mood]) {

        return res.json({
          reply: randomFrom(moodReplies[mood]),
          mood: mood
        });
      }
    }



    // ================= MAIN AI =================

    const chatAI = await groq.chat.completions.create({

      model: "llama-3.1-8b-instant",
      temperature: 0.9,

      messages: [

        {
          role: "system",
          content: `
You are MindCare.
Talk like best friend.
Use Hinglish.
Supportive.
Short replies.
Max 2 questions.
`
        },

        ...user.history
      ]
    });


    const reply = chatAI.choices[0].message.content;


    user.history.push({
      role: "assistant",
      content: reply
    });

    saveDB(db);


    res.json({
      reply,
      mood: user.profile.mood
    });


  } catch (err) {

    console.log("🔥 ERROR:", err);

    res.json({
      reply: "Bro 😭 server down",
      mood: null
    });
  }
});



// ================= START =================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("✅ Server running on", PORT);
});