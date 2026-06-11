#!/usr/bin/env bash
# One-shot deploy for sheet2api (login bypassed, Supabase-backed).
# Usage:
#   1. Unzip the project, cd into it.
#   2. Run:  vercel login        (one time, opens browser)
#   3. Run:  bash deploy.sh
set -e

SUPABASE_URL="https://efjkhbyhgyqesmawztny.supabase.co"
SUPABASE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVmamtoYnloZ3lxZXNtYXd6dG55Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExNTkzMTgsImV4cCI6MjA5NjczNTMxOH0.bOFGz9XjZnBwqPv32UDX0_Xqn63POLXP1Cq-c_mnH2k"
JWT_SECRET="sheet2api_$(date +%s)_$RANDOM"

command -v vercel >/dev/null 2>&1 || npm i -g vercel

echo "==> Linking project (creates one if it doesn't exist)…"
vercel link --yes

set_env () {  # name value
  for ENVN in production preview development; do
    vercel env rm "$1" "$ENVN" --yes >/dev/null 2>&1 || true
    printf '%s' "$2" | vercel env add "$1" "$ENVN" >/dev/null 2>&1 || true
  done
  echo "    set $1"
}

echo "==> Setting environment variables…"
set_env SUPABASE_URL "$SUPABASE_URL"
set_env SUPABASE_KEY "$SUPABASE_KEY"
set_env JWT_SECRET   "$JWT_SECRET"

echo "==> Deploying to production…"
vercel deploy --prod --yes
echo "==> Done. The production URL is printed above."
