// ================= TOKEN =================

function setFCMToken(token) {

  console.log("Saved Token:", token);

  localStorage.setItem("fcmToken", token);
}



// ================= SERVICE WORKER =================

if ("serviceWorker" in navigator) {

  navigator.serviceWorker.register("/sw.js")
    .then(() => console.log("SW Ready"))
    .catch(err => console.log(err));
}



// ================= PERMISSION =================

async function askPermission() {

  if ("Notification" in window) {

    const p = await Notification.requestPermission();

    console.log("Permission:", p);
  }
}

askPermission();



// ================= ANDROID BRIDGE =================

if (window.Android && window.Android.getFCMToken) {
  window.Android.getFCMToken();
}



// ================= UI =================

const chat = document.getElementById("chat");
const input = document.getElementById("msg");

function addMessage(text, type) {

  const div = document.createElement("div");

  div.className = type;

  div.innerText = text;

  chat.appendChild(div);

  chat.scrollTop = chat.scrollHeight;
}



// ================= WELCOME =================

addMessage("Yo Harsimar 😄💙 I'm here bro.", "bot");



// ================= SEND =================

async function send() {

  const text = input.value.trim();

  if (!text) return;

  addMessage("You: " + text, "user");

  input.value = "";

  const typing = document.createElement("div");

  typing.className = "bot";

  typing.innerText = "Typing...";

  chat.appendChild(typing);



  const token = localStorage.getItem("fcmToken");

  try {

    const res = await fetch("/chat", {

      method: "POST",

      headers: {
        "Content-Type": "application/json"
      },

      body: JSON.stringify({

        message: text,
        fcmToken: token

      })
    });


    const data = await res.json();

    chat.removeChild(typing);

    addMessage("MindCare: " + data.reply, "bot");

  }

  catch (err) {

    chat.removeChild(typing);

    addMessage("MindCare: Server down 😭", "bot");
  }
}



// ================= ENTER =================

input.addEventListener("keydown", e => {

  if (e.key === "Enter") send();

});
// ================= MANUAL PUSH API =================

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