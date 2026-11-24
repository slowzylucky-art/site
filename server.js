const express = require("express");
const crypto = require("crypto");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// Linkvertise Dashboard > Anti-Bypass sekmesindeki 64 karakterlik token
const LINKVERTISE_TOKEN = process.env.LINKVERTISE_TOKEN || "BURAYA_ANTI_BYPASS_TOKEN_YAZ";
const KEY_DURATION_MS = 24 * 60 * 60 * 1000; // 24 saat geçerli

// Aktif key'leri hafızada tutar (key -> { expiresAt })
const activeKeys = new Map();

function generateKey() {
  const part = () => crypto.randomBytes(2).toString("hex").toUpperCase();
  return `SPECTRE-${part()}-${part()}-${part()}`;
}

app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Linkvertise görevinden sonra yönlendirilen /claim rotası
app.get("/claim", async (req, res) => {
  const { hash } = req.query;

  // Hash yoksa doğrudan bypass olarak işaretle
  if (!hash || typeof hash !== "string" || hash.length < 16) {
    return res.redirect("/?error=bypass");
  }

  try {
    const verifyUrl = `https://publisher.linkvertise.com/api/v1/anti_bypassing?token=${encodeURIComponent(
      LINKVERTISE_TOKEN
    )}&hash=${encodeURIComponent(hash)}`;

    const response = await fetch(verifyUrl, { method: "POST" });
    const result = (await response.text()).trim();

    if (result !== "TRUE") {
      return res.redirect("/?error=bypass");
    }

    // Doğrulama başarılı: tek kullanımlık yeni key üret
    const newKey = generateKey();
    activeKeys.set(newKey, { expiresAt: Date.now() + KEY_DURATION_MS });

    return res.redirect(`/?key=${encodeURIComponent(newKey)}`);
  } catch (err) {
    console.error("Linkvertise doğrulama hatası:", err);
    return res.redirect("/?error=bypass");
  }
});

// Roblox scriptinin key doğrulaması için endpoint
app.get("/api/verify", (req, res) => {
  const { key } = req.query;
  if (!key || !activeKeys.has(key)) {
    return res.json({ valid: false, message: "Geçersiz key." });
  }

  const record = activeKeys.get(key);
  if (Date.now() > record.expiresAt) {
    activeKeys.delete(key);
    return res.json({ valid: false, message: "Key süresi dolmuş." });
  }

  return res.json({ valid: true, expiresAt: record.expiresAt });
});

app.listen(PORT, () => {
  console.log(`Spectre Hub Key System aktif: Port ${PORT}`);
});
