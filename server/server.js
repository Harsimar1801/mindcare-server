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



// ================= MOOD =================

function detectMood(text) {

  const t = text.toLowerCase();

  if (t.match(/happy|good|great|awesome|mast|khush/)) return "happy";
  if (t.match(/sad|cry|down|breakup|depressed|low/)) return "sad";
  if (t.match(/stress|anxious|panic|tension/)) return "anxious";
  if (t.match(/tired|sleep|exhaust/)) return "tired";
  if (t.match(/alone|lonely|akela/)) return "lonely";

  return null;
}



// ================= MOOD REPLIES =================

const moodReplies = {

  happy: [
    "😄 Nice bro! Bata na, kya cheez ne happy kiya?",
    "Good vibes aa rahi hain 💙 Kya hua?"
  ],

  sad: [
    "Bhai 💙 lagta hai heavy feel ho raha hai… bata na.",
    "Main hoon na 🤍 kya hua?"
  ],

  anxious: [
    "Relax bro 💙 pehle breathe karte hain.",
    "Pressure zyada lag raha?"
  ],

  tired: [
    "😴 Thak gaya lag raha hai bro… rest liya?",
    "Aaj ka din tough tha kya?"
  ],

  lonely: [
    "Tu akela nahi hai bhai 💙",
    "Main hoon na 🤍 baat kar."
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

    const { message, fcmToken, language } = req.body;

    if (!message || !fcmToken) {
      return res.json({ reply: "Bhai kuch likh toh sahi 💙" });
    }


    let db = loadDB();


    // Create user
    if (!db[fcmToken]) {

      db[fcmToken] = {
        profile: {
          mood: null,
          language: "hinglish"
        },
        history: [],
        events: [],
        lastCheckIn: 0
      };
    }


    const user = db[fcmToken];


    // Save language
    if (language) {
      user.profile.language = language;
    }



    // Save user msg (WITH TIME)
    user.history.push({
      role: "user",
      content: message,
      time: Date.now()
    });

    if (user.history.length > 30) user.history.shift();



    // ================= MOOD =================

    const mood = detectMood(message);

    if (mood) {

      user.profile.mood = mood;

      const reply = randomFrom(moodReplies[mood]);

      user.history.push({
        role: "assistant",
        content: reply,
        time: Date.now()
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

      const reply = `All the best 😤💙 Exam at ${formatTime(time)}`;

      user.history.push({
        role: "assistant",
        content: reply,
        time: Date.now()
      });

      saveDB(db);

      return res.json({ reply, mood: user.profile.mood });
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

User language: ${user.profile.language}

Rules:

If language is "english": English only
If language is "hinglish": Mix Hindi + English
If language is "hindi": Hindi only

Be caring.
Short replies.
Ask max 1 question.
`
        },

        ...user.history.map(h => ({
          role: h.role,
          content: h.content
        }))
      ]
    });


    const reply = ai.choices[0].message.content.trim();


    user.history.push({
      role: "assistant",
      content: reply,
      time: Date.now()
    });

    saveDB(db);


    res.json({
      reply,
      mood: user.profile.mood
    });

  }

  catch (err) {

    console.log("🔥 SERVER ERROR:", err);

    res.json({ reply: "Bhai thoda issue aa gaya 😭" });
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



// ================= REMINDER + CHECK-IN =================

cron.schedule("*/30 * * * * *", async () => {

  try {

    const db = loadDB();
    const now = Date.now();


    for (const token in db) {

      const user = db[token];

      if (!user.events || !user.history) continue;



      // ✅ CHECK-IN EVERY 6 HOURS
      if (!user.lastCheckIn || now - user.lastCheckIn > 6 * 60 * 60 * 1000) {

        const msg = "Hey bro 👋 sab theek hai? Kya chal raha?";

        user.history.push({
          role: "assistant",
          content: msg,
          time: Date.now()
        });

        await admin.messaging().send({
          token,
          notification: {
            title: "💙 MindCare",
            body: msg
          }
        });

        user.lastCheckIn = now;
      }



      for (const e of user.events) {

        const diff = e.time - now;


        // BEFORE
        if (
          diff <= 5 * 60000 &&
          diff > 2 * 60000 &&
          !e.notified.before
        ) {

          const msg = "5 min left 😤💙 All the best!";

          user.history.push({
            role: "assistant",
            content: msg,
            time: Date.now()
          });

          await admin.messaging().send({
            token,
            notification: {
              title: "🔥 You Got This",
              body: msg
            }
          });

          e.notified.before = true;
        }


        // AFTER
        if (
          diff <= -2 * 60000 &&
          !e.notified.after
        ) {

          const msg = "Kaisa gaya exam? 🤗 Bata na";

          user.history.push({
            role: "assistant",
            content: msg,
            time: Date.now()
          });

          await admin.messaging().send({
            token,
            notification: {
              title: "💙 Proud of You",
              body: msg
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