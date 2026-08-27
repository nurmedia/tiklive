const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { WebcastPushConnection } = require("tiktok-live-connector");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

// Hazırda aktiv olan TikTok Live qoşulması
let tiktokConnection = null;
let currentUsername = null;

// ---- Hazır reaksiya şablonları (hədiyyə dəyərinə görə) ----
const REACTIONS = {
  low: [
    "{user} sənə görə çox sağ ol! 💖",
    "{user} bu {gift} çox şirin idi! 😍",
    "Aaa {user}, təşəkkürlər! ✨"
  ],
  mid: [
    "{user} vay bu nə səxavətdir! 🔥",
    "{user} səni çox sevirəm! 😘",
    "{user} bu hədiyyəyə görə öpüş göndərirəm! 💋"
  ],
  high: [
    "{user} SƏNSİZ OLMAZ!! 👑🔥",
    "{user} bu hədiyyə məni vurdu! Səni sevirəm! ❤️‍🔥",
    "{user} sən bu yayımın kralısan/kraliçasısan! 🏆"
  ]
};

function pickReaction(username, giftName, diamondCount) {
  let pool;
  if (diamondCount >= 500) pool = REACTIONS.high;
  else if (diamondCount >= 50) pool = REACTIONS.mid;
  else pool = REACTIONS.low;

  const template = pool[Math.floor(Math.random() * pool.length)];
  return template.replace("{user}", username).replace("{gift}", giftName);
}

// ---- Socket.io: control.html və index.html buradan idarə olunur ----
io.on("connection", (socket) => {
  console.log("Yeni panel qoşuldu:", socket.id);

  // control.html "start" düyməsini basanda buraya sorğu gəlir
  socket.on("start-live", async (username) => {
    try {
      // Əvvəlki qoşulma varsa bağla
      if (tiktokConnection) {
        try { await tiktokConnection.disconnect(); } catch (e) {}
      }

      currentUsername = username.replace("@", "").trim();
      tiktokConnection = new WebcastPushConnection(currentUsername);

      await tiktokConnection.connect();
      console.log(`Qoşuldu: @${currentUsername}`);
      socket.emit("status", { ok: true, message: `@${currentUsername} canlı yayımına qoşulundu` });
      io.emit("live-status", { connected: true, username: currentUsername });

      // Hədiyyə hadisəsi
      tiktokConnection.on("gift", (data) => {
        // repeatEnd=true olanda seriya bitib, son sayı göstər
        if (data.giftType === 1 && !data.repeatEnd) return; // seriyalı hədiyyələrdə sonu gözlə

        const payload = {
          uniqueId: data.uniqueId,
          nickname: data.nickname || data.uniqueId,
          profilePictureUrl: data.profilePictureUrl,
          giftName: data.giftName,
          giftId: data.giftId,
          repeatCount: data.repeatCount || 1,
          diamondCount: (data.diamondCount || 0) * (data.repeatCount || 1),
          reaction: pickReaction(data.nickname || data.uniqueId, data.giftName, (data.diamondCount || 0) * (data.repeatCount || 1))
        };

        io.emit("gift-event", payload);
      });

      // İstəyə görə: yeni izləyici / like / follow da göstərmək olar
      tiktokConnection.on("member", (data) => {
        io.emit("viewer-join", { nickname: data.nickname || data.uniqueId });
      });

      tiktokConnection.on("disconnected", () => {
        io.emit("live-status", { connected: false, username: currentUsername });
      });

    } catch (err) {
      console.error("Qoşulma xətası:", err.message);
      socket.emit("status", { ok: false, message: "Xəta: " + err.message });
    }
  });

  socket.on("stop-live", async () => {
    if (tiktokConnection) {
      try { await tiktokConnection.disconnect(); } catch (e) {}
      tiktokConnection = null;
    }
    io.emit("live-status", { connected: false, username: currentUsername });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server işə düşdü: http://localhost:${PORT}`);
  console.log(`Overlay (OBS üçün): http://localhost:${PORT}/index.html`);
  console.log(`İdarə paneli: http://localhost:${PORT}/control.html`);
});
