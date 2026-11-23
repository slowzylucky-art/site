const express = require("express");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;
const LOOTLABS_URL = "https://lootdest.org/s?AMGV62R5";
const KEY_TTL_MS = 24 * 60 * 60 * 1000; // 24 saat

const activeKeys = new Map();

app.use(express.json());

function generateKey() {
  const part1 = crypto.randomBytes(2).toString("hex").toUpperCase();
  const part2 = crypto.randomBytes(2).toString("hex").toUpperCase();
  const part3 = crypto.randomBytes(2).toString("hex").toUpperCase();
  return `SPH-${part1}-${part2}-${part3}`;
}

function cleanExpiredKeys() {
  const now = Date.now();
  for (const [key, data] of activeKeys.entries()) {
    if (data.expiresAt <= now) {
      activeKeys.delete(key);
    }
  }
}

setInterval(cleanExpiredKeys, 10 * 60 * 1000);

// Health check
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok", service: "spectre-hub" });
});

// Get Key sayfası (İngilizce, Get Key en üstte)
app.get("/", (req, res) => {
  res.type("html").send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Spectre Hub - Get Key</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #09080f;
      color: #f4f2ff;
      font-family: Arial, sans-serif;
      padding: 20px;
    }
    .card {
      width: 100%;
      max-width: 420px;
      background: #131120;
      border: 1px solid #2a2444;
      border-radius: 16px;
      padding: 28px;
      text-align: center;
    }
    h1 { font-size: 24px; margin-bottom: 10px; }
    p { color: #b6afd4; font-size: 14px; line-height: 1.5; margin-bottom: 22px; }
    .btn {
      display: block;
      width: 100%;
      padding: 15px 20px;
      border-radius: 12px;
      background: #7c3aed;
      color: #ffffff;
      font-size: 16px;
      font-weight: 700;
      text-decoration: none;
    }
    .btn:hover { background: #6d28d9; }
    .hint { margin-top: 16px; font-size: 12px; color: #8b83ad; margin-bottom: 0; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Spectre Hub</h1>
    <p>Complete the checkpoint to claim your 24-hour key.</p>
    <a class="btn" href="${LOOTLABS_URL}">Get Key</a>
    <p class="hint">After finishing the task, you will be redirected to claim your key.</p>
  </div>
</body>
</html>`);
});

// Claim Key sayfası
app.get("/claim", (req, res) => {
  res.type("html").send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Spectre Hub - Claim Key</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #09080f;
      color: #f4f2ff;
      font-family: Arial, sans-serif;
      padding: 20px;
    }
    .card {
      width: 100%;
      max-width: 440px;
      background: #131120;
      border: 1px solid #2a2444;
      border-radius: 16px;
      padding: 28px;
      text-align: center;
    }
    h1 { font-size: 24px; margin-bottom: 10px; }
    p { color: #b6afd4; font-size: 14px; line-height: 1.5; margin-bottom: 20px; }
    button {
      width: 100%;
      padding: 14px 18px;
      border: 0;
      border-radius: 12px;
      background: #7c3aed;
      color: #ffffff;
      font-size: 15px;
      font-weight: 700;
      cursor: pointer;
    }
    button:hover { background: #6d28d9; }
    .key-box {
      display: none;
      margin-top: 20px;
      padding: 14px;
      border-radius: 12px;
      background: #1b1730;
      border: 1px solid #3c3363;
      font-family: monospace;
      font-size: 16px;
      color: #e9d5ff;
      word-break: break-all;
    }
    .copy-btn {
      display: none;
      margin-top: 10px;
      background: #25203d;
    }
    .status {
      margin-top: 12px;
      font-size: 13px;
      color: #a7f3d0;
      min-height: 18px;
    }
  </style>
</head>
<body>
  <div class="card">
    <h1>Claim Your Key</h1>
    <p>Generate and copy your 24-hour Spectre Hub key below.</p>
    <button id="claimBtn" type="button">Claim Key</button>
    <div id="keyBox" class="key-box"></div>
    <button id="copyBtn" class="copy-btn" type="button">Copy Key</button>
    <div id="status" class="status"></div>
  </div>

  <script>
    const claimBtn = document.getElementById("claimBtn");
    const keyBox = document.getElementById("keyBox");
    const copyBtn = document.getElementById("copyBtn");
    const statusEl = document.getElementById("status");
    let currentKey = "";

    claimBtn.addEventListener("click", async () => {
      claimBtn.disabled = true;
      statusEl.textContent = "Generating key...";
      try {
        const res = await fetch("/api/claim-key", { method: "POST" });
        const data = await res.json();
        if (!res.ok || !data.key) {
          throw new Error(data.error || "Failed to generate key");
        }
        currentKey = data.key;
        keyBox.textContent = currentKey;
        keyBox.style.display = "block";
        copyBtn.style.display = "block";
        statusEl.textContent = "Key ready (valid for 24 hours).";
      } catch (err) {
        statusEl.textContent = err.message;
      } finally {
        claimBtn.disabled = false;
      }
    });

    copyBtn.addEventListener("click", async () => {
      if (!currentKey) return;
      try {
        await navigator.clipboard.writeText(currentKey);
        statusEl.textContent = "Key copied to clipboard.";
      } catch {
        statusEl.textContent = "Select and copy the key manually.";
      }
    });
  </script>
</body>
</html>`);
});

// Key üretme API ucu
app.post("/api/claim-key", (req, res) => {
  cleanExpiredKeys();
  const key = generateKey();
  const expiresAt = Date.now() + KEY_TTL_MS;

  activeKeys.set(key, {
    createdAt: Date.now(),
    expiresAt
  });

  res.status(200).json({
    key,
    expiresAt
  });
});

// Script tarafı için Key doğrulama API ucu
app.get("/api/verify-key", (req, res) => {
  cleanExpiredKeys();
  const key = String(req.query.key || "").trim();
  const record = activeKeys.get(key);

  if (!record || record.expiresAt <= Date.now()) {
    activeKeys.delete(key);
    return res.status(401).json({ valid: false, error: "Invalid or expired key" });
  }

  return res.status(200).json({
    valid: true,
    expiresAt: record.expiresAt
  });
});

app.listen(PORT, () => {
  console.log(`Spectre Hub running on port ${PORT}`);
});
