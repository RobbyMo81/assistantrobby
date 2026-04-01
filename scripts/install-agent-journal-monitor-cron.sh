#!/bin/bash
# Install a user crontab entry that runs the agent journal monitor every 5 minutes.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MONITOR_SCRIPT="$SCRIPT_DIR/agent-journal-monitor.sh"
LOG_DIR="${LOG_DIR:-$HOME/.openclaw/Diagnostic_Quartet}"
LOG_FILE="$LOG_DIR/agent_journal_monitor.log"
CRON_TAG="# openclaw-agent-journal-monitor"
CRON_LINE="*/5 * * * * /usr/bin/bash $MONITOR_SCRIPT >> $LOG_FILE 2>&1 $CRON_TAG"

mkdir -p "$LOG_DIR"

existing_crontab="$(mktemp)"
trap 'rm -f "$existing_crontab"' EXIT

if crontab -l > "$existing_crontab" 2>/dev/null; then
  :
else
  : > "$existing_crontab"
fi

if rg -Fq "$CRON_TAG" "$existing_crontab"; then
  python3 - "$existing_crontab" "$CRON_LINE" <<'PY'
import pathlib
import sys

path = pathlib.Path(sys.argv[1])
line = sys.argv[2]
tag = "# openclaw-agent-journal-monitor"
rows = path.read_text().splitlines()
updated = [line if tag in row else row for row in rows]
path.write_text("\n".join(updated) + ("\n" if updated else ""))
PY
else
  printf '%s\n' "$CRON_LINE" >> "$existing_crontab"
fi

crontab "$existing_crontab"
echo "Installed cron entry:"
echo "$CRON_LINE"
