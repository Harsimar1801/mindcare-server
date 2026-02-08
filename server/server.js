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

  if (!message) {
    return res.json({ reply: "Say something bro 😭💙" });
  }

  if (!fcmToken) {
    return res.json({
      reply: "Bro 😭 notifications not ready yet."
    });
  }

  let db = loadDB();

  if (!db[fcmToken]) {
    db[fcmToken] = { events: [], waiting: null };
  }

  const user = db[fcmToken];


  // ===== STEP 2: Save date/time =====

  if (user.waiting) {

    const parsed = await parseDate(message);

    user.events.push({
      type: user.waiting,
      date: parsed.date,
      time: parsed.time,
      raw: message
    });

    user.waiting = null;

    saveDB(db);

    const last = user.events[user.events.length - 1];

    return res.json({
      reply: `Saved 😤🔥 Your ${last.type} is on ${last.date} ${last.time || ""} 💙`
    });
  }


  // ===== STEP 3: Recall =====

  if (message.toLowerCase().includes("when")) {

    const type = detectEvent(message);

    if (type) {

      const e = user.events.find(x => x.type === type);

      if (e) {

        return res.json({
          reply: `Bro 💙 your ${type} is on ${e.date} ${e.time || ""} 😤🔥`
        });

      } else {

        return res.json({
          reply: `I don’t see any ${type} saved yet 😅`
        });
      }
    }
  }


  // ===== STEP 1: New event =====

  const event = detectEvent(message);

  if (event) {

    // Prevent duplicate
    const exists = user.events.find(e => e.type === event);

    if (exists) {

      return res.json({
        reply: `You already told me about your ${event} bro 😭💙 It’s on ${exists.date}`
      });
    }

    user.waiting = event;

    saveDB(db);

    return res.json({
      reply: `Oh damn 😭 when is your ${event}? Date + time 💙`
    });
  }


  // ===== NORMAL CHAT =====

  try {

    const completion = await groq.chat.completions.create({

      model: "llama-3.1-8b-instant",

      temperature: 0.9,

      max_tokens: 120,

      messages: [
        {
          role: "system",
          content: `
You are Harsimar's best friend.
Casual. Emojis. Supportive.
No robotic tone.
`
        },
        {
          role: "user",
          content: message
        }
      ]
    });

    res.json({
      reply: completion.choices[0].message.content
    });

  } catch {

    res.json({
      reply: "Bro 😭 brain lag. Try again 💙"
    });
  }
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