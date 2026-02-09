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

// Event detector
function detectEvent(text) {

  const words = ["exam", "test", "quiz", "interview", "presentation"];

  return words.find(w => text.toLowerCase().includes(w));
}


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

async function parseDate(text) {

  try {

    const res = await groq.chat.completions.create({

      model: "llama-3.1-8b-instant",

      temperature: 0,

      messages: [
        {
          role: "system",
          content: `
Return ONLY JSON:

{
 "date":"YYYY-MM-DD",
 "time":"HH:MM" or null
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

    return JSON.parse(res.choices[0].message.content);

  } catch {

    return {
      date: new Date().toISOString().slice(0,10),
      time: null
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

  if (user.waitingFor) {

    const parsed = await parseDate(message);

    const event = {
      type: user.waitingFor,
      date: parsed.date,
      time: parsed.time
    };

    user.events.push(event);

    if (!user.profile.goals.includes(event.type)) {
      user.profile.goals.push(event.type);
    }

    user.waitingFor = null;

    saveDB(db);

    return res.json({
      reply: `Saved 😤🔥 Your ${event.type} is on ${event.date} 💙`
    });
  }



  // ================= DETECT NEW EVENT =================

  const detected = detectEvent(message);

  if (detected) {

    const exists = user.events.find(e => e.type === detected);

    if (!exists) {

      user.waitingFor = detected;

      saveDB(db);

      return res.json({
        reply: `Oh damn 😭 when is your ${detected}? Date + time bro 💙`
      });
    }
  }



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

cron.schedule("0 9 * * *", async () => {

  const db = loadDB();

  const today = new Date().toISOString().slice(0,10);

  console.log("⏰ Checking reminders", today);


  for (const token in db) {

    for (const e of db[token].events) {

      if (e.date === today) {

        await admin.messaging().send({

          token,

          notification: {
            title: "🧠 MindCare",
            body: `How was your ${e.type}? 😤💙`
          }
        });
      }
    }
  }
});



// ================= START =================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("✅ Server running on", PORT);
});