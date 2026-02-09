// ================= IST TIME =================

function getISTDate() {
  return new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" })
  );
}

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

// Mood
function detectMood(text) {

  text = text.toLowerCase();

  if (text.includes("sad") || text.includes("cry")) return "low";
  if (text.includes("stress") || text.includes("anxious")) return "anxious";
  if (text.includes("happy") || text.includes("great")) return "high";
  if (text.includes("tired")) return "tired";

  return null;
}


// Name
function detectName(text) {

  const match = text.match(/my name is (\w+)/i);

  if (match) return match[1];

  return null;
}


// ================= EVENT DETECTOR =================

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
  "title": "event name or null",
  "description": "short desc or null"
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

    return {
      hasEvent: false,
      title: null,
      description: null
    };
  }
}


// ================= DATE PARSER =================

async function parseDate(text) {

  try {

    const now = getISTDate();

    const res = await groq.chat.completions.create({

      model: "llama-3.1-8b-instant",

      temperature: 0,

      messages: [
        {
          role: "system",
          content: `
Current IST time: ${now.toISOString()}

Return ONLY JSON:

{
 "date":"YYYY-MM-DD",
 "time":"HH:MM"
}

Calculate real time.

Examples:
"in 5 min" → calculate
"tomorrow 9am" → calculate

No explanation.
`
        },
        {
          role: "user",
          content: text
        }
      ]
    });

    const parsed = JSON.parse(res.choices[0].message.content);

    if (!parsed.time || parsed.time.includes("H")) {
      throw new Error("Invalid time");
    }

    return parsed;

  } catch {

    // Fallback: +10 min IST
    const d = getISTDate();
    d.setMinutes(d.getMinutes() + 10);

    return {
      date: d.toISOString().slice(0,10),
      time: d.toTimeString().slice(0,5)
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

    if (mood) {

      user.profile.mood = mood;

      if (mood === "low" || mood === "anxious") {
        user.profile.stress++;
        user.profile.confidence--;
      }

      if (mood === "high") {
        user.profile.confidence++;
      }

      user.profile.stress = Math.min(10, Math.max(1, user.profile.stress));
      user.profile.confidence = Math.min(10, Math.max(1, user.profile.confidence));
    }



    // ================= NAME =================

    const name = detectName(message);

    if (name) user.profile.name = name;



    // ================= WAITING FOR DATE =================

    if (user.waitingFor) {

      const parsed = await parseDate(message);

      const event = {
        title: user.waitingFor.title,
        description: user.waitingFor.description,
        date: parsed.date,
        time: parsed.time,
        notified: {}
      };

      user.events.push(event);

      user.waitingFor = null;

      saveDB(db);

      return res.json({
        reply: `Saved 😤🔥 ${event.title} at ${event.time} 💙`
      });
    }



    // ================= EVENT DETECT =================

    const aiEvent = await detectEventAI(message);

    if (aiEvent.hasEvent && !user.waitingFor) {

      const parsed = await parseDate(message);

      if (parsed.date) {

        user.events.push({
          title: aiEvent.title,
          description: aiEvent.description,
          date: parsed.date,
          time: parsed.time,
          notified: {}
        });

        saveDB(db);

        return res.json({
          reply: `Got you 😤🔥 ${aiEvent.title} at ${parsed.time} 💙`
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
You are MindCare, Harsimar's close best friend.

Profile:
${JSON.stringify(user.profile)}

Rules:
- Remember past chats
- Be emotional
- Be supportive
- Use emojis 😤💙🔥
`
          },

          ...user.history
        ]
      });

      reply = chatAI.choices[0].message.content;

    } catch {

      reply = "Bro 😭 brain lag 💙";
    }



    // ================= SAVE BOT =================

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



// ================= SMART REMINDERS =================

cron.schedule("* * * * *", async () => {

  try {

    const db = loadDB();
    const now = getISTDate();

    for (const token in db) {

      for (const e of db[token].events) {

        if (!e.date || !e.time) continue;

        // Force IST
        const eventTime = new Date(`${e.date}T${e.time}:00+05:30`);

        const diff = eventTime - now;


        if (!e.notified) {
          e.notified = { five:false, after:false };
        }


        // 🔥 5 MIN BEFORE
        if (diff <= 300000 && diff > 240000 && !e.notified.five) {

          await admin.messaging().send({
            token,
            notification: {
              title: "🔥 You Got This",
              body: `5 min left for ${e.title} 💙😤`
            }
          });

          e.notified.five = true;
        }


        // 💙 AFTER
        if (diff < -300000 && !e.notified.after) {

          await admin.messaging().send({
            token,
            notification: {
              title: "💙 Proud of You",
              body: `How was ${e.title}? 🤗`
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