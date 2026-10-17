/**
 * Shared Neon Postgres SQL-over-HTTP helper for Vercel Serverless Functions
 */

const https = require('https');
const { URL } = require('url');

const NEON_CONNECTION_URI =
  process.env.NEON_DATABASE_URL ||
  process.env.DATABASE_URL ||
  'postgresql://neondb_owner:npg_p9zU8rnvPiaD@ep-withered-base-a1nixm16-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require';

const NEON_HOST = new URL(NEON_CONNECTION_URI).hostname;

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
  if (req.body && typeof req.body === 'object') {
    return Promise.resolve(req.body);
  }
  if (typeof req.body === 'string' && req.body.trim()) {
    try {
      return Promise.resolve(JSON.parse(req.body));
    } catch {
      return Promise.resolve({});
    }
  }
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

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = {
  executeNeonSql,
  ensureDatabaseSchema,
  readJsonBody,
  setCorsHeaders
};
