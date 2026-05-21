const express = require('express');
const { db } = require('../db');
const router = express.Router();

router.get('/search', (req, res) => {
  const { q, manufacturer, rollType, limit = 50 } = req.query;

  if (!q || q.trim().length < 2) {
    return res.json({ results: [], count: 0 });
  }

  const ftsQuery = q.trim().split(/\s+/)
    .map(t => t.replace(/[^\w]/g, ''))
    .filter(t => t.length > 0)
    .map(t => `"${t}"*`)
    .join(' ');

  const limitNum = Math.min(parseInt(limit) || 50, 200);
  let sql = `
    SELECT r.*
    FROM rolls r
    JOIN rolls_fts f ON r.id = f.rowid
    WHERE rolls_fts MATCH ?
  `;
  const params = [ftsQuery];

  if (manufacturer) {
    sql += ' AND r.manufacturer = ?';
    params.push(manufacturer);
  }
  if (rollType) {
    sql += ' AND r.roll_type = ?';
    params.push(rollType);
  }

  sql += ' ORDER BY rank LIMIT ?';
  params.push(limitNum);

  try {
    const results = db.prepare(sql).all(...params);
    res.json({ results: results.map(formatRoll), count: results.length });
  } catch (err) {
    res.json({ results: [], count: 0, error: 'Search query parse error' });
  }
});

function formatRoll(r) {
  return {
    manufacturer: r.manufacturer,
    rollNumber: r.roll_number,
    title: r.title,
    artist: r.artist,
    composer: r.composer,
    year: r.year,
    catalogSeries: r.catalog_series,
    rollType: r.roll_type,
    extendedPlay: !!r.extended_play,
    wordRoll: !!r.word_roll,
    source: r.source
  };
}

module.exports = router;
