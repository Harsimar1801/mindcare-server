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

  if (t.includes("stress") || t.includes("anxious") || t.includes("panic"))
    return "anxious";

  if (t.includes("tired") || t.includes("burnout") || t.includes("sleepy"))
    return "tired";

  if (t.includes("lonely") || t.includes("alone"))
    return "lonely";

  return null;
}


// ================= MOOD REPLIES =================

const moodReplies = {

  happy: [
    "Ayy 😄 love this vibe! What made you happy today bro?",
    "Niceee 💙 why you smiling like that? Bata na 😤"
  ],

  sad: [
    "Bro 💙 kya hua? I’m here.",
    "Hey 😔 wanna talk about it?"
  ],

  anxious: [
    "Hey relax 😤💙 what’s stressing you?",
    "Breathe first bro 🤍 tell me."
  ],

  tired: [
    "Oof 😴 long day? What drained you?",
    "Bro you sound exhausted 💙 kya scene?"
  ],

  lonely: [
    "Hey 🤍 you’re not alone. Talk to me.",
    "Main hoon na 💙 kya hua?"
  ]
};


function randomFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}



// ================= DATE PARSER =================

async function parseDate(text) {

  const now = Date.now();
  const lower = text.toLowerCase();


  // Manual min parse
  const minMatch = lower.match(/(\d+)\s*(min|mins|minute|minutes)/);

  if (minMatch) {

    const mins = parseInt(minMatch[1]);

    if (!isNaN(mins)) {
      return {
        timestamp: now + mins * 60 * 1000
      };
    }
  }


  // AI fallback
  try {

    const res = await groq.chat.completions.create({

      model: "llama-3.1-8b-instant",
      temperature: 0,

      messages: [
        {
          role: "system",
          content: `
Current timestamp: ${now}

Convert user message to FUTURE timestamp.

Return ONLY JSON:

{
 "timestamp": number
}
`
        },
        {
          role: "user",
          content: text
        }
      ]
    });

    const parsed = JSON.parse(res.choices[0].message.content);

    if (!parsed.timestamp || parsed.timestamp <= now) {
      throw new Error("Bad time");
    }

    return parsed;

  } catch {

    return {
      timestamp: now + 5 * 60 * 1000
    };
  }
}



// ================= EVENT AI =================

async function detectEventAI(text) {

  try {

    const res = await groq.chat.completions.create({

      model: "llama-3.1-8b-instant",
      temperature: 0,

      messages: [
        {
          role: "system",
          content: `
Detect future event.

Return ONLY JSON:

{
  "hasEvent": true/false,
  "title": "event name"
}
`
        },
        {
          role: "user",
          content: text
        }
      ]
    });

    return JSON.parse(res.choices[0].message.content);

  } catch {

    return { hasEvent: false };
  }
}



// ================= CHAT =================

app.post("/chat", async (req, res) => {

  try {

    const { message, fcmToken } = req.body;

    if (!message || !fcmToken) {
      return res.json({ reply: "Bro 😭 kuch bol na 💙" });
    }


    let db = loadDB();


    // Create user
    if (!db[fcmToken]) {

      db[fcmToken] = {
        profile: {
          name: null,
          mood: null   // ⭐ IMPORTANT
        },
        events: [],
        history: [],
        waitingFor: null
      };
    }


    const user = db[fcmToken];



    // ================= SAVE HISTORY =================

    user.history.push({
      role: "user",
      content: message
    });

    if (user.history.length > 12) user.history.shift();



    // ================= MOOD CHECK =================

    const mood = detectMood(message);

    if (mood && user.profile.mood !== mood) {

      user.profile.mood = mood;

      saveDB(db);

      if (moodReplies[mood]) {

        return res.json({
          reply: randomFrom(moodReplies[mood])
        });
      }
    }



    // ================= WAITING MODE =================

    if (user.waitingFor) {

      const parsed = await parseDate(message);

      const event = {
        title: user.waitingFor.title,
        timestamp: parsed.timestamp,
        notified: { five:false, after:false }
      };

      user.events.push(event);

      user.waitingFor = null;

      saveDB(db);

      return res.json({
        reply: `Saved 😤🔥 ${event.title} at ${formatTime(event.timestamp)} 💙`
      });
    }



    // ================= EVENT DETECT =================

    const aiEvent = await detectEventAI(message);

    if (aiEvent.hasEvent && !user.waitingFor) {

      const parsed = await parseDate(message);

      if (parsed.timestamp) {

        const event = {
          title: aiEvent.title,
          timestamp: parsed.timestamp,
          notified: { five:false, after:false }
        };

        user.events.push(event);

        saveDB(db);

        return res.json({
          reply: `Got you 😤🔥 ${event.title} at ${formatTime(event.timestamp)} 💙`
        });
      }

      user.waitingFor = aiEvent;

      saveDB(db);

      return res.json({
        reply: `Kab hai "${aiEvent.title}"? ⏰💙`
      });
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

Talk like a real college best friend.
Use Hinglish sometimes.
No robotic tone.
Supportive + funny.
Keep replies short.
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


    res.json({ reply });

  } catch (err) {

    console.log("🔥 CHAT ERROR:", err);

    res.json({
      reply: "Bro 😭 server lag gaya 💙"
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

        if (!e.timestamp) continue;

        const diff = e.timestamp - now;


        // 5 min before
        if (
          diff <= 5 * 60 * 1000 &&
          diff > 3 * 60 * 1000 &&
          !e.notified.five
        ) {

          await admin.messaging().send({

            token,

            notification: {
              title: "🔥 You Got This",
              body: `5 min left for ${e.title} 😤💙`
            }
          });

          e.notified.five = true;
        }


        // After
        if (
          diff <= -2 * 60 * 1000 &&
          !e.notified.after
        ) {

          await admin.messaging().send({

            token,

            notification: {
              title: "💙 Proud of You",
              body: `Kaisa gaya ${e.title}? 🤗`
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