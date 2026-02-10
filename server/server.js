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
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, "{}");
    return {};
  }
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

  if (t.match(/happy|good|great|awesome|amazing|nice/)) return "happy";
  if (t.match(/sad|cry|down|breakup|depressed|heartbroken|left me/)) return "sad";
  if (t.match(/stress|anxious|panic|tension|worried/)) return "anxious";
  if (t.match(/tired|sleep|exhaust|fatigue/)) return "tired";
  if (t.match(/alone|lonely|akela|isolated/)) return "lonely";

  return null;
}


// ================= MOOD REPLIES =================

const moodReplies = {

  happy: [
    "That’s really nice to hear. I’m glad something is making you feel good today.",
    "You sound positive. It’s good to see you feeling this way."
  ],

  sad: [
    "I’m really sorry you’re feeling this way. Breakups and emotional pain can hurt deeply. It’s okay to feel lost sometimes. You’re not weak for feeling this.",
    "That sounds really painful. Anyone in your place would feel hurt. You don’t have to go through this alone."
  ],

  anxious: [
    "It sounds overwhelming right now. Take a slow breath. You’re doing your best, even if it doesn’t feel like it.",
    "Feeling anxious can be exhausting. You’re not failing. You’re just human."
  ],

  tired: [
    "You seem really drained. It’s okay to slow down and take care of yourself.",
    "Being tired all the time can affect everything. You deserve rest."
  ],

  lonely: [
    "Feeling lonely can be very heavy. You matter, and you’re not invisible here.",
    "Even when it feels like no one understands, you’re not alone right now."
  ]
};

function randomFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}


// ================= TIME PARSER =================

function parseDate(text) {

  const match = text
    .toLowerCase()
    .match(/(\d+)\s*(min|mins|minute|minutes)/);

  if (!match) return null;

  return Date.now() + parseInt(match[1]) * 60000;
}


// ================= CHAT =================

app.post("/chat", async (req, res) => {

  try {

    const { message, fcmToken } = req.body;

    if (!message || !fcmToken) {
      return res.json({ reply: "Please type something first." });
    }


    let db = loadDB();


    if (!db[fcmToken]) {

      db[fcmToken] = {
        profile: { mood: null },
        history: [],
        events: []
      };
    }


    const user = db[fcmToken];


    // Save user message
    user.history.push({
      role: "user",
      content: message
    });

    if (user.history.length > 20) user.history.shift();


    // ================= MOOD =================

    const mood = detectMood(message);

    if (mood) {

      user.profile.mood = mood;

      const reply = randomFrom(moodReplies[mood]);

      user.history.push({
        role: "assistant",
        content: reply
      });

      saveDB(db);

      return res.json({ reply, mood });
    }


    // ================= EVENT =================

    const time = parseDate(message);

    if (time) {

      user.events.push({
        title: "Exam",
        time,
        notified: {
          before: false,
          after: false
        }
      });

      const reply = `All the best. Your exam is at ${formatTime(time)}. Stay calm and confident.`;

      user.history.push({
        role: "assistant",
        content: reply
      });

      saveDB(db);

      return res.json({ reply, mood: user.profile.mood });
    }


    // ================= AI =================

    const ai = await groq.chat.completions.create({

      model: "llama-3.1-8b-instant",
      temperature: 0.5,

      messages: [

        {
          role: "system",
          content: `
You are MindCare, a mental health support assistant.

Your main goal is to listen and emotionally support the user.

Rules:

- Reply ONLY in English
- Be warm, empathetic, and validating
- Use Emoji too during conversations 
- Never sound robotic
- Do NOT ask questions when user is sad, lonely, heartbroken, or depressed
- First acknowledge feelings
- Show understanding
- Reassure gently
- Only ask a question if the user clearly wants advice

Style:
- Soft
- Human-like
- Comforting
- Non-judgmental
- Supportive
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

    console.log("🔥 SERVER ERROR:", err);

    res.json({ reply: "Something went wrong. Please try again." });
  }
});



// ================= HISTORY API =================

app.get("/history/:token", (req, res) => {

  try {

    const token = req.params.token;

    if (!token) return res.json([]);

    const db = loadDB();

    if (!db[token]) return res.json([]);

    res.json(db[token].history || []);

  } catch (err) {

    console.log("History error:", err);
    res.json([]);
  }
});



// ================= REMINDER SYSTEM =================

cron.schedule("*/30 * * * * *", async () => {

  try {

    const db = loadDB();
    const now = Date.now();


    for (const token in db) {

      const user = db[token];

      if (!user.events || !user.history) continue;


      for (const e of user.events) {

        const diff = e.time - now;


        // BEFORE
        if (
          diff <= 5 * 60000 &&
          diff > 2 * 60000 &&
          !e.notified.before
        ) {

          const msg = "5 minutes left. You can do this. Stay focused.";

          user.history.push({
            role: "assistant",
            content: msg
          });


          await admin.messaging().send({

            token,

            notification: {
              title: "You’ve Got This",
              body: msg
            },

            data: {
              message: msg
            }

          });

          e.notified.before = true;
        }


        // AFTER
        if (
          diff <= -2 * 60000 &&
          !e.notified.after
        ) {

          const msg = "How did your exam go? I’m proud of you for trying.";

          user.history.push({
            role: "assistant",
            content: msg
          });


          await admin.messaging().send({

            token,

            notification: {
              title: "Checking In",
              body: msg
            },

            data: {
              message: msg
            }

          });

          e.notified.after = true;
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