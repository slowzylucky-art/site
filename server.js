const express = require("express");
const crypto = require("crypto");

const app = express();
app.set("trust proxy", 1);

const PORT = process.env.PORT || 3000;
const LOOTLABS_URL = "https://lootdest.org/s?AMGV62R5";
const KEY_TTL_MS = 24 * 60 * 60 * 1000; // 24 saat
const MIN_CHECKPOINT_MS = 5000; // Görev için minimum geçiş süresi (5 sn)
const SECRET = process.env.SESSION_SECRET || "spectre-hub-obsidian-key-2026";

const activeKeys = new Map();

app.use(express.json());

function generateKey() {
  const p1 = crypto.randomBytes(2).toString("hex").toUpperCase();
  const p2 = crypto.randomBytes(2).toString("hex").toUpperCase();
  const p3 = crypto.randomBytes(2).toString("hex").toUpperCase();
  return `SPH-${p1}-${p2}-${p3}`;
}

function signValue(value) {
  const sig = crypto.createHmac("sha256", SECRET).update(value).digest("hex").slice(0, 24);
  return `${value}.${sig}`;
}

function verifySignedValue(signed) {
  if (!signed || typeof signed !== "string" || !signed.includes(".")) return null;
  const idx = signed.lastIndexOf(".");
  const value = signed.slice(0, idx);
  const expected = signValue(value);
  if (signed.length !== expected.length) return null;
  return crypto.timingSafeEqual(Buffer.from(signed), Buffer.from(expected)) ? value : null;
}

function parseCookies(req) {
  const header = req.headers.cookie || "";
  const out = {};
  header.split(";").forEach((part) => {
    const [k, ...v] = part.trim().split("=");
    if (k) out[k] = decodeURIComponent(v.join("="));
  });
  return out;
}

function hasValidCheckpoint(req) {
  const cookies = parseCookies(req);
  const raw = verifySignedValue(cookies.sp_gate);
  if (!raw) return false;
  const startedAt = Number(raw);
  if (!Number.isFinite(startedAt)) return false;
  const elapsed = Date.now() - startedAt;
  return elapsed >= MIN_CHECKPOINT_MS && elapsed <= 60 * 60 * 1000;
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

const SHARED_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500;700&display=swap');

  :root {
    --bg: #050608;
    --card: #0c0f14;
    --surface: #131822;
    --border: rgba(255, 255, 255, 0.08);
    --border-accent: rgba(56, 189, 248, 0.35);
    --text: #f8fafc;
    --muted: #8b95a5;
    --cyan: #38bdf8;
    --cyan-hover: #0ea5e9;
    --cyan-glow: rgba(56, 189, 248, 0.16);
    --green: #10b981;
    --red: #ef4444;
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: var(--bg);
    background-image:
      radial-gradient(circle at 50% 0%, rgba(56, 189, 248, 0.12), transparent 55%),
      linear-gradient(rgba(255, 255, 255, 0.02) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255, 255, 255, 0.02) 1px, transparent 1px);
    background-size: 100% 100%, 32px 32px, 32px 32px;
    color: var(--text);
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    padding: 20px;
  }

  .shell {
    width: 100%;
    max-width: 430px;
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 20px;
    padding: 26px;
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.65), 0 0 0 1px rgba(255, 255, 255, 0.02) inset;
  }

  .topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-bottom: 20px;
    margin-bottom: 22px;
    border-bottom: 1px solid var(--border);
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
    font-weight: 700;
    font-size: 15px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .brand-icon {
    width: 30px;
    height: 30px;
    border-radius: 8px;
    background: linear-gradient(135deg, rgba(56, 189, 248, 0.2), rgba(14, 165, 233, 0.05));
    border: 1px solid var(--border-accent);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--cyan);
  }

  .badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    font-weight: 500;
    color: var(--green);
    background: rgba(16, 185, 129, 0.1);
    border: 1px solid rgba(16, 185, 129, 0.25);
    padding: 4px 10px;
    border-radius: 999px;
  }

  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--green);
    box-shadow: 0 0 8px var(--green);
  }

  .steps {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin-bottom: 22px;
  }

  .step {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 10px 12px;
    font-size: 12px;
    color: var(--muted);
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .step.active {
    border-color: var(--border-accent);
    color: var(--text);
    background: rgba(56, 189, 248, 0.06);
  }

  .step.done {
    border-color: rgba(16, 185, 129, 0.3);
    color: var(--green);
    background: rgba(16, 185, 129, 0.06);
  }

  .step-num {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    opacity: 0.8;
  }

  h1 {
    font-size: 22px;
    font-weight: 700;
    letter-spacing: -0.02em;
    margin-bottom: 8px;
  }

  .desc {
    color: var(--muted);
    font-size: 14px;
    line-height: 1.55;
    margin-bottom: 22px;
  }

  .alert {
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.3);
    color: #fca5a5;
    font-size: 13px;
    padding: 11px 14px;
    border-radius: 10px;
    margin-bottom: 18px;
  }

  .primary-btn {
    width: 100%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 14px 20px;
    border: 0;
    border-radius: 12px;
    background: var(--cyan);
    color: #030712;
    font-family: 'Inter', sans-serif;
    font-size: 15px;
    font-weight: 700;
    text-decoration: none;
    cursor: pointer;
    transition: transform 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
    box-shadow: 0 8px 24px var(--cyan-glow);
  }

  .primary-btn:hover {
    background: var(--cyan-hover);
    transform: translateY(-1px);
  }

  .primary-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none;
  }

  .footer-note {
    margin-top: 18px;
    text-align: center;
    font-size: 12px;
    color: var(--muted);
  }
`;

// Health check
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok", service: "spectre-hub" });
});

// Get Key Portal (Ana Sayfa)
app.get("/", (req, res) => {
  const bypassAlert = req.query.error === "bypass"
    ? `<div class="alert">Checkpoint incomplete. Click <strong>Get Key</strong> and finish the verification first.</div>`
    : "";

  res.type("html").send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Spectre Hub — Key System</title>
  <style>${SHARED_STYLES}</style>
</head>
<body>
  <div class="shell">
    <div class="topbar">
      <div class="brand">
        <div class="brand-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
            <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
            <polyline points="2 17 12 22 22 17"></polyline>
            <polyline points="2 12 12 17 22 12"></polyline>
          </svg>
        </div>
        <span>Spectre Hub</span>
      </div>
      <div class="badge"><span class="dot"></span>ONLINE</div>
    </div>

    <div class="steps">
      <div class="step active"><span>1. Checkpoint</span><span class="step-num">ACTIVE</span></div>
      <div class="step"><span>2. Access Key</span><span class="step-num">LOCKED</span></div>
    </div>

    ${bypassAlert}

    <h1>Get Access Key</h1>
    <p class="desc">Complete one quick security checkpoint to unlock your 24-hour Spectre Hub license key.</p>

    <a class="primary-btn" href="/go">
      <span>Get Key</span>
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4">
        <line x1="5" y1="12" x2="19" y2="12"></line>
        <polyline points="12 5 19 12 12 19"></polyline>
      </svg>
    </a>

    <div class="footer-note">Duration: 24 Hours &bull; Instant Activation</div>
  </div>
</body>
</html>`);
});

// Anti-bypass kapısı: Oturum başlatır ve LootLabs'a yönlendirir
app.get("/go", (req, res) => {
  const token = signValue(String(Date.now()));
  res.setHeader(
    "Set-Cookie",
    `sp_gate=${encodeURIComponent(token)}; Path=/; Max-Age=3600; HttpOnly; SameSite=Lax`
  );
  res.redirect(302, LOOTLABS_URL);
});

// Claim Key Vault (Görev sonrası ekran)
app.get("/claim", (req, res) => {
  const cookies = parseCookies(req);
  const existingKey = cookies.sp_key;
  const existingRecord = existingKey ? activeKeys.get(existingKey) : null;
  const hasActiveKey = existingRecord && existingRecord.expiresAt > Date.now();

  if (!hasActiveKey && !hasValidCheckpoint(req)) {
    return res.redirect(302, "/?error=bypass");
  }

  res.type("html").send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Spectre Hub — Access Vault</title>
  <style>
    ${SHARED_STYLES}

    .vault {
      display: none;
      margin-top: 18px;
      background: var(--surface);
      border: 1px solid var(--border-accent);
      border-radius: 14px;
      padding: 16px;
    }

    .vault-label {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 11px;
      font-family: 'JetBrains Mono', monospace;
      color: var(--muted);
      margin-bottom: 10px;
      text-transform: uppercase;
    }

    .timer {
      color: var(--cyan);
      font-weight: 700;
    }

    .key-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      background: #080a0e;
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 12px 14px;
    }

    .key-text {
      font-family: 'JetBrains Mono', monospace;
      font-size: 14px;
      font-weight: 700;
      color: var(--text);
      letter-spacing: 0.04em;
      user-select: all;
      overflow-x: auto;
    }

    .copy-btn {
      flex-shrink: 0;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 12px;
      border-radius: 8px;
      border: 1px solid var(--border);
      background: var(--card);
      color: var(--text);
      font-family: 'Inter', sans-serif;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .copy-btn:hover {
      border-color: var(--cyan);
      color: var(--cyan);
    }

    .copy-btn.copied {
      border-color: rgba(16, 185, 129, 0.45);
      color: var(--green);
      background: rgba(16, 185, 129, 0.08);
    }

    .status-line {
      margin-top: 12px;
      font-size: 12px;
      color: var(--muted);
      text-align: center;
      min-height: 16px;
    }
  </style>
</head>
<body>
  <div class="shell">
    <div class="topbar">
      <div class="brand">
        <div class="brand-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
            <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
            <polyline points="2 17 12 22 22 17"></polyline>
            <polyline points="2 12 12 17 22 12"></polyline>
          </svg>
        </div>
        <span>Spectre Hub</span>
      </div>
      <div class="badge"><span class="dot"></span>VERIFIED</div>
    </div>

    <div class="steps">
      <div class="step done"><span>1. Checkpoint</span><span class="step-num">DONE</span></div>
      <div class="step active"><span>2. Access Key</span><span class="step-num">READY</span></div>
    </div>

    <h1>Access Unlocked</h1>
    <p class="desc">Verification complete. Generate your 24-hour key below and paste it into the Spectre Hub loader.</p>

    <button id="claimBtn" class="primary-btn" type="button">
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3">
        <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"></path>
      </svg>
      <span id="claimBtnText">Generate Access Key</span>
    </button>

    <div id="vault" class="vault">
      <div class="vault-label">
        <span>License Key</span>
        <span id="timer" class="timer">24h 00m 00s</span>
      </div>
      <div class="key-row">
        <span id="keyText" class="key-text"></span>
        <button id="copyBtn" class="copy-btn" type="button">Copy</button>
      </div>
    </div>

    <div id="statusLine" class="status-line"></div>
  </div>

  <script>
    const claimBtn = document.getElementById("claimBtn");
    const claimBtnText = document.getElementById("claimBtnText");
    const vault = document.getElementById("vault");
    const keyText = document.getElementById("keyText");
    const copyBtn = document.getElementById("copyBtn");
    const timerEl = document.getElementById("timer");
    const statusLine = document.getElementById("statusLine");

    let currentKey = "";
    let expiresAt = 0;
    let timerInterval = null;

    function updateTimer() {
      const diff = expiresAt - Date.now();
      if (diff <= 0) {
        timerEl.textContent = "EXPIRED";
        clearInterval(timerInterval);
        return;
      }
      const h = String(Math.floor(diff / 3600000)).padStart(2, "0");
      const m = String(Math.floor((diff % 3600000) / 60000)).padStart(2, "0");
      const s = String(Math.floor((diff % 60000) / 1000)).padStart(2, "0");
      timerEl.textContent = h + "h " + m + "m " + s + "s";
    }

    function showKey(key, exp) {
      currentKey = key;
      expiresAt = exp;
      keyText.textContent = key;
      vault.style.display = "block";
      claimBtn.style.display = "none";
      statusLine.textContent = "Active session bound to this browser.";
      updateTimer();
      if (timerInterval) clearInterval(timerInterval);
      timerInterval = setInterval(updateTimer, 1000);
    }

    async function requestKey() {
      claimBtn.disabled = true;
      claimBtnText.textContent = "Generating...";
      try {
        const res = await fetch("/api/claim-key", { method: "POST" });
        const data = await res.json();
        if (!res.ok || !data.key) {
          throw new Error(data.error || "Verification required.");
        }
        showKey(data.key, data.expiresAt);
      } catch (err) {
        statusLine.textContent = err.message;
        claimBtn.disabled = false;
        claimBtnText.textContent = "Generate Access Key";
      }
    }

    claimBtn.addEventListener("click", requestKey);

    copyBtn.addEventListener("click", async () => {
      if (!currentKey) return;
      try {
        await navigator.clipboard.writeText(currentKey);
      } catch {
        const ta = document.createElement("textarea");
        ta.value = currentKey;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      copyBtn.textContent = "Copied!";
      copyBtn.classList.add("copied");
      setTimeout(() => {
        copyBtn.textContent = "Copy";
        copyBtn.classList.remove("copied");
      }, 2000);
    });
  </script>
</body>
</html>`);
});

// Key üretme veya aktif key'i döndürme API'si
app.post("/api/claim-key", (req, res) => {
  cleanExpiredKeys();
  const cookies = parseCookies(req);
  const existingKey = cookies.sp_key;

  if (existingKey && activeKeys.has(existingKey)) {
    const rec = activeKeys.get(existingKey);
    if (rec.expiresAt > Date.now()) {
      return res.status(200).json({ key: existingKey, expiresAt: rec.expiresAt });
    }
  }

  if (!hasValidCheckpoint(req)) {
    return res.status(403).json({ error: "Checkpoint not completed." });
  }

  const key = generateKey();
  const expiresAt = Date.now() + KEY_TTL_MS;
  activeKeys.set(key, { createdAt: Date.now(), expiresAt });

  res.setHeader(
    "Set-Cookie",
    `sp_key=${encodeURIComponent(key)}; Path=/; Max-Age=86400; HttpOnly; SameSite=Lax`
  );

  return res.status(200).json({ key, expiresAt });
});

// Script tarafı Key doğrulama ucu
app.get("/api/verify-key", (req, res) => {
  cleanExpiredKeys();
  const key = String(req.query.key || "").trim();
  const record = activeKeys.get(key);

  if (!record || record.expiresAt <= Date.now()) {
    activeKeys.delete(key);
    return res.status(401).json({ valid: false, error: "Invalid or expired key" });
  }

  return res.status(200).json({ valid: true, expiresAt: record.expiresAt });
});

app.listen(PORT, () => {
  console.log(`Spectre Hub running on port ${PORT}`);
});
