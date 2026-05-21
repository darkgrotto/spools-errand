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

const port = parseInt(process.env.PORT, 10) || config.server.port;
const host = process.env.HOST || config.server.host;
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
