#!/bin/bash
# web/scripts/tbs-sync.sh — keep cookiedoh.co.id/tbs in step with the ChatGPT product master.
#
# Runs hourly from launchd (~/Library/LaunchAgents/id.cookiedoh.tbs-sync.plist). Each run:
#   1. finds the newest Total-Buah-Product-Master.xlsx under ~/Documents/ChatGPT
#      (ChatGPT may start a new outputs/<uuid>/ folder; the file name stays the same)
#   2. stops unless it changed since the last good run (or --force)
#   3. opens a Cloud SQL proxy and loads the sheet into PRODUCTION (cookiedoh-db) —
#      copy, prices, families, recipes go live at once, no deploy needed
#   4. new Drive photos / recipe pictures are committed from a PRIVATE worktree
#      (~/.tbs-sync/worktree, never the main checkout) and pushed to main → Vercel deploys
#
# Log: ~/.tbs-sync/sync.log   Last result: ~/.tbs-sync/status
# Run by hand:  bash web/scripts/tbs-sync.sh --force
set -uo pipefail
export PATH="$HOME/google-cloud-sdk/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

REPO="$HOME/cookie-doh"
STATE="$HOME/.tbs-sync"
WT="$STATE/worktree"
PORT=5444                       # dedicated; other rooms use 5433-5439 / 55432
INSTANCE="tbs-group-500303:asia-southeast2:cookiedoh-db"
FORCE=0; [ "${1:-}" = "--force" ] && FORCE=1

mkdir -p "$STATE"
exec >>"$STATE/sync.log" 2>&1
say() { echo "$(date '+%Y-%m-%d %H:%M:%S') $*"; }
status() { echo "$(date '+%Y-%m-%d %H:%M') $*" > "$STATE/status"; say "$*"; }

# one run at a time (a big photo batch can take >1 h)
if ! mkdir "$STATE/lock" 2>/dev/null; then
  if [ -n "$(find "$STATE/lock" -maxdepth 0 -mmin +240 2>/dev/null)" ]; then rmdir "$STATE/lock"; mkdir "$STATE/lock"; else say "another run is active — skip"; exit 0; fi
fi
PROXY_PID=""
cleanup() { [ -n "$PROXY_PID" ] && kill "$PROXY_PID" 2>/dev/null; rmdir "$STATE/lock" 2>/dev/null; }
trap cleanup EXIT

SHEET=$(find "$HOME/Documents/ChatGPT" -type f -name 'Total-Buah-Product-Master.xlsx' -print0 2>/dev/null \
        | xargs -0 stat -f '%m %N' 2>/dev/null | sort -rn | head -1 | cut -d' ' -f2-)
if [ -z "$SHEET" ]; then status "ERROR no Total-Buah-Product-Master.xlsx under ~/Documents/ChatGPT (or no permission to read it)"; exit 1; fi
# never read a file ChatGPT is still writing
AGE=$(( $(date +%s) - $(stat -f %m "$SHEET") ))
if [ "$AGE" -lt 120 ]; then say "sheet modified ${AGE}s ago — wait for the next run"; exit 0; fi
HASH=$(shasum -a 256 "$SHEET" | cut -d' ' -f1)
if [ "$FORCE" = 0 ] && [ "$HASH" = "$(cat "$STATE/last-hash" 2>/dev/null)" ]; then exit 0; fi
say "sheet changed: $SHEET"

# private worktree at origin/main
git -C "$REPO" fetch -q origin main || { status "ERROR git fetch failed"; exit 1; }
if [ ! -d "$WT/.git" ] && [ ! -f "$WT/.git" ]; then
  git -C "$REPO" worktree add -q --detach "$WT" origin/main || { status "ERROR worktree add failed"; exit 1; }
else
  git -C "$WT" checkout -q --detach origin/main 2>/dev/null || git -C "$WT" reset -q --hard origin/main
fi

# production database through the proxy
PGPASSWORD=$(gcloud secrets versions access latest --secret=cookiedoh-db-app-password --project=tbs-group-500303 2>/dev/null)
if [ -z "$PGPASSWORD" ]; then status "ERROR cannot read the DB password from Secret Manager (gcloud login expired?)"; exit 1; fi
export PGPASSWORD
if ! lsof -nP -iTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1; then
  cloud-sql-proxy --address 127.0.0.1 --port $PORT "$INSTANCE" >>"$STATE/proxy.log" 2>&1 &
  PROXY_PID=$!
  for _ in $(seq 1 20); do lsof -nP -iTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1 && break; sleep 1; done
fi
if ! psql -h 127.0.0.1 -p $PORT -U cookiedoh_app -d cookiedoh -Atc "select 1" >/dev/null 2>&1; then
  status "ERROR Cloud SQL proxy did not connect (see ~/.tbs-sync/proxy.log)"; exit 1
fi

say "loading into Cloud SQL…"
if ! python3 -I "$WT/web/scripts/tbs-content-load.py" --xlsx "$SHEET" \
      --database-url "postgresql://cookiedoh_app@127.0.0.1:$PORT/cookiedoh" \
      --public-dir "$WT/web/public/tbs/products" --fetch-recipe-images; then
  status "ERROR loader failed — content NOT updated (details above in sync.log)"; exit 1
fi

# new photos → main → Vercel
git -C "$WT" add web/public/tbs
if git -C "$WT" diff --cached --quiet; then
  echo "$HASH" > "$STATE/last-hash"
  status "OK content loaded, no new photos"
  exit 0
fi
N=$(git -C "$WT" diff --cached --name-only | wc -l | tr -d ' ')
git -C "$WT" commit -q -m "tbs-sync: $N new photo files from the product master (automatic, $(date '+%Y-%m-%d %H:%M'))"
for attempt in 1 2 3; do
  if git -C "$WT" push -q origin HEAD:main; then
    echo "$HASH" > "$STATE/last-hash"
    status "OK content loaded, $N photo files pushed (live after the Vercel deploy)"
    exit 0
  fi
  git -C "$WT" fetch -q origin main && git -C "$WT" rebase -q origin/main || break
done
status "ERROR content loaded but the photo push failed — will retry next hour"
exit 1
