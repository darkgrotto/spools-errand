#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

# Regenerate the self-signed HTTPS cert/key pair used by the local server.
#
# Normally you don't need to run this — start.sh auto-generates the pair on
# first run if HTTPS is enabled in config.json and the files are missing.
# Use this script when you want to force-regenerate (e.g. expired cert,
# changed SANs, or you want a new key).
#
# Earlier versions of this script also rewrote config.json and src/server.js
# from inline heredocs; that was destructive and clobbered later edits, so
# those steps have been removed. HTTPS wiring now lives directly in
# src/server.js and config.json — edit them there.

echo "=== Regenerating HTTPS cert for Spool's Errand ==="
echo

if ! command -v openssl >/dev/null 2>&1; then
    echo "Error: openssl not found in PATH." >&2
    exit 1
fi

mkdir -p certs

if [ ! -f certs/openssl.cnf ]; then
    echo "Error: certs/openssl.cnf is missing (expected to be tracked in the repo)." >&2
    exit 1
fi

# Read cert/key paths from config.json so this stays in sync if they're moved.
cert_path="$(node -p "require('./config.json').server.cert" 2>/dev/null || echo "./certs/server.crt")"
key_path="$(node -p "require('./config.json').server.key" 2>/dev/null || echo "./certs/server.key")"

if [ -f "$key_path" ] || [ -f "$cert_path" ]; then
    echo "Existing cert/key found:"
    [ -f "$cert_path" ] && echo "  $cert_path"
    [ -f "$key_path" ] && echo "  $key_path"
    read -r -p "Overwrite? [y/N] " reply
    case "$reply" in
        y|Y|yes|YES) ;;
        *) echo "Aborted."; exit 0 ;;
    esac
fi

mkdir -p "$(dirname "$key_path")" "$(dirname "$cert_path")"

openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
    -keyout "$key_path" \
    -out "$cert_path" \
    -config certs/openssl.cnf \
    -extensions v3_req

echo
echo "Wrote $key_path and $cert_path"
echo
echo "NEXT STEPS:"
echo
echo "1. (macOS only, one-time) Trust the certificate in the System keychain:"
echo "     sudo security add-trusted-cert -d -r trustRoot \\"
echo "       -k /Library/Keychains/System.keychain $cert_path"
echo
echo "2. Start the server:"
echo "     ./start.sh"
echo
