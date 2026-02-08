
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const fs = require("fs");
const cron = require("node-cron");
const Groq = require("groq-sdk");
const admin = require("firebase-admin");

// Firebase
const serviceAccount = JSON.parse(
  process.env.FIREBASE_SERVICE_ACCOUNT
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

// App
const app = express();
app.use(cors());
app.use(express.json());
app.get("/", (req, res) => {
  res.send("🧠 MindCare Server is Running 💙🔥");
});


// Groq
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

// File DB
const DB_FILE = "./memory.json";

function loadDB() {
  if (!fs.existsSync(DB_FILE)) return {};
  return JSON.parse(fs.readFileSync(DB_FILE));
}

function saveDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// Detect event
function detectEvent(text) {
  const words = ["exam", "test", "quiz", "interview", "presentation"];
  return words.find(w => text.toLowerCase().includes(w));
}

// AI Date Parser
async function parseDate(text) {

  const res = await groq.chat.completions.create({

    model: "llama-3.1-8b-instant",

    messages: [
      {
        role: "system",
        content: `
Convert the user message into JSON:
{
  date: "YYYY-MM-DD",
  time: "HH:MM" or null
}

If unclear, guess best possible.
Only output JSON.
`
      },
      {
        role: "user",
        content: text
      }
    ]
  });

  return JSON.parse(res.choices[0].message.content);
}

// ================= CHAT =================

app.post("/chat", async (req, res) => {

  const { message, fcmToken } = req.body;

  if (!fcmToken) {
    return res.json({
      reply: "Bro 😭 notification token missing."
    });
  }

  let db = loadDB();

  if (!db[fcmToken]) {
    db[fcmToken] = { events: [], waiting: null };
  }

  const user = db[fcmToken];


  // STEP 2: Waiting for date
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

    return res.json({
      reply: `Saved 😤🔥 I’ll remind you before your ${user.events.at(-1).type} 💙`
    });
  }


  // STEP 3: Recall
  if (message.toLowerCase().includes("when")) {

    const type = detectEvent(message);

    if (type) {

      const e = user.events.find(x => x.type === type);

      if (e) {

        return res.json({
          reply: `Bro 😭 your ${type} is on ${e.date} ${e.time || ""} 💙🔥`
        });

      } else {

        return res.json({
          reply: `I don’t see any ${type} saved yet 😅`
        });
      }
    }
  }


  // STEP 1: Detect new event
  const event = detectEvent(message);

  if (event) {

    user.waiting = event;

    saveDB(db);

    return res.json({
      reply: `Oh damn 😭 when exactly is your ${event}? Date + time bro 💙`
    });
  }


  // Normal Chat
  try {

    const completion = await groq.chat.completions.create({

      model: "llama-3.1-8b-instant",

      temperature: 0.9,

      max_tokens: 120,

      messages: [
        {
          role: "system",
          content: `
You are Harsimar's supportive best friend.
Casual tone. Emojis. Short replies.
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


// ================= DAILY NOTIFY =================

cron.schedule("0 9 * * *", async () => {

  const db = loadDB();
  const today = new Date().toISOString().slice(0,10);

  console.log("⏰ Checking reminders", today);

  for (const token in db) {

    db[token].events.forEach(async e => {

      if (e.date === today) {

        await admin.messaging().send({

          token,

          notification: {
            title: "🧠 MindCare",
            body: `How was your ${e.type}? 😤💙`
          }
        });

      }
    });
  }
});


// Start
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("✅ Server running", PORT);
});
