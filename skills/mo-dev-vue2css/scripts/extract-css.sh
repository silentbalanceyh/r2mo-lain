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

DIR="$(dirname "$FILE")"
BASE="$(basename "$FILE" .vue)"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DETECT_SCRIPT="$SCRIPT_DIR/detect-class-usage.sh"
UPDATE_SCRIPT="$SCRIPT_DIR/update-import.sh"

USAGE="$($DETECT_SCRIPT "$FILE")"
case "$USAGE" in
  plain-class) CSS_EXT=".css" ;;
  style-module) CSS_EXT=".module.css" ;;
  mixed)
    echo "Error: mixed class and \$style usage. Handle manually." >&2
    exit 1
    ;;
  no-class) CSS_EXT=".css" ;;
  *)
    echo "Error: unknown class usage result: $USAGE" >&2
    exit 1
    ;;
esac

STYLE_COUNT=$(grep -c '<style' "$FILE" || true)
if [ "$STYLE_COUNT" -eq 0 ]; then
  echo "No <style> block found in $FILE"
  exit 0
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

STYLE_TAG=$(sed -n "${STYLE_OPEN_LINE}p" "$FILE")
CSS_FILE="$DIR/$BASE$CSS_EXT"
CSS_FILE_NAME="$BASE$CSS_EXT"

sed -n "$((STYLE_OPEN_LINE + 1)),$((STYLE_CLOSE_LINE - 1))p" "$FILE" > "$CSS_FILE"

if [[ "$STYLE_TAG" == *"scoped"* ]]; then
  MODE="scoped"
elif [[ "$STYLE_TAG" == *"module"* ]]; then
  MODE="module"
else
  MODE="plain"
fi

"$UPDATE_SCRIPT" "$FILE" "$CSS_FILE_NAME" "$MODE"

echo "Extracted: $CSS_FILE"
echo "Updated:   $FILE"
