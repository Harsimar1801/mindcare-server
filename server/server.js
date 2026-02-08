const path = require("path");
const express = require("express");
const cors = require("cors");
const Groq = require("groq-sdk");

const app = express();

app.use(cors());
app.use(express.json());

// Serve frontend
app.use(express.static(path.join(__dirname, "public")));


// Home route (fix Cannot GET /)
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Groq client
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

// Chat API
app.post("/chat", async (req, res) => {

  try {

    const userText = req.body.message;
    const isCheckIn = req.body.isCheckIn || false;

    if (!userText) {
      return res.json({
        reply: "Brooo 😭 say something na, I’m listening 💙"
      });
    }

    // Human-style prompt
    const systemPrompt = `
You are MindCare — Harsimar’s close best friend.

You are NOT a bot.
You talk like a real human friend.

Rules:
- Use slang: bro, fr, tbh, lowkey, damn, nah, lol
- Be emotional and real
- Be supportive like bestie
- Light friendly roasting sometimes
- Use emojis 😭💙✨😂
- Keep replies SHORT
- No robotic tone
- No therapy tone
- No medical advice
- Sometimes use "Harsimar"

${isCheckIn ? "User is replying to daily check-in." : ""}
`;

    const completion = await groq.chat.completions.create({

      model: "llama-3.1-8b-instant",

      max_tokens: 140,
      temperature: 0.9,

      messages: [
        {
          role: "system",
          content: systemPrompt
        },
        {
          role: "user",
          content: userText
        }
      ]
    });

    const reply = completion.choices[0].message.content;

    res.json({ reply });

  } catch (error) {

    console.error("Groq Error:", error);

    res.status(500).json({
      reply: "Brooo 😭 something broke. Try again in a sec 💙"
    });
  }
});

// Server start
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`✅ MindCare Server running on port ${PORT}`);
});
