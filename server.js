// server.js — serves index.html with per-track Open Graph tags injected server-side
// so shared links show the right title/artwork on WhatsApp, Facebook, etc.
// Uses only Node built-ins — no npm install required.

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = process.env.PORT || 3000;

const SUPABASE_URL = 'https://qlcnrssinldjpxqhbajp.supabase.co';
const SUPABASE_KEY = 'sb_publishable_pnuLHk7AG5pIlYynbDVV7Q_AnPPzwQl';

const SITE_NAME  = 'Ntcheu Got Talent';
const SITE_DESC  = 'Discover, listen to, and download music from talented artists connected to Ntcheu and the Angoni community.';

const template      = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf-8');
const adminTemplate = fs.readFileSync(path.join(__dirname, 'admin.html'), 'utf-8');

function escAttr(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function renderPage({ title, description, image, url }) {
  let html = template;
  html = html.split('{{OG_TITLE}}').join(escAttr(title));
  html = html.split('{{OG_DESC}}').join(escAttr(description));
  html = html.split('{{OG_URL}}').join(escAttr(url));
  const imageTags = image
    ? `<meta property="og:image" content="${escAttr(image)}"/>\n  <meta name="twitter:image" content="${escAttr(image)}"/>`
    : '';
  html = html.split('{{OG_IMAGE_TAGS}}').join(imageTags);
  return html;
}

function fetchJson(targetUrl, headers) {
  return new Promise((resolve, reject) => {
    const req = https.get(targetUrl, { headers }, (res) => {
      let body = '';
      res.on('data', (c) => body += c);
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error(`HTTP ${res.statusCode}`));
        }
        try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.setTimeout(8000, () => req.destroy(new Error('Timeout')));
  });
}

async function fetchTrack(trackId) {
  const url = `${SUPABASE_URL}/rest/v1/tracks?id=eq.${encodeURIComponent(trackId)}&select=id,title,artist,genre,artwork_url`;
  const rows = await fetchJson(url, {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
  });
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.webp': 'image/webp',
};

const server = http.createServer(async (req, res) => {
  const parsed  = new URL(req.url, `http://${req.headers.host}`);
  const proto   = req.headers['x-forwarded-proto'] || 'http';
  const baseUrl = `${proto}://${req.headers.host}`;

  // Hidden admin dashboard — not linked anywhere on the public site
  if (parsed.pathname === '/studio') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    return res.end(adminTemplate);
  }

  // Public homepage — inject OG tags per-track when ?track= param present
  if (parsed.pathname === '/') {
    const trackId = parsed.searchParams.get('track');

    if (trackId) {
      try {
        const track = await fetchTrack(trackId);
        if (track) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          return res.end(renderPage({
            title:       `${track.title} — ${track.artist} | ${SITE_NAME}`,
            description: `Listen to "${track.title}" by ${track.artist} on Ntcheu Got Talent. Free to stream and download.`,
            image:       track.artwork_url || null,
            url:         `${baseUrl}/?track=${track.id}`,
          }));
        }
      } catch (err) {
        console.error('Track OG lookup failed:', err.message);
      }
    }

    res.writeHead(200, { 'Content-Type': 'text/html' });
    return res.end(renderPage({
      title:       SITE_NAME,
      description: SITE_DESC,
      image:       null,
      url:         baseUrl,
    }));
  }

  // Static files (favicon, etc.)
  const filePath = path.join(__dirname, parsed.pathname);
  if (filePath.startsWith(__dirname) && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    return fs.createReadStream(filePath).pipe(res);
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
});

server.listen(PORT, () => console.log(`${SITE_NAME} running on port ${PORT}`));
