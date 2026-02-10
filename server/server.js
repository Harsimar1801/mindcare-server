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
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    day: "numeric",
    month: "short"
  });
}


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



// ================= RANDOM GREETING MSG =================

const randomCheckMsgs = [

  // Hi / Hello
  "Heyy 👋",
  "Hiii 😄",
  "Hello 😊",
  "Oye 👀",
  "Yo bro 😎",

  // Check-in
  "Kaisa chal raha hai? 💙",
  "Sab theek hai na?",
  "Just checking in 🤍",
  "Missed you thoda sa 😅",

  // Morning / Night
  "Good morning ☀️ Have a great day!",
  "Morninggg 😄 Ready for today?",
  "Good night 🌙 Sweet dreams",
  "So jao ab 😴 Kal milte hain",

  // Friendly
  "Bhai 🤍 Sab okay?",
  "Yaad aayi tumhari 💙",
  "Free ho kya thoda?",
  "Batao kya scene hai 👀"
];



// ================= CHAT =================

app.post("/chat", async (req, res) => {

  try {

    const { message, fcmToken, language } = req.body;

    if (!message || !fcmToken) {
      return res.json({ reply: "Bhai kuch likh toh sahi 💙" });
    }

    let db = loadDB();


    if (!db[fcmToken]) {

      db[fcmToken] = {
        profile: {
          mood: null,
          language: language || "hinglish"
        },
        history: [],
        events: []
      };
    }


    const user = db[fcmToken];


    if (language) {
      user.profile.language = language;
    }


    // Save user msg
    user.history.push({
      role: "user",
      content: message
    });

    if (user.history.length > 30) user.history.shift();


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
        content: reply
      });

      saveDB(db);

      return res.json({ reply });
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
Be caring.
Short replies.
No cringe.

Language: ${user.profile.language}
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


    res.json({ reply });

  }

  catch (err) {

    console.log("🔥 SERVER ERROR:", err);

    res.json({ reply: "Server issue 😭" });
  }
});



// ================= HISTORY =================

app.get("/history/:token", (req, res) => {

  try {

    const token = req.params.token;

    if (!token) return res.json([]);

    const db = loadDB();

    if (!db[token]) return res.json([]);

    res.json(db[token].history || []);

  } catch {

    res.json([]);
  }
});



// ================= REMINDER + RANDOM SYSTEM =================

cron.schedule("*/20 * * * * *", async () => {

  try {

    const db = loadDB();
    const now = Date.now();


    for (const token in db) {

      const user = db[token];

      if (!user.events) continue;


      // ================= EXAM REMINDER =================

      for (const e of user.events) {

        const diff = e.time - now;


        // BEFORE
        if (
          diff <= 6 * 60000 &&
          diff >= 2 * 60000 &&
          !e.notified.before
        ) {

          const msg = "⏰ Exam coming soon! All the best 😤💙";

          user.history.push({
            role: "assistant",
            content: msg
          });


          await admin.messaging().send({

            token,

            notification: {
              title: "🔥 Exam Reminder",
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

          const msg = "🤗 Kaisa gaya exam? Bata na";

          user.history.push({
            role: "assistant",
            content: msg
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


      // ================= RANDOM GREETING =================

      if (Math.random() < 0.015) { // ~1.5% chance

        const msg = randomFrom(randomCheckMsgs);

        user.history.push({
          role: "assistant",
          content: msg
        });


        await admin.messaging().send({

          token,

          notification: {
            title: "MindCare 💙",
            body: msg
          }
        });
      }

    }

    saveDB(db);

  } catch (err) {

    console.log("CRON ERROR:", err);
  }
});



// ================= START =================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("✅ Server running on", PORT);
});