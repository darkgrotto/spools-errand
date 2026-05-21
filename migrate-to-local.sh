#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

echo "=== Migrating to self-hosted frontend ==="
echo

# Step 1: Update package.json to add the build step
echo "Updating package.json..."
cat > package.json <<'PKG'
{
  "name": "spools-errand",
  "version": "0.2.0",
  "description": "Local catalog backend and frontend for piano roll collection tracker",
  "main": "src/server.js",
  "scripts": {
    "start": "node src/server.js",
    "init-db": "node scripts/init-db.js",
    "ingest": "node ingest/run-all.js",
    "ingest:iammp": "node ingest/ingest-iammp.js",
    "ingest:rprf": "node ingest/ingest-rprf.js",
    "stats": "node scripts/stats.js"
  },
  "dependencies": {
    "better-sqlite3": "^11.3.0",
    "cors": "^2.8.5",
    "express": "^4.21.0",
    "pdf-parse": "^1.1.1",
    "yauzl": "^3.1.3"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
PKG

# Step 2: Update server.js to serve static files and add a frontend route
echo "Updating src/server.js to serve frontend..."
cat > src/server.js <<'SERVER'
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const config = require('../config.json');
const { db, initSchema } = require('./db');
const searchRoutes = require('./routes/search');
const lookupRoutes = require('./routes/lookup');
const metaRoutes = require('./routes/meta');

initSchema();

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => {
  const row = db.prepare('SELECT COUNT(*) as count FROM rolls').get();
  res.json({ status: 'ok', rollCount: row.count });
});

app.use('/api', searchRoutes);
app.use('/api', lookupRoutes);
app.use('/api', metaRoutes);

// Serve static frontend files from public/
app.use(express.static(path.resolve(__dirname, '..', 'public')));

// SPA fallback - any non-API route serves index.html
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  const indexPath = path.resolve(__dirname, '..', 'public', 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send('Frontend not built. Place index.html in public/.');
  }
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message });
});

const port = config.server.port;
const host = config.server.host;
const useHttps = config.server.https === true;

const row = db.prepare('SELECT COUNT(*) as count FROM rolls').get();
const proto = useHttps ? 'https' : 'http';
const startup = () => {
  console.log(`Spool's Errand running at ${proto}://${host}:${port}`);
  console.log(`  Frontend:  ${proto}://${host}:${port}/`);
  console.log(`  API:       ${proto}://${host}:${port}/api/health`);
  console.log(`  Catalog:   ${row.count} rolls`);
};

if (useHttps) {
  const cert = fs.readFileSync(path.resolve(__dirname, '..', config.server.cert));
  const key = fs.readFileSync(path.resolve(__dirname, '..', config.server.key));
  https.createServer({ cert, key }, app).listen(port, host, startup);
} else {
  http.createServer(app).listen(port, host, startup);
}
SERVER

# Step 3: Create public/ directory with the React frontend as a single HTML fi
