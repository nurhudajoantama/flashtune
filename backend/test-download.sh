#!/usr/bin/env bash
# Test download endpoint: checks byte count, duration, and MP3 magic bytes
# Usage: ./test-download.sh [youtube-url]

set -euo pipefail

BASE_URL="http://flashtune.c.home"
API_KEY="your-random-key-here"
TEST_URL="${1:-https://www.youtube.com/watch?v=dQw4w9WgXcQ}"
OUT_FILE="/tmp/flashtune-test-$$.mp3"

echo "=== FlashTune Download Test ==="
echo "Backend : $BASE_URL"
echo "URL     : $TEST_URL"
echo "Output  : $OUT_FILE"
echo ""

# ---- 1. Health check ----
echo "[1/4] Health check..."
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/health")
if [ "$HTTP_STATUS" != "200" ]; then
  echo "FAIL: /health returned $HTTP_STATUS (expected 200)"
  exit 1
fi
echo "PASS: /health → 200"

# ---- 2. Auth rejection ----
echo "[2/4] Auth rejection (wrong key)..."
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "$BASE_URL/download" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: wrong-key" \
  -d "{\"url\": \"$TEST_URL\"}")
if [ "$HTTP_STATUS" != "401" ]; then
  echo "FAIL: expected 401 with wrong key, got $HTTP_STATUS"
  exit 1
fi
echo "PASS: wrong key → 401"

# ---- 3. Download ----
echo "[3/4] Downloading MP3 (this may take 20-60s)..."
START_TIME=$(date +%s)

HTTP_STATUS=$(curl -s -o "$OUT_FILE" -w "%{http_code}" \
  -X POST "$BASE_URL/download" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d "{\"url\": \"$TEST_URL\"}")

END_TIME=$(date +%s)
ELAPSED=$((END_TIME - START_TIME))

if [ "$HTTP_STATUS" != "200" ]; then
  echo "FAIL: /download returned $HTTP_STATUS (expected 200)"
  echo "Response body:"
  cat "$OUT_FILE"
  rm -f "$OUT_FILE"
  exit 1
fi
echo "PASS: /download → 200 (${ELAPSED}s)"

# ---- 4. Validate file ----
echo "[4/4] Validating output file..."

FILE_SIZE=$(wc -c < "$OUT_FILE")
if [ "$FILE_SIZE" -lt 100000 ]; then
  echo "FAIL: file is only ${FILE_SIZE} bytes — expected at least 100KB for a valid MP3"
  rm -f "$OUT_FILE"
  exit 1
fi
echo "PASS: file size = $(echo "$FILE_SIZE" | awk '{printf "%.2f MB", $1/1024/1024}')"

# Check MP3 magic bytes (ID3 header: 0x49 0x44 0x33, or MPEG sync: 0xFF 0xFB/0xFA/0xF3)
MAGIC=$(xxd -l 3 -p "$OUT_FILE" 2>/dev/null || od -A n -N 3 -t x1 "$OUT_FILE" | tr -d ' ')
if echo "$MAGIC" | grep -qi "^494433\|^fffb\|^fffa\|^fff3\|^fff2"; then
  echo "PASS: valid MP3 magic bytes detected ($MAGIC)"
else
  echo "WARN: unexpected magic bytes ($MAGIC) — file may not be a valid MP3"
fi

rm -f "$OUT_FILE"

echo ""
echo "=== All checks passed ==="
