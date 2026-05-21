#!/usr/bin/env bash
set -e

cd "$(dirname "$0")"

usage() {
    cat <<EOF
Usage: ./start.sh [PORT] [-p PORT] [--port PORT] [-h]

Starts the Spool's Errand server.

Options:
  PORT              Positional port override (e.g. ./start.sh 8080).
  -p, --port PORT   Port override via flag.
  -h, --help        Show this help and exit.

Environment:
  PORT              Port override (takes precedence if no CLI arg is given).
  HOST              Host override (bind address).

Without overrides, the server uses port/host from config.json.
EOF
}

# Parse args: accept -p/--port PORT, -h/--help, or a single positional port.
port_arg=""
while [ $# -gt 0 ]; do
    case "$1" in
        -h|--help)
            usage
            exit 0
            ;;
        -p|--port)
            if [ -z "${2:-}" ]; then
                echo "Error: $1 requires a port number." >&2
                exit 1
            fi
            port_arg="$2"
            shift 2
            ;;
        --port=*)
            port_arg="${1#--port=}"
            shift
            ;;
        *)
            if [ -n "$port_arg" ]; then
                echo "Error: unexpected argument '$1'." >&2
                usage >&2
                exit 1
            fi
            port_arg="$1"
            shift
            ;;
    esac
done

# CLI arg wins over env PORT.
if [ -n "$port_arg" ]; then
    case "$port_arg" in
        ''|*[!0-9]*)
            echo "Error: port must be numeric, got '$port_arg'." >&2
            exit 1
            ;;
    esac
    if [ "$port_arg" -lt 1 ] || [ "$port_arg" -gt 65535 ]; then
        echo "Error: port must be 1-65535, got '$port_arg'." >&2
        exit 1
    fi
    export PORT="$port_arg"
fi

echo "=== Spool's Errand ==="
echo

if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi

if [ ! -f "data/catalog.db" ]; then
    echo "Initializing database..."
    npm run init-db
    echo
    echo "Database initialized but empty."
    echo "To populate it, place source files in data/sources/ and run: ./ingest.sh"
    echo "See README.md for details."
    echo
fi

if [ -n "${PORT:-}" ]; then
    echo "Starting API server on port $PORT..."
else
    echo "Starting API server (using port from config.json)..."
fi
echo "Press Ctrl+C to stop."
echo
npm start
