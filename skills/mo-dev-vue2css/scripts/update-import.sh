#!/usr/bin/env bash
set -euo pipefail

if [ $# -lt 2 ] || [ $# -gt 3 ]; then
  echo "Usage: $0 <component.vue> <css-file-name> [scoped|module|plain]" >&2
  exit 1
fi

FILE="$1"
CSS_FILE_NAME="$2"
MODE="${3:-scoped}"

if [ ! -f "$FILE" ]; then
  echo "Error: file not found: $FILE" >&2
  exit 1
fi

STYLE_COUNT=$(grep -c '<style' "$FILE" || true)
if [ "$STYLE_COUNT" -eq 0 ]; then
  echo "Error: no <style> block found in $FILE" >&2
  exit 1
fi

if [ "$STYLE_COUNT" -gt 1 ]; then
  echo "Error: multiple <style> blocks detected. Handle manually." >&2
  exit 1
fi

STYLE_OPEN_LINE=$(grep -n '<style[^>]*>' "$FILE" | head -n1 | cut -d: -f1)
STYLE_CLOSE_LINE=$(grep -n '</style>' "$FILE" | head -n1 | cut -d: -f1)

if [ -z "$STYLE_OPEN_LINE" ] || [ -z "$STYLE_CLOSE_LINE" ] || [ "$STYLE_CLOSE_LINE" -le "$STYLE_OPEN_LINE" ]; then
  echo "Error: invalid <style> block in $FILE" >&2
  exit 1
fi

case "$MODE" in
  scoped) NEW_STYLE="<style scoped src=\"./$CSS_FILE_NAME\"></style>" ;;
  module) NEW_STYLE="<style module src=\"./$CSS_FILE_NAME\"></style>" ;;
  plain) NEW_STYLE="<style src=\"./$CSS_FILE_NAME\"></style>" ;;
  *)
    echo "Error: invalid mode '$MODE' (use scoped|module|plain)" >&2
    exit 1
    ;;
esac

awk -v start="$STYLE_OPEN_LINE" -v end="$STYLE_CLOSE_LINE" -v repl="$NEW_STYLE" '
NR < start { print; next }
NR == start { print repl; next }
NR > start && NR <= end { next }
{ print }
' "$FILE" > "$FILE.tmp"
mv "$FILE.tmp" "$FILE"

echo "Updated import in: $FILE"
