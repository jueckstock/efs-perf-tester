#!/bin/sh

OUTPUT_FILE="$1"

if test -z "$OUTPUT_FILE"; then
    echo "usage: $0 OUTPUT_FILE"
    exit 1
fi

if test -z "$MONGODB_URL" -a -r "./.env"; then
    source "./.env"
fi

mongo "$MONGODB_URL" <<\EOF
db.visits.aggregate([
    {$group: {_id: "$url", successes: {$sum: "$counters.complete"}, records: {$push: "$$CURRENT"}}}, 
	{$match: {successes: 12}},  // 12 for typical 4-policy/3-cycle runs; 24 for 4-policy/3-cycle/2-cache-state runs;
	{$unwind: "$records"}, 
	{$replaceRoot: {newRoot: "$records"}}, 
	{$out: "tmp_good_urls"}
], {allowDiskUse: true});
EOF

mongoexport --uri="$MONGODB_URL" --jsonArray -c tmp_good_urls >"$OUTPUT_FILE"
