#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

echo "=== Adding HTTPS support to backend ==="
echo

# Step 1: Generate self-signed cert for 127.0.0.1 and localhost
mkdir -p certs
if [ ! -f certs/server.key ]; then
    echo "Generating self-signed certificate for 127.0.0.1..."
    cat > certs/openssl.cnf <<'CERTCONF'
[req]
distinguished_name = req_distinguished_name
x509_extensions = v3_req
prompt = no

[req_distinguished_name]
C = US
ST = Pennsylvania
L = Local
O = Spool's Errand
CN = 127.0.0.1

[v3_req]
keyUsage = keyEncipherment, dataEncipherment
extendedKeyUsage = serverAuth
subjectAltName = @alt_names

[alt_names]
DNS.1 = localhost
IP.1 = 127.0.0.1
IP.2 = ::1
CERTCONF

    openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
        -keyout certs/server.key \
        -out certs/server.crt \
        -config certs/openssl.cnf \
        -extensions v3_req
    echo "  Certificate created at certs/server.crt"
else
    echo "Certificate already exists, skipping generation."
fi

# Step 2: Update config.json to include HTTPS settings
echo
echo "Updating config.json..."
cat > config.json <<'CONFIG'
{
  "server": {
    "port": 7843,
    "host": "127.0.0.1",
    "https": true,
    "cert": "./certs/server.crt",
    "key": "./certs/server.key"
  },
  "database": {
    "path": "./data/catalog.db"
  },
  "sources": {
    "directory": "./data/sources"
  }
}
CONFIG

# Step 3: Update src/server.js to support HTTPS
echo "Updating src/server.js..."
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

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message });
});

const port = config.server.port;
const host = config.server.host;
const useHttps = config.server.https === true;

const row = db.prepare('SELECT COUNT(*) as count FROM rolls').get();

if (useHttps) {
  const cert = fs.readFileSync(path.resolve(__dirname, '..', config.server.cert));
  const key = fs.readFileSync(path.resolve(__dirname, '..', config.server.key));
  https.createServer({ cert, key }, app).listen(port, host, () => {
    console.log(`Spool's Errand API listening on https://${host}:${port}`);
    console.log(`Catalog contains ${row.count} rolls`);
  });
} else {
  http.createServer(app).listen(port, host, () => {
    console.log(`Spool's Errand API listening on http://${host}:${port}`);
    console.log(`Catalog contains ${row.count} rolls`);
  });
}
SERVER

echo
echo "=== HTTPS setup complete ==="
echo
echo "NEXT STEPS:"
echo
echo "1. Trust the certificate in macOS Keychain (one-time):"
echo "   sudo security add-trusted-cert -d -r trustRoot \\"
echo "     -k /Library/Keychains/System.keychain certs/server.crt"
echo
echo "   You'll be prompted for your Mac password."
echo
echo "2. Restart the server:"
echo "   ./start.sh"
echo
echo "3. Test in a browser tab:"
echo "   open https://127.0.0.1:7843/api/health"
echo "   (Should now show as secure with no warning)"
echo
echo "4. In the artifact Settings, change backend URL to:"
echo "   https://127.0.0.1:7843"
echo
echo "5. Click Test - should connect."
echo
