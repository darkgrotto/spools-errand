# Spool's Errand

A local-only piano-roll catalog. Spool's Errand ingests metadata from the
[IAMMP MIDI archive](https://archive.org/details/pianorollmusic.com-midifiles)
and the Reproducing Piano Roll Foundation (RPRF) catalog PDFs into a SQLite
database, exposes a small read-only REST API for searching and looking up
rolls, and ships a single-page React frontend for managing your personal
collection in browser `localStorage`.

The reference catalog (≈15,000 rolls) lives on disk; your own collection lives
in your browser. Nothing is sent anywhere — the server binds to `127.0.0.1`
by default.

---

## Requirements

- **Node.js 18+** (`brew install node` on macOS)
- macOS, Linux, or Windows. The shell scripts assume `bash` + `zsh`-style
  paths; everything works on Windows via WSL or by running the `npm` /
  `node` commands directly.

---

## Quick start

```bash
chmod +x start.sh ingest.sh
./start.sh
```

That single command will:

1. `npm install` if `node_modules/` is missing.
2. Create `data/catalog.db` (empty schema) if it doesn't exist.
3. Start the HTTPS server on `https://127.0.0.1:7843`.

Open the URL in a browser. Because the cert is self-signed, you'll need to
accept the browser's security warning the first time. If you'd rather skip
HTTPS entirely, see [Configuration](#configuration) below.

A freshly-initialised database has zero rolls. The frontend still works (it
stores your collection in `localStorage`), but the **Lookup** and **Suggest**
features need the catalog populated — see the next section.

---

## Populating the catalog

The ingestion pipeline reads from `data/sources/`. Place the source archives
there, then run the ingest. Files are not included in the repo — they're
mirrored from public archives.

### 1. Download sources

Put these into `data/sources/` (any subset is fine; the pipeline skips what's
missing):

| File                          | Source                                                              |
| ----------------------------- | ------------------------------------------------------------------- |
| `ampico_catalog.pdf`          | RPRF Ampico catalog                                                 |
| `duoart_catalog.pdf`          | RPRF Duo-Art catalog                                                |
| `welte_catalog.pdf`           | RPRF Welte-Mignon catalog                                           |
| `qrs_catalog.pdf`             | QRS Music product catalog (includes "Resurrected" Duo-Art/Ampico/Welte reissues) |
| `midi-files_*.zip`            | IAMMP archive ZIPs (Stahnke/Keystone/Trachtman/etc.)                |

Browse the IAMMP archive at
<https://archive.org/details/pianorollmusic.com-midifiles>.

### 2. Run ingestion

```bash
./ingest.sh           # all pipelines
# or one at a time:
npm run ingest:iammp
npm run ingest:rprf
npm run ingest:qrs
```

Ingestion is idempotent — rows are deduped on `(manufacturer, roll_number,
title)` via `INSERT OR IGNORE`, so re-running is safe.

### 3. View stats

```bash
npm run stats
```

Prints totals by source, top manufacturers, and roll-type counts.

---

## Using the frontend

Open `https://127.0.0.1:7843/` (or whatever port you bound to).

The page is your personal collection. Everything you enter is stored in
`localStorage` under the key `spoolsErrandCollection` — clearing your
browser data will erase your collection, so export/back up periodically.

### Adding a roll

1. Click **Add Roll** to open the form.
2. Fill in **Manufacturer** and **Roll Number**, then click **Lookup**. The
   server returns any matching catalog entries and offers to pre-fill title,
   composer, artist, year, and roll type.
3. While you type into the **Title** field, the page also calls
   `/api/search` for live suggestions — click one to pre-fill the rest.
4. Save. The roll is appended to your local collection. Duplicates are
   flagged before save.

### Search / filter / sort

The collection view has:
- A free-text search (matches title, artist, composer, manufacturer, roll
  number, notes).
- Filter chips for manufacturer, roll type, extended-play, and word-roll.
- Sortable columns (title, manufacturer, roll number, year, condition).

### Backend status indicator

A small badge in the header reports whether the API is reachable and the
total catalog count. If it shows "disconnected," the page still works for
managing your saved rolls — only Lookup/Suggest go dark.

---

## API reference

All endpoints are JSON over HTTPS (or HTTP if you toggle off TLS). Defaults
to `https://127.0.0.1:7843/api`. CORS is enabled for any origin.

### `GET /api/health`

```json
{ "status": "ok", "rollCount": 14954 }
```

### `GET /api/search`

| Param           | Type   | Notes                                              |
| --------------- | ------ | -------------------------------------------------- |
| `q`             | string | Required, min 2 chars. Whitespace-tokenised.       |
| `manufacturer`  | string | Optional exact-match filter.                       |
| `rollType`      | string | Optional exact-match filter.                       |
| `limit`         | int    | Default 50, max 200.                               |

Uses SQLite FTS5 with prefix tokens (`foo*`) ordered by rank. Returns:

```json
{
  "count": 2,
  "results": [
    { "manufacturer": "Ampico", "rollNumber": "5004", "title": "Ballade No. l, Op. 23, g",
      "composer": "Chopin", "artist": "Ferruccio Busoni", "year": null,
      "catalogSeries": null, "rollType": "Ampico",
      "extendedPlay": false, "wordRoll": false, "source": "RPRF" }
  ]
}
```

FTS parse errors fail soft (empty result, no 500).

### `GET /api/lookup`

| Param          | Type   | Notes                       |
| -------------- | ------ | --------------------------- |
| `manufacturer` | string | Required. Case-insensitive. |
| `rollNumber`   | string | Required. Case-insensitive. |

```json
{ "found": true, "results": [ { ...same row shape as /search... } ] }
```

Returns `400` if either param is missing. Returns up to 5 matches.

### `GET /api/manufacturers`

```json
{ "manufacturers": [ { "manufacturer": "Ampico", "count": 3885 }, ... ] }
```

### `GET /api/roll-types`

```json
{ "rollTypes": [ { "roll_type": "Standard 88-note", "count": 5672 }, ... ] }
```

### `GET /api/stats`

```json
{
  "totalRolls": 14954,
  "bySource": [ { "source": "IAMMP", "count": 7458 }, ... ],
  "recentIngestions": [ { "id": 9, "source": "IAMMP", "started_at": "...",
                          "finished_at": "...", "rolls_added": 7458,
                          "rolls_skipped": 363, "notes": "..." } ]
}
```

---

## Configuration

`config.json` at the repo root:

```json
{
  "server":   { "port": 7843, "host": "127.0.0.1", "https": true,
                "cert": "./certs/server.crt", "key": "./certs/server.key" },
  "database": { "path": "./data/catalog.db" },
  "sources":  { "directory": "./data/sources" }
}
```

### Switching off HTTPS

Edit `config.json` and set `"https": false`. The server will bind plain HTTP
on the same port.

### Overriding port / host at runtime

```bash
./start.sh 8080            # positional
./start.sh -p 8080         # short flag
./start.sh --port 8080     # long flag
PORT=8080 ./start.sh       # env var
HOST=0.0.0.0 ./start.sh    # bind on all interfaces (use with care)
```

CLI args win over environment variables, which win over `config.json`.

### Regenerating the self-signed cert

```bash
./add-https.sh             # force-regenerate cert + key in certs/
```

`start.sh` auto-generates the cert pair on first run if either file is
missing, so you don't normally need to run this. On macOS, the printed
`security add-trusted-cert` command installs it into the System keychain
to silence browser warnings.

---

## Project layout

```
src/
  server.js              # Express entry point, HTTPS/HTTP bootstrap
  db.js                  # better-sqlite3 connection, schema, insertRoll()
  routes/
    search.js            # /api/search
    lookup.js            # /api/lookup
    meta.js              # /api/manufacturers, /api/roll-types, /api/stats

ingest/
  ingest-iammp.js        # walks data/sources/midi-files_*.zip
  ingest-rprf.js         # reads data/sources/{ampico,duoart,welte}_catalog.pdf
  ingest-qrs.js          # reads data/sources/qrs_catalog.pdf
  run-all.js             # all pipelines (called by ingest.sh)
  parsers/
    iammp-meta.js        # parses .txt filenames + event content
    rprf-pdf.js          # heuristic line parser for RPRF catalog PDFs
    qrs-pdf.js           # section-aware parser for the QRS catalog

scripts/
  init-db.js             # create schema (idempotent)
  stats.js               # print catalog counts
  clean-and-reingest.js  # delete RPRF + IAMMP NonPDfiles rows
  fix-existing-rolls.js  # patch historical manufacturer rows + rebuild FTS

public/
  index.html             # SPA shell, loads React/Tailwind from CDN
  app.js                 # built frontend (copied from app-source.js)

app-source.js            # source of truth for the frontend (edit here)
setup-frontend.js        # copies app-source.js → public/app.js

config.json              # server / database / sources config
start.sh                 # install deps if needed, then start
ingest.sh                # wrapper for `npm run ingest`
```

### Data model

```
rolls(id, manufacturer, roll_number, title, artist, composer, year,
      catalog_series, roll_type, extended_play, word_roll,
      source, source_ref, created_at)
    UNIQUE(manufacturer, roll_number, title)

rolls_fts (FTS5 virtual table, kept in sync via AFTER INSERT/DELETE/UPDATE triggers)

ingestion_log(id, source, started_at, finished_at,
              rolls_added, rolls_skipped, notes)
```

---

## Editing the frontend

The frontend has **no build step** — React/ReactDOM/Babel/Tailwind are
loaded from CDN and Babel transpiles JSX in the browser.

1. Edit `app-source.js` (the canonical source).
2. Run `node setup-frontend.js` to copy it into `public/app.js`.
3. Reload the page (hard-reload or open in a new tab to bypass cache).

The older `scripts/write-frontend.js` contains an inlined string version of
the same app; prefer `app-source.js`.

---

## Maintenance commands

| Command                                       | What it does                                                                |
| --------------------------------------------- | --------------------------------------------------------------------------- |
| `./start.sh [PORT]`                           | Install deps if needed, start the server.                                   |
| `./ingest.sh`                                 | Run both ingestion pipelines.                                               |
| `npm run ingest:iammp`                        | IAMMP ZIPs only.                                                            |
| `npm run ingest:rprf`                         | RPRF PDFs only.                                                             |
| `npm run ingest:qrs`                          | QRS catalog PDF only.                                                       |
| `npm run init-db`                             | Create schema (safe to re-run).                                             |
| `npm run stats`                               | Print catalog counts by source / mfg / type.                                |
| `node scripts/clean-and-reingest.js`          | Delete RPRF rows and IAMMP `NonPDfiles/*` rows before a re-ingest.          |
| `node scripts/fix-existing-rolls.js`          | Patch historical mfg misclassifications and rebuild the FTS index.          |
| `node setup-frontend.js`                      | Copy `app-source.js` → `public/app.js`.                                     |

### Full rebuild from sources

```bash
node -e "require('./src/db').db.prepare('DELETE FROM rolls').run()"
./ingest.sh
```

---

## Troubleshooting

**Browser refuses to load the page over HTTPS.**
The cert is self-signed. Accept the warning, or set `"https": false` in
`config.json` and use plain HTTP.

**`EADDRINUSE` on startup.**
Port 7843 is taken. Pick another: `./start.sh 8080`.

**`/api/health` returns `rollCount: 0`.**
You haven't ingested any sources yet — see
[Populating the catalog](#populating-the-catalog).

**Lookup says "No matches found" for a roll you can see in the catalog.**
`/api/lookup` is exact-match (case-insensitive) on both manufacturer and roll
number. Use `/api/search` (or the in-form Suggest) for fuzzy matches.

**Stale data after editing a parser.**
Ingestion uses `INSERT OR IGNORE`, so old rows persist. Either delete the
affected rows (see `clean-and-reingest.js`) or wipe `data/catalog.db` and
re-ingest from scratch.

---

## Attribution & sources

Spool's Errand is a non-commercial cataloging aid for piano-roll collectors.
It does not reproduce the rolls themselves — only the bibliographic metadata
(roll number, title, composer, performer, year) needed to identify them.

The four catalog PDFs that ship in `data/sources/` are included here so the
ingest pipeline is reproducible from a clean clone. They were obtained from
the following sources:

- **`ampico_catalog.pdf`**, **`duoart_catalog.pdf`**, **`welte_catalog.pdf`** —
  Reproducing Piano Roll Foundation (RPRF) <https://rprf.org/>. The RPRF
  catalogs are themselves derived from the published rollographies of
  Elaine Obenchain (*The Complete Catalog of Ampico Reproducing Piano
  Rolls*), Charles Davis Smith (*Duo-Art Piano Music: A Classified Catalog
  of Recorded Rolls*), and Richard J. Howe (Welte-Mignon rollography).
- **`qrs_catalog.pdf`** — QRS Music Technologies, Inc. <https://qrsmusic.com/>.
  Current product catalog, which also documents the "Resurrected" Duo-Art,
  Ampico, and Welte reissues QRS produces from restored master rolls.

The IAMMP ZIP archives (`midi-files_*.zip`, `other-files_*.zip`) are **not**
included in the repository — they are large and freely downloadable from the
International Association of Mechanical Music Preservationists' mirror on the
Internet Archive: <https://archive.org/details/pianorollmusic.com-midifiles>.
Credit for the MIDI scans goes to the named contributors in each ZIP
(Stahnke, Keystone, Trachtman, Cullen, Dyer, Jose, Swanson, Perry, Smythe,
and others).

Additional bibliographic grounding came from the Stanford University Condon
Collection of player-piano rolls.

### Takedown requests

If you are a rights-holder (RPRF, QRS, an IAMMP contributor, an author of one
of the source rollographies, or anyone else with a legitimate claim to
content stored in this repository) and you would like material removed,
please open an issue or email the maintainer listed in `package.json`.
**Takedown requests will be honored** — the goal of this project is to help
collectors find and identify rolls, not to redistribute anyone's work
without consent.
