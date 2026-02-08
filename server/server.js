const path = require("path");
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const fs = require("fs");
const cron = require("node-cron");
const Groq = require("groq-sdk");
const admin = require("firebase-admin");

// ================= FIREBASE SAFE INIT =================

if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
  console.error("❌ FIREBASE_SERVICE_ACCOUNT missing");
  process.exit(1);
}

const serviceAccount = JSON.parse(
  process.env.FIREBASE_SERVICE_ACCOUNT
);

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

function detectEvent(text) {
  const words = ["exam", "test", "quiz", "interview", "presentation"];
  return words.find(w => text.toLowerCase().includes(w));
}

// Safe AI date parser
async function parseDate(text) {

  try {

    const res = await groq.chat.completions.create({

      model: "llama-3.1-8b-instant",

      temperature: 0,

      messages: [
        {
          role: "system",
          content: `
Return ONLY valid JSON:

{
  "date": "YYYY-MM-DD",
  "time": "HH:MM" or null
}

No explanation.
`
        },
        {
          role: "user",
          content: text
        }
      ]
    });

    const raw = res.choices[0].message.content;

    return JSON.parse(raw);

  } catch {

    // fallback if AI fails
    return {
      date: new Date().toISOString().slice(0,10),
      time: null
    };
  }
}


// ================= CHAT =================

app.post("/chat", async (req, res) => {

  const { message, fcmToken } = req.body;

  if (!message || !fcmToken) {
    return res.json({ reply: "Say something bro 😭💙" });
  }

  let db = loadDB();

  if (!db[fcmToken]) {
    db[fcmToken] = {
      memory: {},
      events: [],
      history: []
    };
  }

  const user = db[fcmToken];


  // ================= SAVE USER MESSAGE =================

  user.history.push({
    role: "user",
    content: message
  });

  // Keep last 10 messages only (memory limit)
  if (user.history.length > 10) {
    user.history.shift();
  }


  // ================= MEMORY EXTRACTOR =================

  const memoryAI = await groq.chat.completions.create({

    model: "llama-3.1-8b-instant",

    temperature: 0.2,

    max_tokens: 250,

    messages: [

      {
        role: "system",
        content: `
Extract personal info.

Return JSON:

{
 "memory": {
   "name": null,
   "friend": null,
   "college": null,
   "exam_date": null,
   "exam_time": null
 }
}

Only JSON.
`
      },

      ...user.history
    ]
  });


  let extracted = {};

  try {
    extracted = JSON.parse(memoryAI.choices[0].message.content);
  } catch {
    extracted = { memory: {} };
  }


  // ================= SAVE MEMORY =================

  for (const key in extracted.memory || {}) {

    if (extracted.memory[key]) {
      user.memory[key] = extracted.memory[key];
    }
  }


  // ================= MAIN CHAT AI =================

  const chatAI = await groq.chat.completions.create({

    model: "llama-3.1-8b-instant",

    temperature: 0.9,

    max_tokens: 200,

    messages: [

      {
        role: "system",
        content: `
You are Harsimar's caring best friend.

User profile:
${JSON.stringify(user.memory)}

Rules:
- Be consistent
- Continue conversations
- Use emojis
- Be supportive
`
      },

      ...user.history
    ]
  });


  const reply = chatAI.choices[0].message.content;


  // ================= SAVE BOT MESSAGE =================

  user.history.push({
    role: "assistant",
    content: reply
  });

  saveDB(db);


  res.json({ reply });
});


// ================= DAILY REMINDER =================

cron.schedule("0 9 * * *", async () => {

  const db = loadDB();

  const today = new Date().toISOString().slice(0,10);

  console.log("⏰ Checking reminders", today);

  for (const token in db) {

    for (const e of db[token].events) {

      if (e.date === today) {

        await admin.messaging().send({

          token,

          notification: {
            title: "🧠 MindCare",
            body: `How was your ${e.type}? 😤💙`
          }
        });
      }
    }
  }
});


// ================= START =================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("✅ Server running on", PORT);
});