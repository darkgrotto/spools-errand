const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const config = require('../config.json');

const dbPath = path.resolve(__dirname, '..', config.database.path);
const dbDir = path.dirname(dbPath);

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS rolls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      manufacturer TEXT NOT NULL,
      roll_number TEXT NOT NULL,
      title TEXT NOT NULL,
      artist TEXT,
      composer TEXT,
      year TEXT,
      catalog_series TEXT,
      roll_type TEXT,
      extended_play INTEGER DEFAULT 0,
      word_roll INTEGER DEFAULT 0,
      source TEXT NOT NULL,
      source_ref TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(manufacturer, roll_number, title)
    );

    CREATE INDEX IF NOT EXISTS idx_rolls_manufacturer ON rolls(manufacturer);
    CREATE INDEX IF NOT EXISTS idx_rolls_roll_number ON rolls(roll_number);
    CREATE INDEX IF NOT EXISTS idx_rolls_title ON rolls(title);
    CREATE INDEX IF NOT EXISTS idx_rolls_composer ON rolls(composer);
    CREATE INDEX IF NOT EXISTS idx_rolls_artist ON rolls(artist);
    CREATE INDEX IF NOT EXISTS idx_rolls_mfg_num ON rolls(manufacturer, roll_number);

    CREATE VIRTUAL TABLE IF NOT EXISTS rolls_fts USING fts5(
      manufacturer, roll_number, title, artist, composer, catalog_series,
      content='rolls', content_rowid='id'
    );

    CREATE TRIGGER IF NOT EXISTS rolls_ai AFTER INSERT ON rolls BEGIN
      INSERT INTO rolls_fts(rowid, manufacturer, roll_number, title, artist, composer, catalog_series)
      VALUES (new.id, new.manufacturer, new.roll_number, new.title, new.artist, new.composer, new.catalog_series);
    END;

    CREATE TRIGGER IF NOT EXISTS rolls_ad AFTER DELETE ON rolls BEGIN
      INSERT INTO rolls_fts(rolls_fts, rowid, manufacturer, roll_number, title, artist, composer, catalog_series)
      VALUES('delete', old.id, old.manufacturer, old.roll_number, old.title, old.artist, old.composer, old.catalog_series);
    END;

    CREATE TRIGGER IF NOT EXISTS rolls_au AFTER UPDATE ON rolls BEGIN
      INSERT INTO rolls_fts(rolls_fts, rowid, manufacturer, roll_number, title, artist, composer, catalog_series)
      VALUES('delete', old.id, old.manufacturer, old.roll_number, old.title, old.artist, old.composer, old.catalog_series);
      INSERT INTO rolls_fts(rowid, manufacturer, roll_number, title, artist, composer, catalog_series)
      VALUES (new.id, new.manufacturer, new.roll_number, new.title, new.artist, new.composer, new.catalog_series);
    END;

    CREATE TABLE IF NOT EXISTS ingestion_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      started_at TEXT DEFAULT CURRENT_TIMESTAMP,
      finished_at TEXT,
      rolls_added INTEGER DEFAULT 0,
      rolls_skipped INTEGER DEFAULT 0,
      notes TEXT
    );
  `);
}

function insertRoll(roll) {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO rolls
    (manufacturer, roll_number, title, artist, composer, year, catalog_series,
     roll_type, extended_play, word_roll, source, source_ref)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    roll.manufacturer || '',
    roll.rollNumber || '',
    roll.title || '',
    roll.artist || null,
    roll.composer || null,
    roll.year || null,
    roll.catalogSeries || null,
    roll.rollType || null,
    roll.extendedPlay ? 1 : 0,
    roll.wordRoll ? 1 : 0,
    roll.source,
    roll.sourceRef || null
  );
  return result.changes > 0;
}

function logIngestion(source, rollsAdded, rollsSkipped, notes) {
  db.prepare(`
    INSERT INTO ingestion_log (source, finished_at, rolls_added, rolls_skipped, notes)
    VALUES (?, CURRENT_TIMESTAMP, ?, ?, ?)
  `).run(source, rollsAdded, rollsSkipped, notes || '');
}

module.exports = { db, initSchema, insertRoll, logIngestion };
