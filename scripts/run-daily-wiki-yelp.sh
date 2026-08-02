#!/bin/bash
# Wrapper for launchd — daily Wikipedia → Yelp sync.
set -euo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
cd "/Users/Duffis/Desktop/projects.nosync/hanchi/hanchi-api"

LOG_DIR="${HOME}/Library/Logs/hanchi"
mkdir -p "${LOG_DIR}"
LOG_FILE="${LOG_DIR}/daily-wiki-yelp.log"

{
  echo "===== $(date '+%Y-%m-%d %H:%M:%S %Z') starting daily-wiki-yelp ====="
  /opt/homebrew/bin/npm run communities:daily-wiki-yelp
  echo "===== $(date '+%Y-%m-%d %H:%M:%S %Z') finished (exit $?) ====="
} >>"${LOG_FILE}" 2>&1
