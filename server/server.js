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

// Format time in IST
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


// Mood detector
function detectMood(text) {

  text = text.toLowerCase();

  if (text.includes("sad") || text.includes("cry")) return "low";
  if (text.includes("stress") || text.includes("anxious")) return "anxious";
  if (text.includes("happy") || text.includes("great")) return "high";
  if (text.includes("tired")) return "tired";

  return null;
}


// Name detector
function detectName(text) {
  const match = text.match(/my name is (\w+)/i);
  return match ? match[1] : null;
}


// ================= EVENT AI =================

async function detectEventAI(text) {

  try {

    const res = await groq.chat.completions.create({

      model: "llama-3.1-8b-instant",

      temperature: 0,

      max_tokens: 120,

      messages: [
        {
          role: "system",
          content: `
Detect if user mentions ANY future event.

Return ONLY JSON:

{
  "hasEvent": true/false,
  "title": "event name",
  "description": "short desc"
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



// ================= DATE PARSER =================

async function parseDate(text) {

  try {

    const now = Date.now();

    const res = await groq.chat.completions.create({

      model: "llama-3.1-8b-instant",

      temperature: 0,

      messages: [
        {
          role: "system",
          content: `
Current timestamp: ${now}

Convert user message to FUTURE timestamp.

Rules:
- Always future time
- "in 5 min" = now+5min
- "tomorrow 9am" = correct

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
      throw new Error("Invalid time");
    }

    return parsed;

  } catch {

    console.log("⚠️ Time parse fallback");

    return {
      timestamp: Date.now() + 5 * 60 * 1000
    };
  }
}



// ================= CHAT =================

app.post("/chat", async (req, res) => {

  try {

    const { message, fcmToken } = req.body;

    if (!message || !fcmToken) {
      return res.json({ reply: "Bro 😭 say something 💙" });
    }


    let db = loadDB();


    // Create user
    if (!db[fcmToken]) {

      db[fcmToken] = {

        profile: {
          name: null,
          mood: "neutral",
          stress: 5,
          confidence: 5
        },

        events: [],
        history: [],
        waitingFor: null
      };
    }


    const user = db[fcmToken];



    // ================= SAVE USER MSG =================

    user.history.push({
      role: "user",
      content: message
    });

    if (user.history.length > 12) user.history.shift();



    // ================= MOOD =================

    const mood = detectMood(message);

    if (mood) user.profile.mood = mood;



    // ================= NAME =================

    const name = detectName(message);

    if (name) user.profile.name = name;



    // ================= WAITING =================

    if (user.waitingFor) {

      const parsed = await parseDate(message);

      const event = {
        title: user.waitingFor.title,
        description: user.waitingFor.description,
        timestamp: parsed.timestamp,
        notified: { five:false, after:false }
      };

      user.events.push(event);

      user.waitingFor = null;

      saveDB(db);

      return res.json({
        reply: `Saved 😤🔥 ${event.title} on ${formatTime(event.timestamp)} 💙`
      });
    }



    // ================= EVENT DETECT =================

    const aiEvent = await detectEventAI(message);

    if (aiEvent.hasEvent && !user.waitingFor) {

      const parsed = await parseDate(message);

      if (parsed.timestamp) {

        const event = {
          title: aiEvent.title,
          description: aiEvent.description,
          timestamp: parsed.timestamp,
          notified: { five:false, after:false }
        };

        user.events.push(event);

        saveDB(db);

        return res.json({
          reply: `Got you 😤🔥 ${event.title} on ${formatTime(event.timestamp)} 💙`
        });
      }

      user.waitingFor = aiEvent;

      saveDB(db);

      return res.json({
        reply: `When is "${aiEvent.title}"? ⏰💙`
      });
    }



    // ================= MAIN AI =================

    let reply = "Bro 😭 error";

    try {

      const chatAI = await groq.chat.completions.create({

        model: "llama-3.1-8b-instant",

        temperature: 0.9,

        max_tokens: 200,

        messages: [

          {
            role: "system",
            content: `
You are Harsimar's close friend.

Profile:
${JSON.stringify(user.profile)}

Be emotional.
Remember past chats.
Use emojis 😤💙🔥
`
          },

          ...user.history
        ]
      });

      reply = chatAI.choices[0].message.content;

    } catch {

      reply = "Bro 😭 brain lag 💙";
    }



    user.history.push({
      role: "assistant",
      content: reply
    });

    saveDB(db);

    res.json({ reply });


  } catch (err) {

    console.log("🔥 CHAT ERROR:", err);

    res.json({
      reply: "Bro 😭 server tired 💙"
    });
  }
});



// ================= REMINDER SYSTEM =================

// Every 30 sec
cron.schedule("*/30 * * * * *", async () => {

  try {

    const db = loadDB();
    const now = Date.now();

    console.log("⏰ Checking reminders:", new Date(now).toLocaleTimeString());

    for (const token in db) {

      for (const e of db[token].events) {

        if (!e.timestamp) continue;

        const diff = e.timestamp - now;


        if (!e.notified) {
          e.notified = { five:false, after:false };
        }


        // 🔔 5 MIN BEFORE (4–7 min window)
        if (
          diff <= 7 * 60 * 1000 &&
          diff >= 4 * 60 * 1000 &&
          !e.notified.five
        ) {

          console.log("🔔 5-min reminder:", e.title);

          await admin.messaging().send({
            token,
            notification: {
              title: "🔥 You Got This",
              body: `5 min left for ${e.title} 💙😤 Go smash it`
            }
          });

          e.notified.five = true;
        }


        // 💙 AFTER (3–15 min window)
        if (
          diff <= -3 * 60 * 1000 &&
          diff >= -15 * 60 * 1000 &&
          !e.notified.after
        ) {

          console.log("💙 After reminder:", e.title);

          await admin.messaging().send({
            token,
            notification: {
              title: "💙 Proud of You",
              body: `How was ${e.title}? 🤗 I’m here`
            }
          });

          e.notified.after = true;
        }

      }
    }

    saveDB(db);

  } catch (err) {

    console.log("❌ Reminder error:", err.message);
  }

});



// ================= START =================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("✅ Server running on", PORT);
});