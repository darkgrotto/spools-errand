#!/usr/bin/env bash
set -e

cd "$(dirname "$0")"

if [ ! -d "data/sources" ]; then
    echo "Source directory data/sources/ does not exist."
    echo "Create it and add the IAMMP ZIPs and RPRF PDFs. See README.md."
    exit 1
fi

npm run ingest
