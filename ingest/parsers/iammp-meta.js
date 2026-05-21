// Parses the .txt metadata files extracted from IAMMP MIDI archive.

function parseFilename(filename) {
  let base = filename.split(/[\/\\]/).pop();
  base = base.replace(/\.txt$/i, '').replace(/\.mid$/i, '');

  // Pattern 1: Scanner prefix (W150, WS123) with title in the middle and roll number at end.
  //   W150-Back_In_The_Saddle_Again-13282-02
  const scannerMatch = base.match(/^(W\d+|WS\d+)-(.+?)-(\d{3,6})(?:-\d{1,3})?$/);
  if (scannerMatch) {
    return {
      manufacturer: 'QRS',
      rollNumber: scannerMatch[3],
      titleHint: scannerMatch[2].replace(/_/g, ' ').trim(),
      catalogSeries: null,
      year: null
    };
  }

  // Pattern 4 (checked before Pattern 2): Title_UNK_(UNK|RollNum)_extras
  // Used when the manufacturer is unknown — the filename is just the song title
  // followed by placeholder tokens for mfg and roll number.
  //   BlueDanubeWaltz_UNK_UNK_eRollMIDIWexp
  //   AlabamyBound_UNK_X-5704_eRollMIDIWexp
  // Listed before Pattern 2 because Pattern 2's `[-_]` separator would otherwise
  // misinterpret the song title as the manufacturer.
  const unkMatch = base.match(
    /^([A-Za-z][A-Za-z0-9']*)_(?:UNK|UNKNOWN|Unknown|unknown)_(.+?)(?:_(?:eRoll|playback|punchMIDI|scanImage|PunchMIDI|ScanImage).*)?$/
  );
  if (unkMatch) {
    const rollStr = unkMatch[2];
    const rollIsUnk = /^(UNK|UNKNOWN|Unknown|unknown)$/.test(rollStr);
    return {
      manufacturer: '',
      rollNumber: rollIsUnk ? '' : rollStr,
      titleHint: decodeCamel(unkMatch[1]),
      catalogSeries: null,
      year: null
    };
  }

  // Pattern 2: Manufacturer[-_]RollNumber_TitleCamelCase(Year)_extras
  //   Ampico-210161_HeLovesAndSheLoves(1927)_eRollMIDIWexp
  //   Duo-Art_1702_GrievingForYou(1921)_eRollMIDIWexp   (mfg contains '-', so sep before rollnum is '_')
  //   88-64796_ComeJosephineInMyFlyingMachine_eRollMIDIWexp
  // RollNumber must contain a digit (optionally preceded by one letter), or be the
  // explicit unknown placeholder UNK/UNKNOWN. This prevents matching cases where the
  // segment after the manufacturer is a song-form word like "OneStep" or "Foxtrot"
  // (those fall through to Pattern 3).
  const mfgMatch = base.match(
    /^([A-Za-z0-9][A-Za-z0-9\-]*?)[-_]([A-Za-z]?\d[A-Za-z0-9]*|UNK|UNKNOWN|Unknown|unknown)_(.+?)(?:\((\d{4})\))?(?:_.+)?$/
  );
  if (mfgMatch) {
    const manufacturer = normalizeManufacturer(mfgMatch[1]);
    const rawRoll = mfgMatch[2];
    const rollNumber = /^(UNK|UNKNOWN|Unknown|unknown)$/.test(rawRoll) ? '' : rawRoll;
    const titleHint = mfgMatch[3];
    const isJunkTitle = /^(ScanImage|PunchMIDI|playback|eRoll)/i.test(titleHint);
    return {
      manufacturer,
      rollNumber,
      titleHint: isJunkTitle ? '' : decodeCamel(titleHint),
      catalogSeries: null,
      year: mfgMatch[4] || null
    };
  }

  // Pattern 3: Title-Form_Manufacturer-RollNumber(Year)_Performer
  //   ArabianNights-OneStep_Pianostyle-46893(1918)
  //   LaVeeda-Foxtrot_Rythmodik-Z106123(1920)_JoyceBrothers
  // The "form" word (OneStep, Foxtrot, Waltz, ...) is captured as catalogSeries.
  const titleFormMatch = base.match(
    /^([A-Za-z][A-Za-z0-9']*)-([A-Za-z][A-Za-z]*)_([A-Za-z][A-Za-z0-9]*)-([A-Za-z]?\d[A-Za-z0-9]*)(?:\((\d{4})\))?(?:_.+)?$/
  );
  if (titleFormMatch) {
    return {
      manufacturer: normalizeManufacturer(titleFormMatch[3]),
      rollNumber: titleFormMatch[4],
      titleHint: decodeCamel(titleFormMatch[1]),
      catalogSeries: titleFormMatch[2],
      year: titleFormMatch[5] || null
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
    '88note': 'Standard 88-note', '88': 'Standard 88-note',
    '65Note': 'Standard 65-note', '65note': 'Standard 65-note', '65': 'Standard 65-note',
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
  if (/65-note/i.test(manufacturer)) return 'Standard 65-note';
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
  const catalogSeries = fromContent.catalog || fromName.catalogSeries || null;
  if (!title) return [];
  return [{
    manufacturer,
    rollNumber: fromName.rollNumber || '',
    title,
    artist,
    composer,
    year,
    catalogSeries,
    rollType,
    extendedPlay: false,
    wordRoll: false
  }];
}

module.exports = { parseIammpMetadata, normalizeManufacturer, inferRollType };
