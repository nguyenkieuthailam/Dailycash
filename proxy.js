// proxy.js (updated - CORS + BasicAuth handling)
const express = require('express');
const multer = require('multer');
const fetch = require('node-fetch');
const FormData = require('form-data');
const cors = require('cors');
const basicAuth = require('express-basic-auth');

const upload = multer();
const app = express();

// 設定は環境変数で注入
const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL; // required
const INJECT_TOKEN = process.env.INJECT_TOKEN || null; // optional (server-side token)
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*'; // 本番は Netlify のドメインに限定すること
const BASIC_USER = process.env.BASIC_USER || 'admin';
const BASIC_PASS = process.env.BASIC_PASS || 'password';

if (!APPS_SCRIPT_URL) {
  console.error('APPS_SCRIPT_URL not set. Exiting.');
  process.exit(1);
}

// Basic auth middleware
app.use(basicAuth({
  users: { [BASIC_USER]: BASIC_PASS },
  challenge: true,
  realm: 'Protected'
}));

// CORS: 明示的に許可するヘッダーを追加
app.use(cors({
  origin: ALLOWED_ORIGIN === '*' ? true : ALLOWED_ORIGIN,
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  methods: ['GET','POST','OPTIONS']
}));

// Preflight handler to ensure Access-Control headers present
app.options('*', cors({
  origin: ALLOWED_ORIGIN === '*' ? true : ALLOWED_ORIGIN,
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  methods: ['GET','POST','OPTIONS']
}));

app.post('/proxy', upload.none(), async (req, res) => {
  try {
    const body = req.body || {};

    // Build form-data to forward to Apps Script
    const fd = new FormData();

    // Inject server-side token if configured (preferred)
    if (INJECT_TOKEN) {
      fd.append('token', INJECT_TOKEN);
    } else if (body.token) {
      fd.append('token', body.token);
    }

    // Forward all fields except token (if injected)
    Object.keys(body).forEach(k => {
      if (k === 'token' && INJECT_TOKEN) return;
      fd.append(k, body[k]);
    });

    // Forward to Apps Script
    const r = await fetch(APPS_SCRIPT_URL, { method: 'POST', body: fd });
    const text = await r.text();

    // Propagate status and type
    res.status(r.status);
    const ct = r.headers.get('content-type');
    if (ct) res.set('Content-Type', ct);
    res.send(text);
  } catch (err) {
    console.error('Proxy error', err);
    res.status(500).json({ status: 'error', message: 'proxy error' });
  }
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('proxy listening on', PORT));