#!/bin/sh

SUFFIX="$1"

if test -z "$SUFFIX"; then
    echo "usage: $0 SUFFIX"
    exit 1
fi

if test -z "$MONGODB_URL" -a -r "./.env"; then
    source "./.env"
fi

mongo "$MONGODB_URL" <<EOF
db.visits.renameCollection('visits_${SUFFIX}');
EOF
