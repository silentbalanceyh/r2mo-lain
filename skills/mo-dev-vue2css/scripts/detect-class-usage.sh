#!/usr/bin/env bash
set -euo pipefail

if [ $# -ne 1 ]; then
  echo "Usage: $0 <component.vue>" >&2
  exit 1
fi

FILE="$1"
if [ ! -f "$FILE" ]; then
  echo "Error: file not found: $FILE" >&2
  exit 1
fi

PLAIN_COUNT=$(grep -Eo '(^|[^:])class="[^"]*"' "$FILE" 2>/dev/null | wc -l | tr -d ' ' || true)
STYLE_COUNT=$(grep -Eo ':class="\$style\.[^"]*"' "$FILE" 2>/dev/null | wc -l | tr -d ' ' || true)

if [ "$PLAIN_COUNT" -gt 0 ] && [ "$STYLE_COUNT" -eq 0 ]; then
  echo "plain-class"
  exit 0
fi

if [ "$PLAIN_COUNT" -eq 0 ] && [ "$STYLE_COUNT" -gt 0 ]; then
  echo "style-module"
  exit 0
fi

if [ "$PLAIN_COUNT" -gt 0 ] && [ "$STYLE_COUNT" -gt 0 ]; then
  echo "mixed"
  exit 0
fi

echo "no-class"
