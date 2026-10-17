/**
 * Vercel Serverless Function: /api/settings
 * Handles POST/PUT (save global studio settings in Neon DB)
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

  if (req.method !== 'POST' && req.method !== 'PUT') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    await ensureDatabaseSchema();
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

    return res.status(200).json({ ok: true, updatedAt: now });
  } catch (err) {
    return res.status(502).json({ ok: false, error: err.message });
  }
};
