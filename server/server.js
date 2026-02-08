require("dotenv").config();

const express = require("express");
const cors = require("cors");
const fs = require("fs");
const Groq = require("groq-sdk");
const admin = require("firebase-admin");

// ---------------- FIREBASE ----------------

const serviceAccount = JSON.parse(
  process.env.FIREBASE_SERVICE_ACCOUNT
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

// ---------------- APP ----------------

const app = express();
app.use(cors());
app.use(express.json());

// ---------------- GROQ ----------------

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

// ---------------- STORAGE ----------------

const REMINDER_FILE = "./reminders.json";

function loadReminders() {
  if (!fs.existsSync(REMINDER_FILE)) return [];
  return JSON.parse(fs.readFileSync(REMINDER_FILE));
}

function saveReminders(data) {
  fs.writeFileSync(REMINDER_FILE, JSON.stringify(data, null, 2));
}

// ---------------- HELPERS ----------------

function detectEvent(text) {

  const keywords = [
    "exam",
    "test",
    "quiz",
    "interview",
    "presentation"
  ];

  return keywords.find(k =>
    text.toLowerCase().includes(k)
  );
}

// Convert "12 Feb" → Date
function parseDate(text) {

  const year = new Date().getFullYear();

  const full = `${text} ${year}`;

  const d = new Date(full);

  if (isNaN(d)) return null;

  return d;
}

// ---------------- CHAT API ----------------

app.post("/chat", async (req, res) => {

  const { message, fcmToken } = req.body;

  if (!message || !fcmToken) {
    return res.json({
      reply: "Bro 😭 something missing"
    });
  }

  let reminders = loadReminders();

  // Find THIS USER waiting
  let waiting = reminders.find(
    r => r.waiting && r.token === fcmToken
  );

  // -------- STEP 2: USER SENT DATE --------

  if (waiting) {

    const date = parseDate(message);

    if (!date) {

      return res.json({
        reply: "Bro 😭 write like: 12 Feb"
      });

    }

    waiting.date = date.toISOString();
    waiting.waiting = false;

    saveReminders(reminders);

    return res.json({
      reply: `Done 😤💙 I’ll check on you after your ${waiting.type}`
    });
  }

  // -------- STEP 1: DETECT EVENT --------

  const event = detectEvent(message);

  if (event) {

    reminders.push({
      type: event,
      date: null,
      token: fcmToken,
      waiting: true,
      createdAt: new Date().toISOString()
    });

    saveReminders(reminders);

    return res.json({
      reply: `Ooo 😮🔥 when is your ${event}? (ex: 12 Feb)`
    });
  }

  // -------- NORMAL AI --------

  try {

    const completion = await groq.chat.completions.create({

      model: "llama-3.1-8b-instant",

      max_tokens: 120,
      temperature: 0.9,

      messages: [
        {
          role: "system",
          content: `
You are Harsimar's best friend.
Talk casual.
Use emojis.
Be supportive.
Keep short.
`
        },
        {
          role: "user",
          content: message
        }
      ]
    });

    const reply =
      completion.choices[0].message.content;

    res.json({ reply });

  } catch (err) {

    console.log(err);

    res.json({
      reply: "Bro 😭 server tired. Try again 💙"
    });
  }
});

// ---------------- REMINDER CHECK ----------------

// Check every 10 minutes
setInterval(async () => {

  console.log("⏰ Checking reminders...");

  let reminders = loadReminders();

  const now = new Date();

  reminders.forEach(async (r) => {

    if (!r.date || r.sent) return;

    const eventDate = new Date(r.date);

    // If date passed
    if (now > eventDate) {

      try {

        await admin.messaging().send({

          token: r.token,

          notification: {
            title: "🧠 MindCare 💙",
            body: `Bro 😤 how was your ${r.type}?`
          }

        });

        r.sent = true;

        console.log("✅ Reminder sent");

      } catch (err) {

        console.log("FCM error:", err);
      }
    }

  });

  saveReminders(reminders);

}, 10 * 60 * 1000); // 10 min

// ---------------- START ----------------

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("✅ Server running on", PORT);
});
