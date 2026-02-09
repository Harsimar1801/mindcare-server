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

// Mood detector
function detectMood(text) {

  text = text.toLowerCase();

  if (text.includes("sad") || text.includes("cry")) return "low";
  if (text.includes("scared") || text.includes("stress")) return "anxious";
  if (text.includes("happy") || text.includes("great")) return "high";
  if (text.includes("tired") || text.includes("burnout")) return "tired";

  return null;
}


// Name detector
function detectName(text) {

  const match = text.match(/my name is (\w+)/i);

  if (match) return match[1];

  return null;
}


// ================= DATE PARSER =================

async function parseDate(text) {

  try {

    const res = await groq.chat.completions.create({

      model: "llama-3.1-8b-instant",

      temperature: 0,

      max_tokens: 120,

      messages: [
        {
          role: "system",
          content: `
Convert into JSON ONLY:

{
 "date":"YYYY-MM-DD",
 "time":"HH:MM" or null
}

Understand: tomorrow, in 5 min, next week, today evening.

Only JSON.
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
      date: null,
      time: null
    };
  }
}


// ================= EVENT DETECTOR =================

async function detectEventAI(text) {

  try {

    const res = await groq.chat.completions.create({

      model: "llama-3.1-8b-instant",

      temperature: 0,

      max_tokens: 100,

      messages: [
        {
          role: "system",
          content: `
Detect if user mentions ANY upcoming activity.

Return JSON ONLY:

{
 "hasEvent": true/false,
 "title": "short name or null",
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



// ================= CHAT =================

app.post("/chat", async (req, res) => {

  try {

    const { message, fcmToken } = req.body;

    if (!message || !fcmToken) {
      return res.json({ reply: "Bro 😭 say something na 💙" });
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

      if (!parsed.date) {

        return res.json({
          reply: "Bro 😅 date samajh nahi aayi, thoda clearly bol na 💙"
        });
      }

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
        reply: `Saved 😤🔥 "${event.title}" on ${event.date} 💙`
      });
    }



    // ================= EVENT DETECT =================

 // ================= EVENT DETECT =================

const aiEvent = await detectEventAI(message);

if (aiEvent.hasEvent && !user.waitingFor) {

  // Try parsing date from SAME message
  const parsed = await parseDate(message);

  // If AI understood time → save directly
  if (parsed.date) {

    const event = {
      title: aiEvent.title,
      description: aiEvent.description,
      date: parsed.date,
      time: parsed.time,
      notified: {}
    };

    user.events.push(event);

    saveDB(db);

    return res.json({
      reply: `Got you 😤🔥 "${event.title}" in ${parsed.time || "some time"} 💙 Stay strong`
    });
  }

  // Else ask user
  user.waitingFor = {
    title: aiEvent.title,
    description: aiEvent.description
  };

  saveDB(db);

  return res.json({
    reply: `Ohhh 😭💙 when is "${aiEvent.title}"? Date + time bro 🔥`
  });
}



    // ================= MAIN AI =================

    let reply = "Bro 😭 something broke";

    try {

      const chatAI = await groq.chat.completions.create({

        model: "llama-3.1-8b-instant",

        temperature: 0.9,

        max_tokens: 200,

        messages: [

          {
            role: "system",
            content: `
You are MindCare, Harsimar's real best friend.

Profile:
${JSON.stringify(user.profile)}

Rules:
- Be consistent
- Remember past chats
- Be emotional
- Use emojis 😤💙🔥
- No robotic tone
`
          },

          ...user.history
        ]
      });

      reply = chatAI.choices[0].message.content;

    } catch {

      reply = "Bro 😭 brain lag. Try again 💙";
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
      reply: "Bro 😭 server thak gaya. Try again 💙"
    });
  }
});



// ================= MANUAL PUSH =================

app.post("/push-now", async (req, res) => {

  try {

    const { token, title, body } = req.body;

    if (!token) return res.status(400).json({ error: "Token missing" });

    await admin.messaging().send({

      token,

      notification: {
        title: title || "🧠 MindCare",
        body: body || "Hey bro 💙"
      }
    });

    res.json({ success: true });

  } catch (err) {

    console.log("Push error:", err);

    res.status(500).json({ error: "Push failed 😭" });
  }
});



// ================= SMART REMINDERS =================

cron.schedule("* * * * *", async () => {

  try {

    const db = loadDB();
    const now = new Date();

    for (const token in db) {

      for (const e of db[token].events) {

        if (!e.date || !e.time) continue;

        const eventTime = new Date(`${e.date}T${e.time}`);
        const diff = eventTime - now;


        if (!e.notified) {
          e.notified = {
            hour: false,
            five: false,
            after: false
          };
        }


        // 1 hour before
        if (diff <= 3600000 && diff > 3540000 && !e.notified.hour) {

          await admin.messaging().send({
            token,
            notification: {
              title: "⏰ Get Ready",
              body: `1 hour left for ${e.title} 😤💙`
            }
          });

          e.notified.hour = true;
        }


        // 5 min before
        if (diff <= 300000 && diff > 240000 && !e.notified.five) {

          await admin.messaging().send({
            token,
            notification: {
              title: "🔥 You Got This",
              body: `5 min left 😤💙 Go kill it`
            }
          });

          e.notified.five = true;
        }


        // After
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