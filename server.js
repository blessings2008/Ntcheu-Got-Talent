// server.js — serves index.html, injecting per-track Open Graph tags
// so shared links show the right title/artwork preview on WhatsApp,
// Twitter, Facebook, etc. (those apps don't run JavaScript, so this
// has to happen on the server before the page is sent.)
//
// Uses only Node's built-in modules — no npm install required.

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = process.env.PORT || 3000;

// Same Supabase project the front-end uses
const SUPABASE_URL = 'https://qlcnrssinldjpxqhbajp.supabase.co';
const SUPABASE_KEY = 'sb_publishable_pnuLHk7AG5pIlYynbDVV7Q_AnPPzwQl';

const SITE_NAME = 'Ntcheu Got Talent';
const SITE_DESC = "Discover and download fresh music from Malawi's rising artists.";

const template = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf-8');
const adminTemplate = fs.readFileSync(path.join(__dirname, 'admin.html'), 'utf-8');

function escapeAttr(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function renderPage({ title, description, image, url }) {
  let html = template;
  html = html.split('{{OG_TITLE}}').join(escapeAttr(title));
  html = html.split('{{OG_DESC}}').join(escapeAttr(description));
  html = html.split('{{OG_URL}}').join(escapeAttr(url));

  const imageTags = image
    ? `<meta property="og:image" content="${escapeAttr(image)}"/>\n  <meta name="twitter:image" content="${escapeAttr(image)}"/>`
    : '';
  html = html.split('{{OG_IMAGE_TAGS}}').join(imageTags);

  return html;
}

// Tiny helper to GET JSON over https using only built-in modules
function fetchJson(targetUrl, headers) {
  return new Promise((resolve, reject) => {
    const req = https.get(targetUrl, { headers }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error(`Request failed: ${res.statusCode}`));
        }
        try {
          resolve(JSON.parse(body));
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(8000, () => req.destroy(new Error('Request timed out')));
  });
}

async function fetchTrack(trackId) {
  const url = `${SUPABASE_URL}/rest/v1/tracks?id=eq.${encodeURIComponent(trackId)}&select=*`;
  const rows = await fetchJson(url, {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
  });
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const baseUrl = `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host}`;

  // Homepage (with or without ?track=)
  if (parsedUrl.pathname === '/') {
    const trackId = parsedUrl.searchParams.get('track');

    if (trackId) {
      try {
        const track = await fetchTrack(trackId);
        if (track) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          return res.end(renderPage({
            title: `${track.title} — ${track.artist} | ${SITE_NAME}`,
            description: `Listen to "${track.title}" by ${track.artist} on ${SITE_NAME}.`,
            image: track.artwork_url || null,
            url: `${baseUrl}/?track=${track.id}`,
          }));
        }
      } catch (err) {
        console.error('Track lookup failed:', err.message);
        // fall through to default homepage below
      }
    }

    res.writeHead(200, { 'Content-Type': 'text/html' });
    return res.end(renderPage({
      title: SITE_NAME,
      description: SITE_DESC,
      image: null,
      url: baseUrl,
    }));
  }

  // Admin page — login + upload, not linked from public nav
  if (parsedUrl.pathname === '/admin') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    return res.end(adminTemplate);
  }

  // Any other static file in this folder (favicon, etc.) — optional
  const filePath = path.join(__dirname, parsedUrl.pathname);
  if (filePath.startsWith(__dirname) && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    return fs.createReadStream(filePath).pipe(res);
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`${SITE_NAME} running on port ${PORT}`);
});
