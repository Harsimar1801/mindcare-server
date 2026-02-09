// ================= IMPORTS =================

const path = require("path");
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const fs = require("fs");
const cron = require("node-cron");
const Groq = require("groq-sdk");
const admin = require("firebase-admin");
const session = require("express-session");
const { google } = require("googleapis");


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

app.use(session({
  secret: process.env.SESSION_SECRET || "mindcare_secret",
  resave: false,
  saveUninitialized: false
}));

app.use(express.static(path.join(__dirname, "public")));


// ================= GROQ =================

if (!process.env.GROQ_API_KEY) {
  console.error("❌ GROQ_API_KEY missing");
  process.exit(1);
}

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});


// ================= GOOGLE AUTH =================

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

const calendar = google.calendar({
  version: "v3",
  auth: oauth2Client
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

  const match = text.toLowerCase()
    .match(/(\d+)\s*(min|mins|minute|minutes)/);

  if (!match) return null;

  return Date.now() + parseInt(match[1]) * 60000;
}


// ================= GOOGLE LOGIN =================

// Step 9
app.get("/auth/google", (req, res) => {

  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: ["https://www.googleapis.com/auth/calendar"]
  });

  res.redirect(url);
});


// Step 10
app.get("/auth/google/callback", async (req, res) => {

  try {

    const code = req.query.code;

    const { tokens } = await oauth2Client.getToken(code);

    oauth2Client.setCredentials(tokens);

    req.session.googleTokens = tokens;

    res.redirect("/chat.html");

  } catch (err) {

    console.log("Google Auth Error:", err);
    res.send("Google Login Failed");
  }
});


// ================= ADD TO GOOGLE CALENDAR =================

async function addToGoogleCalendar(session, title, time) {

  if (!session.googleTokens) return false;

  oauth2Client.setCredentials(session.googleTokens);

  const event = {

    summary: title,

    start: {
      dateTime: new Date(time).toISOString(),
      timeZone: "Asia/Kolkata"
    },

    end: {
      dateTime: new Date(time + 60 * 60 * 1000).toISOString(),
      timeZone: "Asia/Kolkata"
    }
  };

  await calendar.events.insert({
    calendarId: "primary",
    resource: event
  });

  return true;
}


// ================= CHAT =================

app.post("/chat", async (req, res) => {

  try {

    const { message, fcmToken } = req.body;

    if (!message || !fcmToken) {
      return res.json({ reply: "Bhai kuch likh toh sahi 💙" });
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


    // Save user msg
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

      const title = "Exam";

      user.events.push({
        title,
        time,
        notified: { before: false, after: false }
      });

      // Add to Google Calendar
      await addToGoogleCalendar(req.session, title, time);

      const reply = `All the best 😤💙 Exam at ${formatTime(time)} (Saved in Calendar)`;

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
      temperature: 0.6,

      messages: [

        {
          role: "system",
          content: `
You are MindCare.
Be caring, mature, natural.
Use light Hinglish.
No cringe.
Short replies.
Ask max 1 question.
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

    res.json({ reply: "Bhai thoda issue aa gaya 😭" });
  }
});



// ================= REMINDER =================

cron.schedule("*/30 * * * * *", async () => {

  try {

    const db = loadDB();
    const now = Date.now();


    for (const token in db) {

      const user = db[token];

      if (!user.events) continue;


      for (const e of user.events) {

        const diff = e.time - now;


        // Before
        if (diff <= 5 * 60000 && diff > 2 * 60000 && !e.notified.before) {

          const msg = "5 min left 😤💙 All the best!";

          user.history.push({
            role: "assistant",
            content: msg
          });

          await admin.messaging().send({

            token,

            notification: {
              title: "🔥 You Got This",
              body: msg
            },

            data: { message: msg }
          });

          e.notified.before = true;
        }


        // After
        if (diff <= -2 * 60000 && !e.notified.after) {

          const msg = "Kaisa gaya exam? 🤗 Bata na";

          user.history.push({
            role: "assistant",
            content: msg
          });

          await admin.messaging().send({

            token,

            notification: {
              title: "💙 Proud of You",
              body: msg
            },

            data: { message: msg }
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