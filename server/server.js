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

  if (text.includes("sad") || text.includes("depressed") || text.includes("cry"))
    return "low";

  if (text.includes("scared") || text.includes("stress") || text.includes("anxious"))
    return "anxious";

  if (text.includes("happy") || text.includes("good") || text.includes("great"))
    return "high";

  if (text.includes("tired") || text.includes("burnout"))
    return "tired";

  return null;
}


// Name detector
function detectName(text) {

  const match = text.match(/my name is (\w+)/i);

  if (match) return match[1];

  return null;
}


// ================= DATE PARSER =================

// ================= AI EVENT DETECTOR =================

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
Detect if user mentions ANY future event.

Return ONLY JSON:

{
  "hasEvent": true/false,
  "title": "event name or null",
  "description": "short desc or null"
}

No explanation.
`
        },
        {
          role: "user",
          content: text
        }
      ]
    });

    const raw = res.choices[0].message.content;

    return JSON.parse(raw);

  } catch (err) {

    console.log("⚠️ Event AI failed:", err.message);

    // FAIL SAFE
    return {
      hasEvent: false,
      title: null,
      description: null
    };
  }
}

// ================= CHAT =================

app.post("/chat", async (req, res) => {

  const { message, fcmToken } = req.body;

  if (!message || !fcmToken) {
    return res.json({ reply: "Bro 😭 say something na 💙" });
  }


  let db = loadDB();


  // Create user if new
  if (!db[fcmToken]) {

    db[fcmToken] = {

      profile: {
        name: null,
        mood: "neutral",
        stress: 5,
        confidence: 5,
        goals: []
      },

      events: [],

      history: [],

      waitingFor: null
    };
  }


  const user = db[fcmToken];



  // ================= SAVE USER MESSAGE =================
// ================= AI EVENT DETECT =================

// ================= AI EVENT DETECT =================

const aiEvent = await detectEventAI(message);

if (aiEvent.hasEvent && !user.waitingFor) {

  user.waitingFor = {
    title: aiEvent.title,
    description: aiEvent.description
  };

  saveDB(db);

  return res.json({
    reply: `Ohhh 😭💙 when is "${aiEvent.title}"? Date + time bro 🔥`
  });
}
  user.history.push({
    role: "user",
    content: message
  });

  if (user.history.length > 12) user.history.shift();



  // ================= UPDATE MOOD =================

  const mood = detectMood(message);

  if (mood) {

    user.profile.mood = mood;

    if (mood === "low" || mood === "anxious") {
      user.profile.stress += 1;
      user.profile.confidence -= 1;
    }

    if (mood === "high") {
      user.profile.confidence += 1;
    }

    // Clamp values
    user.profile.stress = Math.min(10, Math.max(1, user.profile.stress));
    user.profile.confidence = Math.min(10, Math.max(1, user.profile.confidence));
  }



  // ================= UPDATE NAME =================

  const name = detectName(message);

  if (name) {
    user.profile.name = name;
  }



  // ================= WAITING FOR DATE =================

  // ================= IF WAITING FOR DATE =================

if (user.waitingFor) {

  const parsed = await parseDate(message);

  const event = {
    title: user.waitingFor.title,
    description: user.waitingFor.description,
    date: parsed.date,
    time: parsed.time
  };

  user.events.push(event);

  user.waitingFor = null;

  saveDB(db);

  return res.json({
    reply: `Saved 😤🔥 I’ll remind you before "${event.title}" 💙`
  });
}



  // ================= DETECT NEW EVENT =================





  // ================= MAIN AI =================

  const chatAI = await groq.chat.completions.create({

    model: "llama-3.1-8b-instant",

    temperature: 0.9,

    max_tokens: 200,

    messages: [

      {
        role: "system",
        content: `
You are MindCare, Harsimar's real best friend.

User profile:
Name: ${user.profile.name}
Mood: ${user.profile.mood}
Stress: ${user.profile.stress}/10
Confidence: ${user.profile.confidence}/10
Goals: ${user.profile.goals.join(", ")}

Rules:
- Talk like a human friend
- Be emotionally aware
- Reference past struggles
- Encourage growth
- Use emojis 😤💙🔥
- Never sound robotic
`
      },

      ...user.history
    ]
  });


  const reply = chatAI.choices[0].message.content;



  // ================= SAVE BOT MESSAGE =================

  user.history.push({
    role: "assistant",
    content: reply
  });

  saveDB(db);


  res.json({ reply });
});



// ================= MANUAL PUSH =================

app.post("/push-now", async (req, res) => {

  const { token, title, body } = req.body;

  if (!token) {
    return res.status(400).json({ error: "Token missing" });
  }

  try {

    await admin.messaging().send({

      token,

      notification: {
        title: title || "🧠 MindCare",
        body: body || "Hey bro 💙"
      }
    });

    res.json({
      success: true,
      msg: "Notification sent 😤🔥"
    });

  } catch (err) {

    console.log("Push Error:", err);

    res.status(500).json({
      error: "Push failed 😭"
    });
  }
});



// ================= DAILY REMINDER =================

// ================= SMART REMINDERS =================

cron.schedule("* * * * *", async () => {

  const db = loadDB();
  const now = new Date();

  console.log("⏰ Checking reminders", now.toLocaleString());

  for (const token in db) {

    for (const e of db[token].events) {

      if (!e.date || !e.time) continue;

      const eventTime = new Date(`${e.date}T${e.time}`);
      const diff = eventTime - now; // ms

      // Initialize flags
      if (!e.notified) {
        e.notified = {
          oneHour: false,
          fiveMin: false,
          after: false
        };
      }

      // 🔔 1 HOUR BEFORE
      if (
        diff <= 60 * 60 * 1000 &&
        diff > 59 * 60 * 1000 &&
        !e.notified.oneHour
      ) {

        await admin.messaging().send({
          token,
          notification: {
            title: "⏰ Get Ready Bro",
            body: `1 hour left for your ${e.type} 💪 Revise & relax 😤`
          }
        });

        e.notified.oneHour = true;
      }

      // ⚡ 5 MIN BEFORE
      if (
        diff <= 5 * 60 * 1000 &&
        diff > 4 * 60 * 1000 &&
        !e.notified.fiveMin
      ) {

        await admin.messaging().send({
          token,
          notification: {
            title: "🔥 You Got This",
            body: `5 min left 😤 Deep breath, go kill it 💙`
          }
        });

        e.notified.fiveMin = true;
      }

      // 💙 AFTER EXAM
      if (
        diff < -5 * 60 * 1000 &&
        !e.notified.after
      ) {

        await admin.messaging().send({
          token,
          notification: {
            title: "💙 Proud of You",
            body: `How was your ${e.type}? I'm here 🤗`
          }
        });

        e.notified.after = true;
      }

    }
  }

  saveDB(db);
});


// ================= START =================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("✅ Server running on", PORT);
});