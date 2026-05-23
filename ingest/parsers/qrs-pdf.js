// Parses the QRS Music piano-roll catalog PDF (qrs_catalog.pdf).
//
// The catalog is divided into several sections, each with its own row format:
//
//   Pages 53-84   QRS own rolls (alphabetical, mixed prefix codes)
//   Pages 86-111  "Resurrected" Duo-Art (Popular)   — title + arranger
//   Pages 114-147 "Resurrected" Duo-Art (Classical) — title + composer + performer
//   Pages 148-175 Ampico (Popular + Classical)      — title + "Lastname, Firstname"
//   Page  176     Welte                              — title + composer;performer
//
// The "Resurrected" sections are modern QRS reissues of historical reproducing-piano
// rolls. They get distinct manufacturer values (e.g. `QRS Resurrected (Duo-Art)`)
// so they don't collide with the original Pierce/RPRF catalog entries.

'use strict';

const SECTIONS = [
  { from: 53,  to: 84,  parse: parseQrsOwnSection,                manufacturer: 'QRS' },
  { from: 86,  to: 111, parse: parseResurrectedArranger,          manufacturer: 'QRS Resurrected (Duo-Art)',      rollType: 'Duo-Art' },
  { from: 114, to: 147, parse: parseResurrectedComposerPerformer, manufacturer: 'QRS Resurrected (Duo-Art)',      rollType: 'Duo-Art' },
  { from: 148, to: 175, parse: parseResurrectedAmpico,            manufacturer: 'QRS Resurrected (Ampico)',       rollType: 'Ampico' },
  { from: 176, to: 176, parse: parseResurrectedWelte,             manufacturer: 'QRS Resurrected (Welte-Mignon)', rollType: 'Welte-Mignon' },
];

function parseQrsCatalog(text) {
  const pages = splitByPage(stripFooters(text));
  const out = [];
  for (const page of pages) {
    const section = SECTIONS.find(s => page.pageNum >= s.from && page.pageNum <= s.to);
    if (!section) continue;
    for (const r of section.parse(page.body, section)) out.push(r);
  }
  return out;
}

// Remove the per-page "To Order: ..." advertising footer that pdf-parse emits on every page.
function stripFooters(text) {
  return text
    .split('\n')
    .filter(l => !/^\s*To Order:\s+1-800/.test(l))
    .join('\n');
}

// Split the catalog into per-page blocks using "Pg N" markers as anchors.
function splitByPage(text) {
  const anchors = [];
  for (const m of text.matchAll(/Pg\s+(\d+)\b/g)) {
    anchors.push({ pageNum: parseInt(m[1], 10), headerEnd: m.index + m[0].length, start: m.index });
  }
  return anchors.map((cur, i) => ({
    pageNum: cur.pageNum,
    body: text.slice(cur.headerEnd, anchors[i + 1] ? anchors[i + 1].start : text.length),
  }));
}

// ---------- QRS own section ----------

// Lines that aren't roll data but appear on QRS-section pages:
//   - letter section dividers like "X - Y" or "Y - Z"
//   - biographical sidebars (long, lowercase-heavy paragraphs)
// Skip them during title accumulation so they don't get appended to the
// preceding roll's title.
function looksLikeQrsNoise(line) {
  if (/^[A-Z]\s*-\s*[A-Z]$/.test(line)) return true;
  if (line.length > 50 && !/^\d+\./.test(line)) {
    let upper = 0, lower = 0;
    for (const ch of line) {
      if (ch >= 'A' && ch <= 'Z') upper++;
      else if (ch >= 'a' && ch <= 'z') lower++;
    }
    if (lower > upper) return true;
  }
  return false;
}

function parseQrsOwnSection(body, section) {
  const lines = body.split('\n').map(l => l.trim()).filter(Boolean);
  const out = [];
  let current = null;

  const flush = () => {
    if (!current) return;
    const titleRaw = current.titleParts.join(' ').replace(/\s+/g, ' ').trim();
    if (titleRaw) {
      const { title, composer, performer } = extractQrsTrailers(titleRaw);
      out.push({
        manufacturer: section.manufacturer,
        rollNumber: current.rollNumber,
        title,
        composer,
        artist: performer,
        rollType: current.rollType,
        extendedPlay: current.extendedPlay,
        wordRoll: false,
      });
    }
    current = null;
  };

  for (const line of lines) {
    if (looksLikeQrsNoise(line)) continue;
    const m = matchQrsRollHeader(line);
    // If the current roll hasn't accumulated a title yet, treat the next line as
    // the title — even if it happens to start with digits (e.g. "1812 OVERTURE"
    // after a "C135" line should not be parsed as roll #1812).
    const stillAwaitingTitle = current && current.titleParts.length === 0;
    if (m && !stillAwaitingTitle) {
      flush();
      current = {
        rollNumber: m.rollNumber,
        rollType: m.rollType,
        extendedPlay: m.extendedPlay,
        titleParts: m.titleRest ? [m.titleRest] : [],
      };
    } else if (current) {
      // A continuation line that ends with "?" is virtually always an FAQ
      // heading (e.g. "1. SHOULD I TIGHTEN THE ROLL?") on a same-page sidebar;
      // real roll titles ending in "?" appear as the first line and are captured
      // by the roll-number match above, not as continuations.
      if (line.endsWith('?')) { flush(); continue; }
      // Cap accumulation at ~200 chars so a missed roll-number transition doesn't
      // let bio prose run on forever.
      const totalLen = current.titleParts.reduce((n, p) => n + p.length + 1, 0);
      if (totalLen < 200) current.titleParts.push(line);
    } else if (m) {
      current = {
        rollNumber: m.rollNumber,
        rollType: m.rollType,
        extendedPlay: m.extendedPlay,
        titleParts: m.titleRest ? [m.titleRest] : [],
      };
    }
  }
  flush();
  return out;
}

// Roll-number formats in the QRS section:
//   - Prefixed: XP123, Q123, CEL123, WF123, XMAS123, C123
//   - Unprefixed digit-only: 121, 1055, 9670, 10555 (3-5 digits)
// pdf-parse sometimes jams the title onto the same "line" as the roll number,
// so we have to split title from number even when there's no whitespace boundary.
function matchQrsRollHeader(line) {
  let m = line.match(/^(XP|CEL|WF|XMAS|Q|C)(\d{1,5})(.*)$/);
  if (m) {
    return {
      rollNumber: m[1] + m[2],
      rollType: m[1] === 'C' ? 'Classical' : 'Standard 88-note',
      extendedPlay: m[1] === 'XP',
      titleRest: m[3].trim(),
    };
  }
  for (let n = 5; n >= 3; n--) {
    const re = new RegExp(`^(\\d{${n}})(.*)$`);
    m = line.match(re);
    if (!m) continue;
    const rest = m[2];
    if (rest.length > 0 && /^\d/.test(rest) && !/^\d+\s+[A-Z]/.test(rest)) {
      continue;
    }
    return {
      rollNumber: m[1],
      rollType: 'Standard 88-note',
      extendedPlay: false,
      titleRest: rest.trim(),
    };
  }
  return null;
}

// Pull out trailing "(Played by NAME)" or "(Composer)" attribution from the joined title text.
function extractQrsTrailers(titleRaw) {
  let title = titleRaw;
  let composer = null;
  let performer = null;

  const playedBy = title.match(/^(.+?)\s*\(Played by\s+([^)]+)\)\s*$/i);
  if (playedBy) {
    title = playedBy[1].trim();
    performer = playedBy[2].trim();
  }

  const trailingParen = title.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  if (trailingParen && !performer) {
    const inner = trailingParen[2].trim();
    const looksLikeName = /^[A-Z][a-zA-Z\s\-’']*$/.test(inner);
    const isReference = /^(See|Theme|Waltz|Swing|From|Part|Pt\.|Vol|Op)/i.test(inner);
    if (looksLikeName && !isReference) {
      title = trailingParen[1].trim();
      composer = inner;
    }
  }

  title = title.replace(/\s+/g, ' ').replace(/,\s*$/, '').trim();
  return { title, composer, performer };
}

// ---------- Resurrected sections ----------

// Splits page text into per-roll chunks anchored on `R NNNNNN/NNNN`-style roll numbers.
// Caps each chunk and trims known marketing sentinels so trailing ad copy doesn't
// leak into the last roll on a section's final page.
const QRS_POLLUTANT_RE = /\b(PNOmation|QRS Music|The Best of Both Worlds|QRS\-?Track|Optical recording)\b/i;
function chunkByResurrectedRollNumber(body) {
  const anchors = [];
  for (const m of body.matchAll(/R\s\d+\/\d+/g)) {
    anchors.push({ rollNumber: m[0].replace(/\s+/g, ' '), start: m.index, end: m.index + m[0].length });
  }
  return anchors.map((cur, i) => {
    const end = anchors[i + 1] ? anchors[i + 1].start : body.length;
    let chunk = body.slice(cur.end, Math.min(end, cur.end + 250));
    const polluted = chunk.match(QRS_POLLUTANT_RE);
    if (polluted) chunk = chunk.slice(0, polluted.index);
    return { rollNumber: cur.rollNumber, body: chunk.trim() };
  });
}

// Popular Duo-Art: title + single trailing arranger (PascalCase word, possibly hyphenated).
function parseResurrectedArranger(body, section) {
  return chunkByResurrectedRollNumber(body)
    .filter(c => c.body)
    .map(c => {
      const merged = c.body.replace(/\s+/g, ' ').trim();
      let title = merged;
      let arranger = null;
      // Match a single PascalCase trailing token (possibly hyphenated, or joined with "&").
      const m = merged.match(/^(.+?)(?:\s|(?<=[a-z)]))([A-Z][a-zà-ÿ]+(?:-[A-Z][a-zà-ÿ]+)*(?:\s*&\s*[A-Z][a-zà-ÿ]+(?:-[A-Z][a-zà-ÿ]+)*)?)$/);
      if (m) {
        title = m[1].trim();
        arranger = m[2].trim();
      }
      return {
        manufacturer: section.manufacturer,
        rollNumber: c.rollNumber,
        title: cleanTitle(title),
        composer: null,
        artist: arranger,
        rollType: section.rollType,
        extendedPlay: false,
        wordRoll: false,
      };
    });
}

// Classical Duo-Art: title + composer + performer (two trailing PascalCase tokens, typically concatenated).
function parseResurrectedComposerPerformer(body, section) {
  return chunkByResurrectedRollNumber(body)
    .filter(c => c.body)
    .map(c => {
      const merged = c.body.replace(/\s+/g, ' ').trim();
      let title = merged;
      let composer = null;
      let performer = null;
      const m = merged.match(/^(.+?)(?:\s|(?<=[a-z)]))([A-Z][a-zà-ÿ]+)(?:\s|(?<=[a-z)]))?([A-Z][a-zà-ÿ]+)$/);
      if (m) {
        title = m[1].trim();
        composer = m[2].trim();
        performer = m[3].trim();
      } else {
        const m2 = merged.match(/^(.+?)(?:\s|(?<=[a-z)]))([A-Z][a-zà-ÿ]+)$/);
        if (m2) {
          title = m2[1].trim();
          composer = m2[2].trim();
        }
      }
      return {
        manufacturer: section.manufacturer,
        rollNumber: c.rollNumber,
        title: cleanTitle(title),
        composer,
        artist: performer,
        rollType: section.rollType,
        extendedPlay: false,
        wordRoll: false,
      };
    });
}

// Ampico Popular + Classical: title + trailing "Lastname, Firstname" (sometimes joined with " & ").
function parseResurrectedAmpico(body, section) {
  return chunkByResurrectedRollNumber(body)
    .filter(c => c.body)
    .map(c => {
      const merged = c.body.replace(/\s+/g, ' ').trim();
      let title = merged;
      let performer = null;
      // Trailing "Lastname, Firstname" — Firstname may be initials + middle name (e.g. "J. Milton")
      // and the whole thing may be joined with " & " to a second name.
      const namePart = '[A-Z][a-zà-ÿ\\.]+(?:\\s+[A-Z][a-zà-ÿ\\.]+){0,3}';
      const personRe = new RegExp(`[A-Z][a-zà-ÿ]+,\\s*${namePart}`);
      const re = new RegExp(`^(.+?)\\s*(${personRe.source}(?:\\s*&\\s*${personRe.source})?)\\s*$`);
      const m = merged.match(re);
      if (m) {
        title = m[1].trim();
        performer = m[2].replace(/\s+/g, ' ').trim();
      }
      return {
        manufacturer: section.manufacturer,
        rollNumber: c.rollNumber,
        title: cleanTitle(title),
        composer: null,
        artist: performer,
        rollType: section.rollType,
        extendedPlay: false,
        wordRoll: false,
      };
    });
}

// Welte: title + composer ; performer
function parseResurrectedWelte(body, section) {
  return chunkByResurrectedRollNumber(body)
    .filter(c => c.body)
    .map(c => {
      const merged = c.body.replace(/\s+/g, ' ').trim();
      let title = merged;
      let composer = null;
      let performer = null;
      const semi = merged.indexOf(';');
      if (semi !== -1) {
        const left = merged.slice(0, semi).trim();
        const rightRaw = merged.slice(semi + 1)
          .replace(/^[;\s]+/, '')
          .replace(/;/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        // Cap performer at up to 4 strictly PascalCase tokens — anything beyond is
        // biographical prose that pdf-parse leaked from the end of the Welte page.
        const tokens = rightRaw.split(/\s+/);
        const kept = [];
        for (const t of tokens) {
          if (kept.length >= 4) break;
          if (!/^[A-ZÀ-ÝÉ][a-zà-ÿ]*\.?$/.test(t)) break;
          kept.push(t);
        }
        performer = kept.join(' ') || null;
        const m = left.match(/^(.+?)\s*([A-Z][a-zà-ÿ]+(?:-[A-Z][a-zà-ÿ]+)*)$/);
        if (m) {
          title = m[1].trim();
          composer = m[2].replace(/\s+/g, ' ').trim();
        } else {
          title = left;
        }
      }
      return {
        manufacturer: section.manufacturer,
        rollNumber: c.rollNumber,
        title: cleanTitle(title),
        composer,
        artist: performer,
        rollType: section.rollType,
        extendedPlay: false,
        wordRoll: false,
      };
    });
}

function cleanTitle(s) {
  return s.replace(/\s+/g, ' ').replace(/[,;\s]+$/, '').trim();
}

module.exports = { parseQrsCatalog };
