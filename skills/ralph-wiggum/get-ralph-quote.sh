#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-single}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CACHE_FILE="$ROOT/cache/quotes.txt"
mkdir -p "$ROOT/cache"

UA="openclaw-ralph-skill/1.0"
TIMEOUT=6

fetch_github() {
local urls=(
"https://raw.githubusercontent.com/fstandhartinger/ralph-wiggum/main/quotes.txt"
"https://raw.githubusercontent.com/fstandhartinger/ralph-wiggum/master/quotes.txt"
"https://raw.githubusercontent.com/fstandhartinger/ralph-wiggum/main/data/quotes.txt"
"https://raw.githubusercontent.com/fstandhartinger/ralph-wiggum/master/data/quotes.txt"
)
for u in "${urls[@]}"; do
if out="$(curl -A "$UA" -fsSL --max-time "$TIMEOUT" "$u" 2>/dev/null)"; then
if [ "$(printf "%s\n" "$out" | sed '/^[[:space:]]*$/d' | wc -l)" -ge 5 ]; then
printf "%s\n" "$out"
return 0
fi
fi
done
return 1
}

fetch_site() {
curl -A "$UA" -fsSL --max-time "$TIMEOUT" "https://ralph-wiggum.ai/" 2>/dev/null \
| sed -n 's/.*<blockquote[^>]*>\(.*\)<\/blockquote>.*/\1/p' \
| sed 's/<[^>]*>//g' \
| sed 's/&quot;/"/g; s/&amp;/\&/g; s/&#39;/'"'"'/g' \
| sed '/^[[:space:]]*$/d' || true
}

get_pool() {
local pool=""
if pool="$(fetch_github)"; then
printf "%s\n" "$pool" | sed '/^[[:space:]]*$/d' > "$CACHE_FILE"
printf "%s\n" "$pool"
return 0
fi

pool="$(fetch_site || true)"
if [ -n "${pool// /}" ]; then
printf "%s\n" "$pool" | sed '/^[[:space:]]*$/d' > "$CACHE_FILE"
printf "%s\n" "$pool"
return 0
fi

if [ -s "$CACHE_FILE" ]; then
cat "$CACHE_FILE"
return 0
fi

cat <<'FALLBACK'
My cat’s breath smells like cat food.
I’m in danger.
Me fail English? That’s unpossible.
It tastes like… burning.
I bent my wookiee.
FALLBACK
}

pick_qotd() {
local lines n idx
lines="$(cat)"
n="$(printf "%s\n" "$lines" | sed '/^[[:space:]]*$/d' | wc -l)"
[ "$n" -ge 1 ] || return 1
idx=$(( (10#$(date +%Y%m%d)) % n + 1 ))
printf "%s\n" "$lines" | sed -n "${idx}p"
}

pool="$(get_pool | sed '/^[[:space:]]*$/d')"

case "$MODE" in
single) printf "%s\n" "$pool" | shuf -n 1 ;;
pack3) printf "%s\n" "$pool" | shuf -n 3 ;;
qotd) printf "%s\n" "$pool" | pick_qotd ;;
*) echo "Unknown mode: $MODE (single|pack3|qotd)" >&2; exit 2 ;;
esac
