/**
 * Beyond Headlines // Autocue — Server & Neon Database API
 * Uses Neon Postgres (ep-withered-base-a1nixm16-pooler.ap-southeast-1.aws.neon.tech/neondb)
 * as the single source of truth for all documents and studio settings across all devices.
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = Number(process.env.PORT) || 8090;
const NEON_CONNECTION_URI =
  process.env.NEON_DATABASE_URL ||
  process.env.DATABASE_URL ||
  'postgresql://neondb_owner:npg_p9zU8rnvPiaD@ep-withered-base-a1nixm16-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require';

const NEON_HOST = new URL(NEON_CONNECTION_URI).hostname;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

function executeNeonSql(query, params = []) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ query, params });
    const req = https.request(
      {
        hostname: NEON_HOST,
        port: 443,
        path: '/sql',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          'Neon-Connection-String': NEON_CONNECTION_URI,
          'Neon-Raw-Text-Output': 'false',
          'Neon-Array-Mode': 'false'
        }
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(body));
            } catch {
              reject(new Error('Invalid JSON from Neon SQL endpoint'));
            }
          } else {
            reject(new Error(`Neon HTTP ${res.statusCode}: ${body.slice(0, 240)}`));
          }
        });
      }
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

let schemaInitialized = false;
async function ensureDatabaseSchema() {
  if (schemaInitialized) return;
  await executeNeonSql(`
    CREATE TABLE IF NOT EXISTS autocue_documents (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT 'Untitled Script',
      author TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL DEFAULT '',
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL
    );
  `);
  await executeNeonSql(`
    ALTER TABLE autocue_documents ADD COLUMN IF NOT EXISTS author TEXT NOT NULL DEFAULT '';
  `);
  await executeNeonSql(`
    CREATE INDEX IF NOT EXISTS idx_autocue_documents_updated_at
    ON autocue_documents (updated_at DESC);
  `);
  await executeNeonSql(`
    CREATE TABLE IF NOT EXISTS autocue_settings (
      id TEXT PRIMARY KEY,
      active_doc_id TEXT,
      speed INTEGER NOT NULL DEFAULT 28,
      font_size INTEGER NOT NULL DEFAULT 56,
      width_percent INTEGER NOT NULL DEFAULT 72,
      mirror_x BOOLEAN NOT NULL DEFAULT FALSE,
      mirror_y BOOLEAN NOT NULL DEFAULT FALSE,
      shade_enabled BOOLEAN NOT NULL DEFAULT TRUE,
      shade_opacity INTEGER NOT NULL DEFAULT 78,
      shade_top_percent DOUBLE PRECISION NOT NULL DEFAULT 34,
      updated_at BIGINT NOT NULL
    );
  `);
  schemaInitialized = true;
}

function readJsonBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        resolve({});
      }
    });
  });
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(payload));
}

async function handleApi(req, res, pathname, searchParams) {
  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {});
    return;
  }

  try {
    await ensureDatabaseSchema();

    // GET /api/docs — Fetch all documents + studio settings from Neon DB
    if (pathname === '/api/docs' && req.method === 'GET') {
      const [docsRes, settingsRes] = await Promise.all([
        executeNeonSql(
          'SELECT id, title, author, content, created_at, updated_at FROM autocue_documents ORDER BY updated_at DESC;'
        ),
        executeNeonSql('SELECT * FROM autocue_settings WHERE id = $1;', ['global'])
      ]);

      const docs = (docsRes.rows || []).map((r) => ({
        id: String(r.id),
        title: String(r.title || 'Untitled Script'),
        author: String(r.author || ''),
        content: String(r.content || ''),
        createdAt: Number(r.created_at),
        updatedAt: Number(r.updated_at)
      }));

      const sRow = (settingsRes.rows || [])[0] || null;
      const settings = sRow
        ? {
            activeDocId: sRow.active_doc_id,
            speed: Number(sRow.speed),
            fontSize: Number(sRow.font_size),
            widthPercent: Number(sRow.width_percent),
            mirrorX: Boolean(sRow.mirror_x),
            mirrorY: Boolean(sRow.mirror_y),
            shadeEnabled: Boolean(sRow.shade_enabled),
            shadeOpacity: Number(sRow.shade_opacity),
            shadeTopPercent: Number(sRow.shade_top_percent),
            updatedAt: Number(sRow.updated_at)
          }
        : null;

      sendJson(res, 200, { ok: true, docs, settings });
      return;
    }

    // POST /api/docs — Create or Upsert a document in Neon DB
    if (pathname === '/api/docs' && (req.method === 'POST' || req.method === 'PUT')) {
      const body = await readJsonBody(req);
      const id = String(body.id || 'doc-' + Date.now());
      const title = String(body.title ?? 'Untitled Script');
      const author = String(body.author ?? '');
      const content = String(body.content ?? '');
      const now = Date.now();
      const createdAt = Number(body.createdAt) || now;
      const updatedAt = Number(body.updatedAt) || now;

      await executeNeonSql(
        `INSERT INTO autocue_documents (id, title, author, content, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO UPDATE SET
           title = EXCLUDED.title,
           author = EXCLUDED.author,
           content = EXCLUDED.content,
           updated_at = EXCLUDED.updated_at;`,
        [id, title, author, content, createdAt, updatedAt]
      );

      sendJson(res, 200, {
        ok: true,
        doc: { id, title, author, content, createdAt, updatedAt }
      });
      return;
    }

    // DELETE /api/docs?id=... — Delete a document from Neon DB
    if (pathname === '/api/docs' && req.method === 'DELETE') {
      const id = searchParams.get('id');
      if (!id) {
        sendJson(res, 400, { ok: false, error: 'Missing document id' });
        return;
      }
      await executeNeonSql('DELETE FROM autocue_documents WHERE id = $1;', [id]);
      sendJson(res, 200, { ok: true, deletedId: id });
      return;
    }

    // POST /api/settings — Save studio settings in Neon DB
    if (pathname === '/api/settings' && (req.method === 'POST' || req.method === 'PUT')) {
      const body = await readJsonBody(req);
      const now = Date.now();
      await executeNeonSql(
        `INSERT INTO autocue_settings (
           id, active_doc_id, speed, font_size, width_percent,
           mirror_x, mirror_y, shade_enabled, shade_opacity, shade_top_percent, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (id) DO UPDATE SET
           active_doc_id = EXCLUDED.active_doc_id,
           speed = EXCLUDED.speed,
           font_size = EXCLUDED.font_size,
           width_percent = EXCLUDED.width_percent,
           mirror_x = EXCLUDED.mirror_x,
           mirror_y = EXCLUDED.mirror_y,
           shade_enabled = EXCLUDED.shade_enabled,
           shade_opacity = EXCLUDED.shade_opacity,
           shade_top_percent = EXCLUDED.shade_top_percent,
           updated_at = EXCLUDED.updated_at;`,
        [
          'global',
          body.activeDocId || null,
          Number(body.speed) || 28,
          Number(body.fontSize) || 56,
          Number(body.widthPercent) || 72,
          Boolean(body.mirrorX),
          Boolean(body.mirrorY),
          body.shadeEnabled !== undefined ? Boolean(body.shadeEnabled) : true,
          Number(body.shadeOpacity) || 78,
          Number(body.shadeTopPercent) || 34,
          now
        ]
      );
      sendJson(res, 200, { ok: true, updatedAt: now });
      return;
    }

    sendJson(res, 404, { ok: false, error: 'Unknown API endpoint' });
  } catch (err) {
    sendJson(res, 502, { ok: false, error: err.message });
  }
}

const server = http.createServer((req, res) => {
  const reqUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (reqUrl.pathname.startsWith('/api/')) {
    handleApi(req, res, reqUrl.pathname, reqUrl.searchParams);
    return;
  }

  let safePath = path.normalize(decodeURIComponent(reqUrl.pathname)).replace(/^(\.\.[/\\])+/, '');
  if (safePath === '/' || safePath === '\\') {
    safePath = '/index.html';
  }

  const filePath = path.join(__dirname, safePath);
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache'
    });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Beyond Headlines // Autocue server running on http://localhost:${PORT} (Neon DB connected)`);
});
