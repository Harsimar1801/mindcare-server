const admin = require("firebase-admin");

// Load Firebase key
const serviceAccount = require("./firebase-key.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const token = "c8DfoR59TNy14v3iPFBEcm:APA91bESM9ywGgTblv-6o0Qj5FD38WEwhFwXJ8mw0wFLpazXK_hyYVa28ecPbjWv5tk1s0jJelOi7qzaYdDFB4B9AkYm9eUACrPfgoqz27caK66mMW3ZGyY";

const message = {
  notification: {
    title: "🧠 MindCare Check-in",
    body: "Bro how you feeling today? 💙"
  },
  token: token,
};

admin.messaging().send(message)
  .then((res) => {
    console.log("✅ Sent:", res);
    process.exit();
  })
  .catch((err) => {
    console.error("❌ Error:", err);
    process.exit();
  });