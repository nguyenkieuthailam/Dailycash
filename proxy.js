// proxy.js - CORS を先に、BasicAuth を後にするパターン

const express = require('express');
const multer = require('multer');
const fetch = require('node-fetch');
const FormData = require('form-data');
const cors = require('cors');
const basicAuth = require('express-basic-auth');

const upload = multer();
const app = express();

const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;
const INJECT_TOKEN = process.env.INJECT_TOKEN || null;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';
const BASIC_USER = process.env.BASIC_USER || 'admin';
const BASIC_PASS = process.env.BASIC_PASS || 'password';

if (!APPS_SCRIPT_URL) {
  console.error('APPS_SCRIPT_URL not set. Exiting.');
  process.exit(1);
}

// --- CORS を先に適用 ---
// ここで Access-Control-Allow-Origin / Headers / Methods を設定
const corsOptions = {
  origin: (origin, callback) => {
    // ALLOWED_ORIGIN は単一ドメイン文字列を想定（例: 'https://dailycash-form.netlify.app'）
    if (ALLOWED_ORIGIN === '*' || !origin || origin === ALLOWED_ORIGIN) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET','POST','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization','Accept']
};
app.use(cors(corsOptions));
// 明示的な preflight handler（OPTIONS）を用意（認証は不要）
app.options('*', cors(corsOptions));

// --- Basic Auth は CORS の後に置く ---
// ただしプリフライト（OPTIONS）はここで弾かれない（既に処理済み）
app.use(basicAuth({
  users: { [BASIC_USER]: BASIC_PASS },
  challenge: true,
  realm: 'Protected'
}));

// --- Proxy POST handler ---
app.post('/proxy', upload.none(), async (req, res) => {
  try {
    const body = req.body || {};
    const fd = new FormData();

    if (INJECT_TOKEN) {
      fd.append('token', INJECT_TOKEN);
    } else if (body.token) {
      fd.append('token', body.token);
    }

    Object.keys(body).forEach(k => {
      if (k === 'token' && INJECT_TOKEN) return;
      fd.append(k, body[k]);
    });

    const r = await fetch(APPS_SCRIPT_URL, { method: 'POST', body: fd });
    const text = await r.text();

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