#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

echo "Writing updated ingest/parsers/iammp-meta.js..."
cat > ingest/parsers/iammp-meta.js <<'PATCH_END'
// Parses the .txt metadata files extracted from IAMMP MIDI archive.

function parseFilename(filename) {
  // Strip directory and file extensions (.mid.txt, .txt, .mid)
  let base = filename.split(/[\/\\]/).pop();
  base = base.replace(/\.txt$/i, '').replace(/\.mid$/i, '');

  // Pattern 1: Scanner-Title_With_Underscores-RollNumber[-Take]
  // Examples:
  //   W150-Back_In_The_Saddle_Again-13282-02
  //   W150-(Why_Couldn't_It_Last)_Last_Night-13255-05
  //   W150-A_Quaker_Girl_Waltz-13174-7
  // The title can contain anything except hyphens followed by digits at the end.
  // We anchor the roll number as the LAST or SECOND-TO-LAST dash-separated numeric segment.
  const scannerMatch = base.match(/^(W\d+|WS\d+)-(.+?)-(\d{3,6})(?:-\d{1,3})?$/);
  if (scannerMatch) {
    return {
      manufacturer: 'QRS',
      rollNumber: scannerMatch[3],
      titleHint: scannerMatch[2].replace(/_/g, ' ').trim(),
      year: null
    };
  }

  // Pattern 2: Manufacturer-RollNumber_TitleCamelCase(Year)_extras
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
    'EightyEightNote': 'Standard 88-note', '88Note': 'Standard 88-note',
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
  if (/Duo-?Art/i.tes
