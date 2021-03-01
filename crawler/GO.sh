#!/bin/sh

DOMAIN="$1"
URL="http://$DOMAIN"
PROFILE="vanilla"
DIR="TEST/$PROFILE/$DOMAIN/"
echo "GO: $URL ($DIR)"
mkdir -p "$DIR" || exit 1
node main.js -a '["--enable-crashpad"]'  -b ~/brave/manual-testing/impl/brave -s ~/brave/manual-testing/vanilla -d "$DIR" -f json -c 3 -v -x "$URL" 2>&1 | tee "$DIR/full.log"
