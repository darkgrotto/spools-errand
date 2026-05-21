#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

echo "=== Regenerating certificate with correct key usage ==="
echo

# Remove old cert from keychain first
echo "Removing old certificate from keychain (will prompt for password)..."
sudo security delete-certificate -c "127.0.0.1" /Library/Keychains/System.keychain 2>/dev/null || echo "  (no existing cert to remove)"

# Remove old cert files
rm -f certs/server.key certs/server.crt certs/openssl.cnf

# Generate new cert with proper key usage
echo "Generating new certificate..."
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
basicConstraints = CA:FALSE
keyUsage = critical, digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth
subjectAltName = @alt_names

[alt_names]
DNS.1 = localhost
DNS.2 = 127.0.0.1
IP.1 = 127.0.0.1
IP.2 = ::1
CERTCONF

openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
    -keyout certs/server.key \
    -out certs/server.crt \
    -config certs/openssl.cnf \
    -extensions v3_req

echo "  Certificate created"
echo

# Verify the cert has the right extensions
echo "Verifying certificate extensions..."
openssl x509 -in certs/server.crt -noout -ext keyUsage,extendedKeyUsage,subjectAltName
echo

# Re-add to keychain
echo "Adding new certificate to System keychain (will prompt for password)..."
sudo security add-trusted-cert -d -r trustRoot \
    -k /Library/Keychains/System.keychain certs/server.crt

echo
echo "=== Done ==="
echo
echo "Now:"
echo "1. Restart the backend: Ctrl-C the running server, then ./start.sh"
echo "2. Test in Chrome: open -a 'Google Chrome' https://127.0.0.1:7843/api/health"
echo "3. In artifact Settings, use https://127.0.0.1:7843"
