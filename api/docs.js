/**
 * Vercel Serverless Function: /api/docs
 * Handles GET (list documents + studio settings), POST/PUT (upsert document), DELETE (delete document)
 */

const {
  executeNeonSql,
  ensureDatabaseSchema,
  readJsonBody,
  setCorsHeaders
} = require('./_neon');

module.exports = async function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  try {
    await ensureDatabaseSchema();

    // GET /api/docs — Fetch all documents + studio settings from Neon DB
    if (req.method === 'GET') {
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

      return res.status(200).json({ ok: true, docs, settings });
    }

    // POST / PUT /api/docs — Create or Upsert a document in Neon DB
    if (req.method === 'POST' || req.method === 'PUT') {
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

      return res.status(200).json({
        ok: true,
        doc: { id, title, author, content, createdAt, updatedAt }
      });
    }

    // DELETE /api/docs?id=... — Delete a document from Neon DB
    if (req.method === 'DELETE') {
      const id =
        (req.query && req.query.id) ||
        new URL(req.url, `http://${req.headers.host || 'localhost'}`).searchParams.get('id');

      if (!id) {
        return res.status(400).json({ ok: false, error: 'Missing document id' });
      }

      await executeNeonSql('DELETE FROM autocue_documents WHERE id = $1;', [String(id)]);
      return res.status(200).json({ ok: true, deletedId: String(id) });
    }

    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  } catch (err) {
    return res.status(502).json({ ok: false, error: err.message });
  }
};
