// proxy.js
// Simple forwarding proxy to Apps Script with Basic Auth and optional token injection.
// Usage: set env APPS_SCRIPT_URL, BASIC_USER, BASIC_PASS, INJECT_TOKEN (optional)

const express = require('express');
const multer = require('multer');
const fetch = require('node-fetch');
const FormData = require('form-data');
const cors = require('cors');
const basicAuth = require('express-basic-auth');

const upload = multer(); // parse multipart/form-data
const app = express();

// Allow CORS from Netlify (or all origins). In production restrict to your Netlify domain.
app.use(cors({
  origin: true, // or set to ['https://your-netlify-site.netlify.app']
  credentials: true
}));

// Basic auth config (required)
const BASIC_USER = process.env.BASIC_USER || 'admin';
const BASIC_PASS = process.env.BASIC_PASS || 'password';
app.use(basicAuth({
  users: { [BASIC_USER]: BASIC_PASS },
  challenge: true,
  realm: 'Protected'
}));

const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL; // required
const INJECT_TOKEN = process.env.INJECT_TOKEN || null; // optional: strong token stored only on server

if (!APPS_SCRIPT_URL) {
  console.error('APPS_SCRIPT_URL not set. Exiting.');
  process.exit(1);
}

app.post('/proxy', upload.none(), async (req, res) => {
  try {
    // Basic validation: ensure some expected fields exist
    // You can add more validation here (date format, numeric ranges, etc.)
    const body = req.body || {};
    // Build form-data to forward
    const fd = new FormData();

    // If server should inject token (preferred), do not forward client token.
    if (INJECT_TOKEN) {
      fd.append('token', INJECT_TOKEN);
    } else if (body.token) {
      fd.append('token', body.token);
    }

    // Forward all other fields
    for (const k of Object.keys(body)) {
      if (k === 'token' && INJECT_TOKEN) continue;
      fd.append(k, body[k]);
    }

    // Forward to Apps Script
    const r = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      body: fd
    });

    const text = await r.text();
    // Return same status and body back to client
    res.status(r.status).set('Content-Type', r.headers.get('content-type') || 'text/plain').send(text);
  } catch (err) {
    console.error('Proxy error', err);
    res.status(500).json({ status: 'error', message: 'proxy error' });
  }
});

// optional healthcheck
app.get('/health', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('proxy listening on', PORT));