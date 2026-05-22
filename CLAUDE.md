# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Spool's Errand** — a local-only Node service that exposes a read-only catalog of piano roll metadata (IAMMP archive + RPRF PDFs) ingested into SQLite, plus a single-page React frontend that lets the user manage their personal collection in browser `localStorage` and pre-fill from the catalog via `/api/lookup` and `/api/search`.

## Commands

- `./start.sh [PORT]` — install deps if needed, init DB if missing, run the server (`npm start`). Optional port override: `./start.sh 8080`, `./start.sh -p 8080`, or `PORT=8080 ./start.sh`. Falls back to `config.json`'s `server.port`.
- `./ingest.sh` — runs both ingestion pipelines against `data/sources/`.
- `npm run ingest:iammp` / `npm run ingest:rprf` — run a single pipeline.
- `npm run init-db` — create schema only (idempotent; safe to re-run).
- `npm run stats` — print catalog counts by source / manufacturer / roll type.
- `node setup-frontend.js` — **rebuild the served frontend** after editing `app-source.js` (copies it to `public/app.js`).
- `node scripts/clean-and-reingest.js` — delete RPRF rows + IAMMP `NonPDfiles/*` rows before re-ingesting (used when parser logic changes).
- `node scripts/fix-existing-rolls.js` — patches historical manufacturer misclassifications in place and rebuilds the FTS index.

There is no test suite.

## Architecture

**Server entry point: `src/server.js`.** Express app, HTTPS-or-HTTP based on `config.json`'s `server.https`. Mounts three route modules under `/api`, then `express.static('public')` plus a SPA fallback that serves `public/index.html` for any non-`/api/*` route.

**Persistence: `src/db.js`.** Single `better-sqlite3` connection in WAL mode against `data/catalog.db`. The schema is defined once in `initSchema()` (called by both server start and each ingest script). The key shape:

- `rolls` is keyed by `UNIQUE(manufacturer, roll_number, title)` — all inserts go through `insertRoll()` which uses `INSERT OR IGNORE`, so duplicates from re-ingestion are silently counted as "skipped".
- `rolls_fts` is an FTS5 virtual table mirrored from `rolls` via `AFTER INSERT/DELETE/UPDATE` triggers. The `/api/search` route queries it with prefix tokens (`"foo"*`) ordered by `rank`. If you bulk-edit `rolls` outside `insertRoll`, rebuild FTS with `INSERT INTO rolls_fts(rolls_fts) VALUES('rebuild')` (see `fix-existing-rolls.js`).
- `ingestion_log` is appended once per ingest run via `logIngestion()`.

**Ingestion pipelines (`ingest/`).** Two independent sources funnel into the same `insertRoll`:

- `ingest-iammp.js` walks `data/sources/midi-files_*.zip`, streams `.txt` entries out via `yauzl`, and hands each filename+content to `parsers/iammp-meta.js`. That parser does most of the work: pattern-matching filenames like `W150-Title_With_Underscores-13282-02` (QRS scanner format) vs `Manufacturer-RollNumber_TitleCamelCase(Year)_extras`, normalizing manufacturer aliases (`DuoArt` → `Duo-Art`, etc.), and inferring roll type. When changing the parser, expect to re-run `clean-and-reingest.js` first.
- `ingest-rprf.js` reads the three RPRF PDFs (Ampico/Duo-Art/Welte) via `pdf-parse`, then `parsers/rprf-pdf.js` heuristically splits each line into roll number, composer (all-caps prefix), composition, and performer (trailing capitalized words). Manufacturer/roll type are passed in from the file mapping in `ingest-rprf.js`.

**Frontend (`public/`).** A no-build React 18 SPA loaded via CDN `<script>` tags + Babel standalone in the browser (`index.html`). `app.js` is the runtime artifact; **the source of truth is `app-source.js` at the repo root** — edit there, then `node setup-frontend.js` to publish. (There's also an older `scripts/write-frontend.js` with the same content inlined as a string — prefer `app-source.js` + `setup-frontend.js`.) The user's personal collection lives entirely in `localStorage` under `spoolsErrandCollection`; the backend is purely a reference catalog used by Lookup/Suggest.

## Config & runtime gotchas

- `config.json` controls port (default 7843), host (`127.0.0.1`), and HTTPS toggle. HTTPS uses a self-signed cert in `certs/`. Both `certs/server.key` and `certs/server.crt` are gitignored; `start.sh` auto-generates the pair on first run using the tracked `certs/openssl.cnf` if either file is missing. `add-https.sh` is the force-regenerate helper (safe to re-run; prompts before overwriting). On macOS, the printed `security add-trusted-cert` command installs it into the System keychain.
- `data/sources/`, `data/catalog.db*`, and `node_modules/` are gitignored. Source PDFs/ZIPs are not in the repo; see `README.md` for download URLs.
