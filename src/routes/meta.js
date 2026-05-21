const express = require('express');
const { db } = require('../db');
const router = express.Router();

router.get('/manufacturers', (req, res) => {
  const rows = db.prepare(`
    SELECT manufacturer, COUNT(*) as count
    FROM rolls
    GROUP BY manufacturer
    ORDER BY count DESC
  `).all();
  res.json({ manufacturers: rows });
});

router.get('/roll-types', (req, res) => {
  const rows = db.prepare(`
    SELECT roll_type, COUNT(*) as count
    FROM rolls
    WHERE roll_type IS NOT NULL
    GROUP BY roll_type
    ORDER BY count DESC
  `).all();
  res.json({ rollTypes: rows });
});

router.get('/stats', (req, res) => {
  const total = db.prepare('SELECT COUNT(*) as count FROM rolls').get().count;
  const bySource = db.prepare(`
    SELECT source, COUNT(*) as count
    FROM rolls
    GROUP BY source
  `).all();
  const ingestions = db.prepare(`
    SELECT * FROM ingestion_log ORDER BY started_at DESC LIMIT 10
  `).all();
  res.json({ totalRolls: total, bySource, recentIngestions: ingestions });
});

module.exports = router;
