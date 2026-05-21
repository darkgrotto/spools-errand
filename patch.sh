#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

echo "Writing ingest/parsers/iammp-meta.js..."
cat > ingest/parsers/iammp-meta.js <<'PARSER_EOF'
// Parses the .txt metadata files extracted from IAMMP MIDI archive.

function parseFilename(filename) {
  const base = filename.split(/[\/\\]/).pop().replace(/\.txt$/i, '').replace(/\.mid$/i, '');

  // Pattern: Scanner-Title_With_Underscores-RollNumber-Take
  // Example: W150-Back_In_The_Saddle_Again-13282-02
  const scannerMatch = base.match(/^(W\d+|WS\d+)-(.+)-(\d+)(?:-\d+)?$/);
  if (scannerMatch) {
    return {
      manufacturer: 'QRS',
      rollNumber: scannerMatch[3],
      titleHint: scannerMatch[2].replace(/_/g, ' ').trim(),
      year: null
    };
  }

  // Pattern: Manufacturer-RollNumber_TitleCamelCase(Year)_extras
  const mfgMatch = base.match(/^([A-Za-z][A-Za-z0-9\-]*?)-(\S+?)_(.+?)(?:\((\d{4})\))?(?:_.+)?$/);
  if (mfgMatch) {
    const manufacturer = normalizeManufacturer(mfgMatch[1]);
    const titleHint = mfgMatch[3];
    const isJunkTitle = /^(ScanImage|PunchMIDI|playback|eRoll)/i.test(titleHint);
    return {
      manufacturer,
      rollNumber: mfgMatch[2],
      titleHint: isJunkTitle ? '' : decodeCamel(titleHint),
      year: mfgMatch[4] || null
    };
  }
  return null;
}

function decodeCamel(s) {
  return s
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .trim();
}

function normalizeManufacturer(mfg) {
  const map = {
    'DuoArt': 'Duo-Art', 'duoart': 'Duo-Art', 'Duo': 'Duo-Art', 'D': 'Duo-Art',
    'Ampico': 'Ampico', 'ampico': 'Ampico', 'A': 'Ampico',
    'QRS': 'QRS', 'qrs': 'QRS', 'Q': 'QRS',
    'Welte': 'Welte-Mignon', 'WelteMignon': 'Welte-Mignon',
    'WelteLicensee': 'Welte-Mignon (Licensee)', 'WL': 'Welte-Mignon (Licensee)',
    'W': 'Welte-Mignon',
    'Aeolian': 'Aeolian', 'Vocalstyle': 'Vocalstyle', 'Imperial': 'Imperial',
    'Connorized': 'Connorized', 'Rythmodik': 'Rythmodik',
    'USMusic': 'US Music Co.', 'US': 'US Music Co.', 'Universal': 'Universal',
    'DeLuxe': 'DeLuxe', 'Klavier': 'Klavier', 'Melodee': 'Melodee',
    'Supertone': 'Supertone', 'Atlas': 'Atlas', 'Pianostyle': 'Pianostyle',
    'Artrio': 'Artrio-Angelus', 'Recordo': 'Recordo'
  };
  return map[mfg] || mfg;
}

function inferRollType(manufacturer, filename) {
  if (filename && /eRollMIDIWexp|eRollWexp/i.test(filename)) {
    if (/Ampico/i.test(manufacturer)) return 'Ampico';
    if (/Duo-?Art/i.test(manufacturer)) return 'Duo-Art';
    if (/Welte/i.test(manufacturer)) return 'Welte-Mignon';
  }
  if (/Ampico/i.test(manufacturer)) return 'Ampico';
  if (/Duo-?Art/i.test(manufacturer)) return 'Duo-Art';
  if (/Welte/i.test(manufacturer)) return 'Welte-Mignon';
  return 'Standard 88-note';
}

function parseTextEvents(content) {
  const meta = {};
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^\s*(Title|Performer|Artist|Composer|Year|Catalog|Roll\s*Type|Manufacturer|Label)\s*[:=]\s*(.+?)\s*$/i);
    if (match) {
      const key = match[1].toLowerCase().replace(/\s+/g, '');
      meta[key] = match[2].trim();
    }
  }
  return meta;
}

function parseIammpMetadata(filename, content) {
  const fromName = parseFilename(filename);
  if (!fromName) return [];
  const fromContent = parseTextEvents(content);
  const title = fromContent.title || fromName.titleHint;
  const composer = fromContent.composer || null;
  const artist = fromContent.performer || fromContent.artist || null;
  const year = fromContent.year || fromName.year;
  const manufacturer = fromContent.manufacturer
    ? normalizeManufacturer(fromContent.manufacturer)
    : fromName.manufacturer;
  const rollType = fromContent.rolltype || inferRollType(manufacturer, filename);
  if (!title || !fromName.rollNumber) return [];
  return [{
    manufacturer, rollNumber: fromName.rollNumber, title, artist, composer, year,
    catalogSeries: fromContent.catalog || null, rollType,
    extendedPlay: false, wordRoll: false
  }];
}

module.exports = { parseIammpMetadata, normalizeManufacturer, inferRollType };
PARSER_EOF

echo "Writing ingest/parsers/rprf-pdf.js..."
cat > ingest/parsers/rprf-pdf.js <<'PARSER_EOF'
// Parses the RPRF catalog PDFs.

function parseRprfPdf(text, defaultManufacturer, defaultRollType) {
  const rolls = [];
  const lines = text.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const lineMatch = line.match(/^(\d{3,6}[A-Z]?)\s*(.+)$/);
    if (!lineMatch) continue;

    const rollNumber = lineMatch[1];
    let rest = lineMatch[2].trim();

    if (rollNumber.length === 3 && !/Welte/i.test(defaultManufacturer)) continue;

    const dashSplit = rest.split(/\s+-\s+/);
    let composer = null;
    let composition = rest;
    let performer = null;

    if (dashSplit.length >= 2) {
      const possibleComposer = dashSplit[0].trim();
      if (isAllCapsLike(possibleComposer)) {
        composer = toTitleCase(possibleComposer);
        composition = dashSplit.slice(1).join(' - ').trim();
      }
    }

    const performerMatch = composition.match(/^(.+?)\s{2,}([A-ZÀ-Ý][a-zà-ÿ]+(?:[\s.\-’'][A-Za-zà-ÿ.]+){0,4})\s*$/);
    if (performerMatch) {
      composition = performerMatch[1].trim();
      performer = performerMatch[2].trim();
    } else {
      const tailMatch = composition.match(/^(.+?)\s+((?:[A-ZÀ-Ý][a-zà-ÿ]+\.?\s*){2,4})$/);
      if (tailMatch) {
        const tailWords = tailMatch[2].trim();
        const lastWord = tailWords.split(/\s+/).pop();
        if (!/^(Op|No|Vol|Part|Pt|Mvt|fr|von|der|the|le|la|de|du)\.?$/i.test(lastWord)) {
          composition = tailMatch[1].trim();
          performer = tailWords;
        }
      }
    }

    if (composition.length < 3) continue;
    if (/^(page|chapter|catalog|section|index|copyright|table\s+of|edited\s+by|published)/i.test(composition)) continue;

    composition = composition.replace(/,\s*$/, '').replace(/\s+/g, ' ').trim();

    if (performer) {
      performer = performer.replace(/\s+/g, ' ').trim();
      performer = performer.replace(/^[\(\[]/, '').replace(/[\)\]]$/, '');
    }

    rolls.push({
      manufacturer: defaultManufacturer, rollNumber, title: composition,
      composer, artist: performer, rollType: defaultRollType,
      extendedPlay: false, wordRoll: false
    });
  }

  return rolls;
}

function isAllCapsLike(s) {
  const letters = s.replace(/[^A-Za-zÀ-ÿ]/g, '');
  if (letters.length < 2) return false;
  return letters === letters.toUpperCase();
}

function toTitleCase(s) {
  return s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

module.exports = { parseRprfPdf };
PARSER_EOF

echo "Writing scripts/clean-and-reingest.js..."
cat > scripts/clean-and-reingest.js <<'PARSER_EOF'
const { db } = require('../src/db');
console.log('Cleaning data from sources we will re-ingest...');
const deleted = db.prepare(`
  DELETE FROM rolls
  WHERE source = 'RPRF'
     OR source_ref LIKE 'NonPDfiles/%'
`).run();
console.log(`  Removed ${deleted.changes} rows`);
console.log('Done. Now run: ./ingest.sh');
PARSER_EOF

echo
echo "Verifying file contents..."
echo "  iammp-meta.js first line: $(head -1 ingest/parsers/iammp-meta.js)"
echo "  rprf-pdf.js first line:   $(head -1 ingest/parsers/rprf-pdf.js)"
echo "  clean-and-reingest.js first line: $(head -1 scripts/clean-and-reingest.js)"
echo
echo "If first lines start with '//' or 'const', files are good."
echo "Now run:"
echo "  node scripts/clean-and-reingest.js"
echo "  ./ingest.sh"
echo "  npm run stats"
