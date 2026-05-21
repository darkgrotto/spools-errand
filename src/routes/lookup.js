const express = require('express');
const { db } = require('../db');
const router = express.Router();

router.get('/lookup', (req, res) => {
  const { manufacturer, rollNumber } = req.query;

  if (!manufacturer || !rollNumber) {
    return res.status(400).json({ error: 'manufacturer and rollNumber are required' });
  }

  const stmt = db.prepare(`
    SELECT * FROM rolls
    WHERE LOWER(manufacturer) = LOWER(?) AND LOWER(roll_number) = LOWER(?)
    LIMIT 5
  `);
  const rows = stmt.all(manufacturer.trim(), rollNumber.trim());

  if (rows.length === 0) {
    return res.json({ found: false, results: [] });
  }

  res.json({
    found: true,
    results: rows.map(r => ({
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
    }))
  });
});

module.exports = router;
