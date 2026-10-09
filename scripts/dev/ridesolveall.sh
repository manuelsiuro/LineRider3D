#!/bin/sh
# Runs scripts/dev/ridesolve.ts in parallel shards and writes src/levels/rideSolutions.ts
# (keeping the pairs already solved there). Then regenerate medals: npx tsx scripts/dev/medals.ts
cd "$(dirname "$0")/../.."
N=${N:-12}
OUT=$(mktemp -d)
i=0
while [ $i -lt $N ]; do
  npx tsx scripts/dev/ridesolve.ts $i $N > "$OUT/$i.txt" 2> "$OUT/$i.err" &
  i=$((i + 1))
done
wait
cat "$OUT"/*.err
npx tsx scripts/dev/ridesolvewrite.ts "$OUT"/*.txt
