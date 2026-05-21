// Parses the RPRF catalog PDFs.

function parseRprfPdf(text, defaultManufacturer, defaultRollType) {
  const rolls = [];
  const lines = text.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    // Roll number is just digits — the original `[A-Z]?` suffix would eat the
    // first letter of the composer name in lines like "5004CHOPIN" (no space
    // between number and composer, as produced by pdf-parse).
    const lineMatch = line.match(/^(\d{3,6})\s*(.+)$/);
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
