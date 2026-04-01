#!/bin/bash
# Monitor the Diagnostic Quartet agent journal and emit a compact status line.
# Intended to run from cron every 5 minutes.

set -euo pipefail

JOURNAL_PATH="${JOURNAL_PATH:-$HOME/.openclaw/Diagnostic_Quartet/agent_journal.md}"
STATE_DIR="${STATE_DIR:-$HOME/.openclaw/Diagnostic_Quartet/.monitor}"
STATE_FILE="$STATE_DIR/agent-journal-monitor.state"
WARN_AFTER_MINUTES="${WARN_AFTER_MINUTES:-30}"

mkdir -p "$STATE_DIR"

if [ ! -f "$JOURNAL_PATH" ]; then
  echo "$(date '+%Y-%m-%d %H:%M:%S %Z') status=error reason=journal-missing path=$JOURNAL_PATH"
  exit 1
fi

mtime_epoch="$(stat -c %Y "$JOURNAL_PATH")"
now_epoch="$(date +%s)"
age_minutes="$(((now_epoch - mtime_epoch) / 60))"

last_seen_mtime="0"
if [ -f "$STATE_FILE" ]; then
  last_seen_mtime="$(cat "$STATE_FILE" 2>/dev/null || echo 0)"
fi

latest_heading="$(
  rg -n '^### ' "$JOURNAL_PATH" 2>/dev/null | tail -n 1 | sed 's/^[0-9]\+://'
)"

if [ -z "$latest_heading" ]; then
  latest_heading="(no journal headings found)"
fi

status="ok"
if [ "$age_minutes" -ge "$WARN_AFTER_MINUTES" ]; then
  status="stale"
fi

changed="no"
if [ "$mtime_epoch" -gt "$last_seen_mtime" ]; then
  changed="yes"
  printf '%s\n' "$mtime_epoch" > "$STATE_FILE"
fi

echo "$(date '+%Y-%m-%d %H:%M:%S %Z') status=$status changed=$changed age_minutes=$age_minutes latest_section=\"$latest_heading\" path=$JOURNAL_PATH"
