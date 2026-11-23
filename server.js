const express = require("express");
const crypto = require("crypto");

const app = express();
app.set("trust proxy", 1);

const PORT = process.env.PORT || 3000;
const BASE_LOOTLABS_URL = "https://lootdest.org/s?Q9e8wVMX";
const LOOTLABS_API_TOKEN = (process.env.LOOTLABS_API_TOKEN || "").trim();
const KEY_TTL_MS = 24 * 60 * 60 * 1000; // 24 saat
const MIN_TASK_MS = 15 * 1000; // Minimum 15 saniye görev süresi
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 dakika
const SECRET = process.env.SESSION_SECRET || "spectre-hub-amethyst-secret-2026";

const activeKeys = new Map();
const pendingSessions = new Map();

app.use(express.json());

function sha256(str) {
  return crypto.createHash("sha256").update(str).digest("hex").slice(0, 24);
}

function signToken(payload) {
  const sig = crypto.createHmac("sha256", SECRET).update(payload).digest("hex").slice(0, 24);
  return `${payload}.${sig}`;
}

function verifyToken(signed) {
  if (!signed || typeof signed !== "string" || !signed.includes(".")) return null;
  const idx = signed.lastIndexOf(".");
  const payload = signed.slice(0, idx);
  const expected = signToken(payload);
  if (signed.length !== expected.length) return null;
  return crypto.timingSafeEqual(Buffer.from(signed), Buffer.from(expected)) ? payload : null;
}

function parseCookies(req) {
  const header = req.headers.cookie || "";
  const cookies = {};
  header.split(";").forEach((part) => {
    const [k, ...v] = part.trim().split("=");
    if (k) cookies[k] = decodeURIComponent(v.join("="));
  });
  return cookies;
}

function getClientFingerprint(req) {
  const ua = String(req.headers["user-agent"] || "");
  const lang = String(req.headers["accept-language"] || "");
  return sha256(`${ua}|${lang}`);
}

function isAutomatedBot(req) {
  const ua = String(req.headers["user-agent"] || "").toLowerCase();
  const accept = String(req.headers["accept"] || "");
  const lang = String(req.headers["accept-language"] || "");

  if (!ua || !lang || !accept) return true;

  const blocked = [
    "headless", "puppeteer", "playwright", "selenium", "phantomjs",
    "curl/", "wget/", "python-requests", "aiohttp", "httpx",
    "axios", "node-fetch", "undici", "go-http-client",
    "discordbot", "bot/", "crawler", "spider"
  ];

  return blocked.some((sig) => ua.includes(sig));
}

function isAllowedLootlabsReferer(req) {
  const ref = String(req.headers["referer"] || "").toLowerCase();
  if (!ref) return false;

  const blockedBypassers = ["izen.lol", "bypass", "thebypasser", "admaven-bypass"];
  if (blockedBypassers.some((bad) => ref.includes(bad))) return false;

  const allowedHosts = [
    "lootdest.org",
    "lootlabs.gg",
    "loot-link.com",
    "loot-links.com",
    "lootlinks.co",
    "lootdest.com"
  ];

  return allowedHosts.some((host) => ref.includes(host));
}

function burnSession(sid) {
  if (sid) pendingSessions.delete(sid);
}

function validateCheckpoint(req, options = { checkRefererAndCallback: true }) {
  if (isAutomatedBot(req)) {
    return { ok: false, reason: "Automated client blocked." };
  }

  const cookies = parseCookies(req);
  const sid = verifyToken(cookies.sp_sid);
  if (!sid) {
    return { ok: false, reason: "Missing verification session." };
  }

  const session = pendingSessions.get(sid);
  if (!session || session.used) {
    burnSession(sid);
    return { ok: false, reason: "Session expired or already used." };
  }

  if (session.fingerprint !== getClientFingerprint(req)) {
    burnSession(sid);
    return { ok: false, reason: "Browser mismatch detected." };
  }

  if (options.checkRefererAndCallback) {
    if (!isAllowedLootlabsReferer(req)) {
      burnSession(sid);
      return { ok: false, reason: "Bypass or invalid referrer detected." };
    }

    if (session.encryptedMode) {
      const cb = String(req.query.cb || "");
      if (!cb || cb !== session.cb) {
        burnSession(sid);
        return { ok: false, reason: "Invalid callback token." };
      }
    }
  }

  const elapsed = Date.now() - session.createdAt;
  if (elapsed < MIN_TASK_MS) {
    burnSession(sid);
    return { ok: false, reason: "Checkpoint completed too fast." };
  }

  if (elapsed > SESSION_TTL_MS) {
    burnSession(sid);
    return { ok: false, reason: "Session timed out." };
  }

  return { ok: true, sid, session };
}

function generateKey() {
  const p1 = crypto.randomBytes(2).toString("hex").toUpperCase();
  const p2 = crypto.randomBytes(2).toString("hex").toUpperCase();
  const p3 = crypto.randomBytes(2).toString("hex").toUpperCase();
  return `SPH-${p1}-${p2}-${p3}`;
}

async function buildEncryptedLootlabsUrl(destinationUrl) {
  if (!LOOTLABS_API_TOKEN) return null;
  try {
    const endpoint = `https://creators.lootlabs.gg/api/public/url_encryptor?destination_url=${encodeURIComponent(
      destinationUrl
    )}&api_token=${encodeURIComponent(LOOTLABS_API_TOKEN)}`;

    const response = await fetch(endpoint, { method: "GET" });
    const data = await response.json();
    if (data && data.message && data.type !== "error") {
      const sep = BASE_LOOTLABS_URL.includes("?") ? "&" : "?";
      return `${BASE_LOOTLABS_URL}${sep}data=${data.message}`;
    }
  } catch (err) {
    console.error("LootLabs encryptor error:", err.message);
  }
  return null;
}

setInterval(() => {
  const now = Date.now();
  for (const [key, data] of activeKeys.entries()) {
    if (data.expiresAt <= now) activeKeys.delete(key);
  }
  for (const [sid, data] of pendingSessions.entries()) {
    if (now - data.createdAt > SESSION_TTL_MS) pendingSessions.delete(sid);
  }
}, 5 * 60 * 1000);

const SHARED_UI = `
  @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;700&display=swap');

  :root {
    --bg: #06040d;
    --card: rgba(14, 10, 26, 0.86);
    --surface: rgba(24, 17, 44, 0.75);
    --border: rgba(192, 132, 252, 0.18);
    --border-bright: rgba(192, 132, 252, 0.48);
    --text: #faf7ff;
    --muted: #a79bc2;
    --violet: #c084fc;
    --pink: #e879f9;
    --green: #34d399;
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg);
    color: var(--text);
    font-family: 'Plus Jakarta Sans', -apple-system, sans-serif;
    padding: 20px;
    overflow-x: hidden;
    position: relative;
  }

  .aurora {
    position: fixed;
    inset: 0;
    pointer-events: none;
    background:
      radial-gradient(circle at 50% -10%, rgba(168, 85, 247, 0.28), transparent 55%),
      radial-gradient(circle at 85% 85%, rgba(232, 121, 249, 0.14), transparent 45%),
      radial-gradient(circle at 15% 75%, rgba(124, 58, 237, 0.18), transparent 45%);
    z-index: 0;
  }

  #sparkles {
    position: fixed;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 0;
  }

  .card {
    position: relative;
    z-index: 1;
    width: 100%;
    max-width: 430px;
    background: var(--card);
    backdrop-filter: blur(18px);
    -webkit-backdrop-filter: blur(18px);
    border: 1px solid var(--border);
    border-radius: 22px;
    padding: 28px;
    box-shadow:
      0 25px 70px rgba(0, 0, 0, 0.75),
      0 0 40px rgba(147, 51, 234, 0.16),
      inset 0 1px 0 rgba(255, 255, 255, 0.12);
    overflow: hidden;
  }

  .card::before {
    content: "";
    position: absolute;
    top: 0;
    left: -100%;
    width: 60%;
    height: 2px;
    background: linear-gradient(90deg, transparent, var(--violet), var(--pink), transparent);
    animation: topShimmer 4s infinite ease-in-out;
  }

  @keyframes topShimmer {
    0% { left: -60%; }
    50%, 100% { left: 130%; }
  }

  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-bottom: 18px;
    margin-bottom: 20px;
    border-bottom: 1px solid rgba(192, 132, 252, 0.12);
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 11px;
  }

  .logo-orb {
    width: 34px;
    height: 34px;
    border-radius: 10px;
    background: linear-gradient(135deg, rgba(168, 85, 247, 0.35), rgba(232, 121, 249, 0.15));
    border: 1px solid var(--border-bright);
    display: flex;
    align-items: center;
    justify-content: center;
    color: #f3e8ff;
    box-shadow: 0 0 18px rgba(168, 85, 247, 0.45);
  }

  .brand-name {
    font-size: 16px;
    font-weight: 800;
    letter-spacing: 0.04em;
    background: linear-gradient(90deg, #ffffff, #e9d5ff, #f5d0fe);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }

  .status-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    font-weight: 700;
    color: var(--green);
    background: rgba(52, 211, 153, 0.1);
    border: 1px solid rgba(52, 211, 153, 0.28);
    padding: 4px 10px;
    border-radius: 999px;
  }

  .pulse {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--green);
    box-shadow: 0 0 10px var(--green);
    animation: pulseGlow 2s infinite;
  }

  @keyframes pulseGlow {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.45; transform: scale(0.85); }
  }

  .progress-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin-bottom: 22px;
  }

  .pill-step {
    background: var(--surface);
    border: 1px solid rgba(192, 132, 252, 0.12);
    border-radius: 11px;
    padding: 10px 12px;
    font-size: 12px;
    color: var(--muted);
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .pill-step.current {
    border-color: var(--border-bright);
    color: var(--text);
    background: rgba(147, 51, 234, 0.14);
    box-shadow: inset 0 0 16px rgba(168, 85, 247, 0.12);
  }

  .pill-step.complete {
    border-color: rgba(52, 211, 153, 0.35);
    color: var(--green);
    background: rgba(52, 211, 153, 0.08);
  }

  .tag {
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    opacity: 0.85;
  }

  h1 {
    font-size: 24px;
    font-weight: 800;
    letter-spacing: -0.02em;
    margin-bottom: 8px;
    background: linear-gradient(135deg, #ffffff 30%, #d8b4fe 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }

  .subtitle {
    color: var(--muted);
    font-size: 14px;
    line-height: 1.55;
    margin-bottom: 22px;
  }

  .warn-box {
    background: rgba(251, 113, 133, 0.1);
    border: 1px solid rgba(251, 113, 133, 0.32);
    color: #fecdd3;
    font-size: 13px;
    padding: 11px 14px;
    border-radius: 12px;
    margin-bottom: 18px;
  }

  .shimmer-btn {
    position: relative;
    overflow: hidden;
    width: 100%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 9px;
    padding: 15px 22px;
    border: 1px solid rgba(232, 121, 249, 0.45);
    border-radius: 13px;
    background: linear-gradient(135deg, #7e22ce 0%, #9333ea 50%, #c026d3 100%);
    color: #ffffff;
    font-family: 'Plus Jakarta Sans', sans-serif;
    font-size: 15px;
    font-weight: 700;
    letter-spacing: 0.01em;
    text-decoration: none;
    cursor: pointer;
    box-shadow:
      0 10px 28px rgba(147, 51, 234, 0.45),
      inset 0 1px 0 rgba(255, 255, 255, 0.3);
    transition: transform 0.16s ease, box-shadow 0.16s ease;
  }

  .shimmer-btn::after {
    content: "";
    position: absolute;
    top: 0;
    left: -120%;
    width: 55%;
    height: 100%;
    background: linear-gradient(
      115deg,
      transparent 0%,
      rgba(255, 255, 255, 0.35) 50%,
      transparent 100%
    );
    animation: btnSweep 3.2s infinite ease-in-out;
  }

  @keyframes btnSweep {
    0% { left: -120%; }
    45%, 100% { left: 150%; }
  }

  .shimmer-btn:hover {
    transform: translateY(-1px);
    box-shadow:
      0 14px 34px rgba(168, 85, 247, 0.6),
      inset 0 1px 0 rgba(255, 255, 255, 0.4);
  }

  .shimmer-btn:disabled {
    opacity: 0.65;
    cursor: not-allowed;
    transform: none;
  }

  .meta {
    margin-top: 18px;
    text-align: center;
    font-size: 12px;
    color: var(--muted);
  }
`;

const SPARKLE_SCRIPT = `
  (function () {
    const canvas = document.getElementById("sparkles");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let w, h, particles = [];

    function resize() {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
    }
    window.addEventListener("resize", resize);
    resize();

    const colors = ["rgba(192,132,252,", "rgba(232,121,249,", "rgba(168,85,247,", "rgba(245,208,254,"];
    for (let i = 0; i < 34; i++) {
      particles.push({
        x: Math.random() * w,
        y: Math.random() * h,
        r: Math.random() * 2 + 0.7,
        vy: -(Math.random() * 0.35 + 0.12),
        vx: (Math.random() - 0.5) * 0.2,
        alpha: Math.random() * 0.7 + 0.2,
        phase: Math.random() * Math.PI * 2,
        color: colors[i % colors.length]
      });
    }

    function draw() {
      ctx.clearRect(0, 0, w, h);
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.phase += 0.035;
        if (p.y < -10) { p.y = h + 10; p.x = Math.random() * w; }
        if (p.x < -10) p.x = w + 10;
        if (p.x > w + 10) p.x = -10;

        const twinkle = (Math.sin(p.phase) + 1) * 0.5;
        const a = (p.alpha * (0.35 + twinkle * 0.65)).toFixed(2);

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.color + a + ")";
        ctx.shadowBlur = 10;
        ctx.shadowColor = "rgba(192, 132, 252, 0.8)";
        ctx.fill();
      }
      requestAnimationFrame(draw);
    }
    draw();
  })();
`;

app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok", encryptedAntiBypass: Boolean(LOOTLABS_API_TOKEN) });
});

app.get("/", (req, res) => {
  const errorNotice = req.query.error === "bypass"
    ? `<div class="warn-box">Bypass blocked. Click <strong>Get Key</strong> and complete the task directly on LootLabs.</div>`
    : "";

  res.type("html").send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Spectre Hub — Key System</title>
  <style>${SHARED_UI}</style>
</head>
<body>
  <div class="aurora"></div>
  <canvas id="sparkles"></canvas>

  <div class="card">
    <div class="header">
      <div class="brand">
        <div class="logo-orb">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
            <path d="M12 2L15 9L22 12L15 15L12 22L9 15L2 12L9 9L12 2Z"></path>
          </svg>
        </div>
        <span class="brand-name">SPECTRE HUB</span>
      </div>
      <div class="status-pill"><span class="pulse"></span>ONLINE</div>
    </div>

    <div class="progress-grid">
      <div class="pill-step current"><span>1. Checkpoint</span><span class="tag">ACTIVE</span></div>
      <div class="pill-step"><span>2. Access Key</span><span class="tag">LOCKED</span></div>
    </div>

    ${errorNotice}

    <h1>Get Access Key</h1>
    <p class="subtitle">Complete the verification step to unlock your 24-hour Spectre Hub license key.</p>

    <a class="shimmer-btn" href="/go">
      <span>Get Key</span>
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4">
        <line x1="5" y1="12" x2="19" y2="12"></line>
        <polyline points="12 5 19 12 12 19"></polyline>
      </svg>
    </a>

    <div class="meta">24-Hour License &bull; Anti-Bypass Protected</div>
  </div>

  <script>${SPARKLE_SCRIPT}</script>
</body>
</html>`);
});

app.get("/go", async (req, res) => {
  if (isAutomatedBot(req)) {
    return res.status(403).send("Automated requests are not allowed.");
  }

  const sid = crypto.randomBytes(16).toString("hex");
  const cb = crypto.randomBytes(16).toString("hex");
  const baseUrl = `${req.protocol}://${req.get("host")}`;
  const callbackUrl = `${baseUrl}/claim?cb=${cb}`;

  const encryptedUrl = await buildEncryptedLootlabsUrl(callbackUrl);

  pendingSessions.set(sid, {
    createdAt: Date.now(),
    fingerprint: getClientFingerprint(req),
    cb,
    encryptedMode: Boolean(encryptedUrl),
    verified: false,
    used: false
  });

  const signedSid = signToken(sid);
  res.setHeader(
    "Set-Cookie",
    `sp_sid=${encodeURIComponent(signedSid)}; Path=/; Max-Age=1800; HttpOnly; SameSite=Lax`
  );

  return res.redirect(302, encryptedUrl || BASE_LOOTLABS_URL);
});

app.get("/claim", (req, res) => {
  const cookies = parseCookies(req);
  const existingKey = cookies.sp_key;
  const existingRecord = existingKey ? activeKeys.get(existingKey) : null;
  const hasActiveKey = existingRecord && existingRecord.expiresAt > Date.now();

  if (!hasActiveKey) {
    const check = validateCheckpoint(req, { checkRefererAndCallback: true });
    if (!check.ok) {
      res.setHeader("Set-Cookie", "sp_sid=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax");
      return res.redirect(302, "/?error=bypass");
    }
    check.session.verified = true;
  }

  res.type("html").send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Spectre Hub — Claim Key</title>
  <style>
    ${SHARED_UI}

    .key-vault {
      display: none;
      margin-top: 18px;
      background: var(--surface);
      border: 1px solid var(--border-bright);
      border-radius: 15px;
      padding: 16px;
      box-shadow: inset 0 0 24px rgba(168, 85, 247, 0.14);
    }

    .vault-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      color: var(--muted);
      margin-bottom: 10px;
      text-transform: uppercase;
    }

    .countdown {
      color: var(--pink);
      font-weight: 700;
    }

    .key-box {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      background: rgba(7, 5, 16, 0.9);
      border: 1px solid rgba(192, 132, 252, 0.25);
      border-radius: 11px;
      padding: 12px 14px;
    }

    .key-value {
      font-family: 'JetBrains Mono', monospace;
      font-size: 14px;
      font-weight: 700;
      color: #f3e8ff;
      letter-spacing: 0.04em;
      user-select: all;
      overflow-x: auto;
    }

    .copy-btn {
      flex-shrink: 0;
      padding: 8px 13px;
      border-radius: 9px;
      border: 1px solid var(--border-bright);
      background: rgba(147, 51, 234, 0.22);
      color: #f5d0fe;
      font-family: 'Plus Jakarta Sans', sans-serif;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .copy-btn:hover {
      background: rgba(168, 85, 247, 0.38);
      color: #ffffff;
    }

    .copy-btn.copied {
      border-color: rgba(52, 211, 153, 0.5);
      background: rgba(52, 211, 153, 0.16);
      color: var(--green);
    }

    .msg {
      margin-top: 12px;
      text-align: center;
      font-size: 12px;
      color: var(--muted);
      min-height: 16px;
    }
  </style>
</head>
<body>
  <div class="aurora"></div>
  <canvas id="sparkles"></canvas>

  <div class="card">
    <div class="header">
      <div class="brand">
        <div class="logo-orb">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
            <path d="M12 2L15 9L22 12L15 15L12 22L9 15L2 12L9 9L12 2Z"></path>
          </svg>
        </div>
        <span class="brand-name">SPECTRE HUB</span>
      </div>
      <div class="status-pill"><span class="pulse"></span>VERIFIED</div>
    </div>

    <div class="progress-grid">
      <div class="pill-step complete"><span>1. Checkpoint</span><span class="tag">DONE</span></div>
      <div class="pill-step current"><span>2. Access Key</span><span class="tag">READY</span></div>
    </div>

    <h1>Access Unlocked</h1>
    <p class="subtitle">Verification complete. Claim your 24-hour key below and paste it into the Spectre Hub script.</p>

    <button id="claimBtn" class="shimmer-btn" type="button">
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3">
        <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"></path>
      </svg>
      <span id="claimLabel">Claim Key</span>
    </button>

    <div id="vault" class="key-vault">
      <div class="vault-top">
        <span>Your Key</span>
        <span id="timer" class="countdown">24h 00m 00s</span>
      </div>
      <div class="key-box">
        <span id="keyValue" class="key-value"></span>
        <button id="copyBtn" class="copy-btn" type="button">Copy</button>
      </div>
    </div>

    <div id="msg" class="msg"></div>
  </div>

  <script>
    ${SPARKLE_SCRIPT}

    const claimBtn = document.getElementById("claimBtn");
    const claimLabel = document.getElementById("claimLabel");
    const vault = document.getElementById("vault");
    const keyValue = document.getElementById("keyValue");
    const copyBtn = document.getElementById("copyBtn");
    const timerEl = document.getElementById("timer");
    const msgEl = document.getElementById("msg");

    let activeKey = "";
    let expiresAt = 0;
    let intervalId = null;

    function tickTimer() {
      const left = expiresAt - Date.now();
      if (left <= 0) {
        timerEl.textContent = "EXPIRED";
        clearInterval(intervalId);
        return;
      }
      const h = String(Math.floor(left / 3600000)).padStart(2, "0");
      const m = String(Math.floor((left % 3600000) / 60000)).padStart(2, "0");
      const s = String(Math.floor((left % 60000) / 1000)).padStart(2, "0");
      timerEl.textContent = h + "h " + m + "m " + s + "s";
    }

    function revealKey(key, exp) {
      activeKey = key;
      expiresAt = exp;
      keyValue.textContent = key;
      vault.style.display = "block";
      claimBtn.style.display = "none";
      msgEl.textContent = "Key bound to this browser session.";
      tickTimer();
      if (intervalId) clearInterval(intervalId);
      intervalId = setInterval(tickTimer, 1000);
    }

    claimBtn.addEventListener("click", async () => {
      claimBtn.disabled = true;
      claimLabel.textContent = "Generating...";
      try {
        const res = await fetch("/api/claim-key", { method: "POST" });
        const data = await res.json();
        if (!res.ok || !data.key) {
          throw new Error(data.error || "Verification failed.");
        }
        revealKey(data.key, data.expiresAt);
      } catch (err) {
        msgEl.textContent = err.message;
        claimBtn.disabled = false;
        claimLabel.textContent = "Claim Key";
      }
    });

    copyBtn.addEventListener("click", async () => {
      if (!activeKey) return;
      try {
        await navigator.clipboard.writeText(activeKey);
      } catch {
        const ta = document.createElement("textarea");
        ta.value = activeKey;
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

app.post("/api/claim-key", (req, res) => {
  if (isAutomatedBot(req)) {
    return res.status(403).json({ error: "Automated requests blocked." });
  }

  const cookies = parseCookies(req);
  const existingKey = cookies.sp_key;

  if (existingKey && activeKeys.has(existingKey)) {
    const rec = activeKeys.get(existingKey);
    if (rec.expiresAt > Date.now()) {
      return res.status(200).json({ key: existingKey, expiresAt: rec.expiresAt });
    }
  }

  const check = validateCheckpoint(req, { checkRefererAndCallback: false });
  if (!check.ok || !check.session.verified) {
    return res.status(403).json({ error: "Bypass blocked." });
  }

  check.session.used = true;
  burnSession(check.sid);

  const key = generateKey();
  const expiresAt = Date.now() + KEY_TTL_MS;
  activeKeys.set(key, { createdAt: Date.now(), expiresAt });

  res.setHeader("Set-Cookie", [
    `sp_key=${encodeURIComponent(key)}; Path=/; Max-Age=86400; HttpOnly; SameSite=Lax`,
    `sp_sid=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`
  ]);

  return res.status(200).json({ key, expiresAt });
});

app.get("/api/verify-key", (req, res) => {
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
