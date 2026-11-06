#!/bin/sh
# Lists every hostname the browser container looks up while it runs, then flags known
# third-party browser vendors. Usage: sudo host/egress-report.sh 120   (seconds to capture)
# Run a Tracking Check and a heatmap screenshot during the capture window.
set -eu
SECS=${1:-120}
OUT=$(mktemp)
echo "capturing DNS + new TCP connections on br-browser for ${SECS}s…"
timeout "$SECS" tcpdump -i br-browser -nn -l 'udp dst port 53 or (tcp[tcpflags] & tcp-syn != 0 and tcp[tcpflags] & tcp-ack == 0)' > "$OUT" 2>/dev/null || true

echo "--- hostnames looked up ---"
grep -oE '(A|AAAA)\? [^ ]+' "$OUT" | awk '{print $2}' | sed 's/\.$//' | sort | uniq -c | sort -rn
echo "--- distinct destination IP:port ---"
grep -oE '> [0-9.]+\.(80|443):' "$OUT" | sed -E 's/> //; s/:$//' | sort -u | wc -l

# Browserless itself, and the Chrome background services seen with full (non-shell) Chrome.
VENDOR='browserless|update\.googleapis\.com|clients[0-9]*\.google\.com|safebrowsing|optimizationguide'
if grep -qiE "$VENDOR" "$OUT"; then
  echo "WARNING: vendor/background lookups found:"
  grep -iE "$VENDOR" "$OUT"
  exit 1
fi
echo "OK: no Browserless or Chrome background-service lookups"
rm -f "$OUT"
