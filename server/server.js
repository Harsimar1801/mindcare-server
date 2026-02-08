const path=require("path");
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
app.use(express.static(path.join(__dirname, "public")));


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

  let reminders = loadReminders();

  const text = message.toLowerCase();


  // Find this user's reminder
  let userReminder = reminders.find(r => r.token === fcmToken);


  // =========================
  // STEP 1: If waiting for date
  // =========================

  if (userReminder && userReminder.waiting) {

    userReminder.date = message;
    userReminder.waiting = false;

    saveReminders(reminders);

    return res.json({
      reply: `Saved 😤🔥 I’ll remind you before your ${userReminder.type} 💙`
    });
  }


  // =========================
  // STEP 2: If exam already saved
  // =========================

  if (
    userReminder &&
    text.includes(userReminder.type)
  ) {

    return res.json({
      reply: `Brooo 😭 your ${userReminder.type} is ${userReminder.date} remember? You got this 💙🔥`
    });
  }


  // =========================
  // STEP 3: Detect new event
  // =========================

  const event = detectEvent(message);

  if (event) {

    // Remove old reminder if exists
    reminders = reminders.filter(r => r.token !== fcmToken);

    reminders.push({
      type: event,
      date: null,
      token: fcmToken,
      waiting: true
    });

    saveReminders(reminders);

    return res.json({
      reply: `Oh damn 😭 when exactly is your ${event}? Date + time bro 💙`
    });
  }


  // =========================
  // STEP 4: Normal AI Chat
  // =========================

  try {

    const completion = await groq.chat.completions.create({

      model: "llama-3.1-8b-instant",
      max_tokens: 120,
      temperature: 0.9,

      messages: [
        {
          role: "system",
          content: `
You are Harsimar's close best friend.
Talk casual. Use emojis.
Be supportive.
Keep replies short.
No robotic tone.
`
        },
        {
          role: "user",
          content: message
        }
      ]
    });

    const reply = completion.choices[0].message.content;

    res.json({ reply });

  } catch (err) {

    console.log(err);

    res.json({
      reply: "Brooo 😭 brain froze. Try again 💙"
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
