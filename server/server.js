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

// Groq
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

// Helpers
const REMINDER_FILE = "./reminders.json";

// Load reminders
function loadReminders() {
  if (!fs.existsSync(REMINDER_FILE)) return [];
  return JSON.parse(fs.readFileSync(REMINDER_FILE));
}

// Save reminders
function saveReminders(data) {
  fs.writeFileSync(REMINDER_FILE, JSON.stringify(data, null, 2));
}

// Detect event
function detectEvent(text) {
  const keywords = ["exam", "test", "interview", "quiz", "presentation"];

  return keywords.find(k => text.toLowerCase().includes(k));
}

// Chat API
app.post("/chat", async (req, res) => {

  const { message, fcmToken } = req.body;

  let reminders = loadReminders();

  // Check if user already waiting for date
  let waiting = reminders.find(r => r.waiting === true);

  // Step 2: User gives date
  if (waiting) {

    waiting.date = message;
    waiting.waiting = false;

    saveReminders(reminders);

    return res.json({
      reply: `Got you bro 💙 I’ll remind you after your ${waiting.type} 😤🔥`
    });
  }

  // Step 1: Detect event
  const event = detectEvent(message);

  if (event) {

    reminders.push({
      type: event,
      date: null,
      token: fcmToken,
      waiting: true
    });

    saveReminders(reminders);

    return res.json({
      reply: `Oh damn 😭 when is your ${event} exactly?`
    });
  }

  // Normal AI reply
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
Talk casual. Use emojis. Be supportive.
Keep replies short.
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

// Daily Reminder Check (9 AM)
cron.schedule("0 9 * * *", async () => {

  console.log("⏰ Checking reminders...");

  let reminders = loadReminders();
  let today = new Date().toDateString();

  reminders.forEach(async (r) => {

    if (!r.date) return;

    if (new Date(r.date).toDateString() === today) {

      await admin.messaging().send({
        token: r.token,
        notification: {
          title: "🧠 MindCare",
          body: `Hey bro 💙 how was your ${r.type}? 😤🔥`
        }
      });
    }
  });

});


// Start
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("✅ Server running on", PORT);
});
