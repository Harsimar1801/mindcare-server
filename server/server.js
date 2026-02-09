const path = require("path");
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const fs = require("fs");
const Groq = require("groq-sdk");

// ================= APP =================

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ================= GROQ =================

if (!process.env.GROQ_API_KEY) {
  console.error("❌ GROQ_API_KEY missing");
  process.exit(1);
}

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

// ================= MOOD DETECTOR =================

function detectMood(text) {

  const t = text.toLowerCase();

  if (
    t.includes("happy") ||
    t.includes("good") ||
    t.includes("great") ||
    t.includes("awesome") ||
    t.includes("khush") ||
    t.includes("mast")
  ) return "happy";

  if (
    t.includes("sad") ||
    t.includes("cry") ||
    t.includes("down") ||
    t.includes("low") ||
    t.includes("breakup") ||
    t.includes("depressed")
  ) return "sad";

  if (
    t.includes("stress") ||
    t.includes("anxious") ||
    t.includes("panic") ||
    t.includes("tension")
  ) return "anxious";

  if (
    t.includes("tired") ||
    t.includes("sleep") ||
    t.includes("exhaust")
  ) return "tired";

  if (
    t.includes("alone") ||
    t.includes("lonely") ||
    t.includes("akela")
  ) return "lonely";

  return null;
}

// ================= MOOD REPLIES =================

const moodReplies = {

  happy: [
    "😄 Niceee bro! Bata na, kya cheez ne happy kiya?",
    "Good vibes aa rahi hain 💙 Kya hua aaj?"
  ],

  sad: [
    "Bro 💙 lagta hai kuch heavy chal raha hai… bata na.",
    "I’m here bhai 🤍 Jo bhi hai, share kar."
  ],

  anxious: [
    "Relax bro 💙 Pehle breathe karte hain. Kya tension hai?",
    "Lagta hai pressure zyada hai… kya scene hai?"
  ],

  tired: [
    "😴 Thak gaya lag raha hai bro… aaj ka din kaisa tha?",
    "Rest bhi zaroori hai 💙 kya hua?"
  ],

  lonely: [
    "Tu akela nahi hai bhai 🤍 Main hoon na.",
    "Bata na bro… kya feel ho raha hai?"
  ]
};

function randomFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ================= CHAT =================

app.post("/chat", async (req, res) => {

  try {

    const { message, fcmToken } = req.body;

    if (!message || !fcmToken) {
      return res.json({
        reply: "Bhai kuch likh toh sahi 💙"
      });
    }

    let db = loadDB();

    // Create user
    if (!db[fcmToken]) {

      db[fcmToken] = {
        profile: {
          mood: null
        },
        history: []
      };
    }

    const user = db[fcmToken];

    // Save user msg
    user.history.push({
      role: "user",
      content: message
    });

    if (user.history.length > 12) {
      user.history.shift();
    }

    // ================= MOOD CHECK =================

    const mood = detectMood(message);

    if (mood) {

      user.profile.mood = mood;
      saveDB(db);

      if (moodReplies[mood]) {

        return res.json({
          reply: randomFrom(moodReplies[mood]),
          mood
        });
      }
    }

    // ================= AI =================

    const ai = await groq.chat.completions.create({

      model: "llama-3.1-8b-instant",

      temperature: 0.6, // ⭐ Lower = more stable

      messages: [

        {
          role: "system",
          content: `
You are MindCare.

You are a caring, mature, emotionally intelligent friend.

Rules:
- Be supportive
- Never mock
- Never be insensitive
- No cringe jokes
- No fake motivation
- Use light Hinglish
- Be calm and natural
- If user is sad/broken, be empathetic
- Keep replies short (2-4 lines)
- Ask at most 1 question
`
        },

        ...user.history
      ]
    });

    const reply = ai.choices[0].message.content.trim();

    // Save bot msg
    user.history.push({
      role: "assistant",
      content: reply
    });

    saveDB(db);

    res.json({
      reply,
      mood: user.profile.mood
    });

  }

  catch (err) {

    console.log("🔥 SERVER ERROR:", err);

    res.json({
      reply: "Bhai thoda issue aa gaya 😭 Thodi der baad try kar 💙"
    });
  }
});

// ================= START =================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("✅ Server running on", PORT);
});const path = require("path");
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

if (!process.env.GROQ_API_KEY) {
  console.error("❌ GROQ_API_KEY missing");
  process.exit(1);
}

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
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    day: "numeric",
    month: "short"
  });
}


// ================= MOOD =================

function detectMood(text) {

  const t = text.toLowerCase();

  if (t.includes("happy") || t.includes("mast") || t.includes("good")) return "happy";
  if (t.includes("sad") || t.includes("breakup") || t.includes("low")) return "sad";
  if (t.includes("stress") || t.includes("anxious")) return "anxious";
  if (t.includes("tired") || t.includes("sleep")) return "tired";
  if (t.includes("alone") || t.includes("lonely")) return "lonely";

  return null;
}


const moodReplies = {

  happy: [
    "😄 Nice bro! Kya cheez ne happy kiya?",
  ],

  sad: [
    "Bhai 💙 kya hua? Bata na.",
  ],

  anxious: [
    "Relax bro 🤍 kya tension hai?",
  ],

  tired: [
    "Thak gaya lag raha hai 😴 kya hua?",
  ],

  lonely: [
    "Tu akela nahi hai bhai 💙",
  ]
};

function randomFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}


// ================= DATE PARSER =================

function parseDate(text) {

  const now = Date.now();
  const lower = text.toLowerCase();

  const match = lower.match(/(\d+)\s*(min|mins|minute|minutes)/);

  if (match) {
    return now + parseInt(match[1]) * 60000;
  }

  return null;
}


// ================= CHAT =================

app.post("/chat", async (req, res) => {

  try {

    const { message, fcmToken } = req.body;

    if (!message || !fcmToken) {
      return res.json({
        reply: "Bhai kuch likh toh sahi 💙"
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


    // Save history
    user.history.push({
      role: "user",
      content: message
    });

    if (user.history.length > 12) user.history.shift();


    // ================= MOOD =================

    const mood = detectMood(message);

    if (mood) {

      user.profile.mood = mood;
      saveDB(db);

      if (moodReplies[mood]) {

        return res.json({
          reply: randomFrom(moodReplies[mood]),
          mood
        });
      }
    }


    // ================= EVENT =================

    const time = parseDate(message);

    if (time) {

      const event = {
        title: "Exam",
        time,
        notified: false
      };

      user.events.push(event);

      saveDB(db);

      return res.json({
        reply: `All the best 😤💙 Exam at ${formatTime(time)}`,
        mood: user.profile.mood
      });
    }


    // ================= AI =================

    const ai = await groq.chat.completions.create({

      model: "llama-3.1-8b-instant",
      temperature: 0.6,

      messages: [

        {
          role: "system",
          content: `
You are MindCare.
Be caring, mature, calm.
Use light Hinglish.
No cringe.
Short replies.
`
        },

        ...user.history
      ]
    });


    const reply = ai.choices[0].message.content.trim();


    user.history.push({
      role: "assistant",
      content: reply
    });

    saveDB(db);


    res.json({
      reply,
      mood: user.profile.mood
    });

  }

  catch (err) {

    console.log("🔥 ERROR:", err);

    res.json({
      reply: "Server thoda slow hai 😭 Try later"
    });
  }
});


// ================= REMINDER SYSTEM =================

cron.schedule("*/30 * * * * *", async () => {

  try {

    const db = loadDB();
    const now = Date.now();


    for (const token in db) {

      for (const e of db[token].events) {

        if (e.notified) continue;

        const diff = e.time - now;


        // 5 min before
        if (diff <= 5 * 60000 && diff > 2 * 60000) {

          const msg = `5 min left 😤💙 All the best!`;

          await admin.messaging().send({

            token,

            notification: {
              title: "🔥 You Got This",
              body: msg
            },

            data: {
              message: msg
            }
          });

          e.notified = true;
        }
      }
    }

    saveDB(db);

  } catch (err) {

    console.log("Reminder error:", err);
  }
});


// ================= START =================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("✅ Server running on", PORT);
});