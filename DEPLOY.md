# Deploy sheet2api (login bypassed) to Vercel

The app has been switched from MongoDB to **Supabase** (already provisioned and live)
and **login is fully bypassed** — anyone who opens the site lands directly in a shared
"Demo" workspace. Everything else (sources, scoped views/connectors, token-protected
public API, caching, masking, stats, OpenAPI/MCP/Apps-Script generators) works exactly
as before.

## Environment variables (set these in Vercel → Project → Settings → Environment Variables)

```
SUPABASE_URL = https://efjkhbyhgyqesmawztny.supabase.co
SUPABASE_KEY = eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVmamtoYnloZ3lxZXNtYXd6dG55Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExNTkzMTgsImV4cCI6MjA5NjczNTMxOH0.bOFGz9XjZnBwqPv32UDX0_Xqn63POLXP1Cq-c_mnH2k
JWT_SECRET = <any-random-string>          # optional, has a default
NEXT_PUBLIC_BASE_URL = https://<your-deployment>.vercel.app   # optional, makes copy-paste API snippets show the full URL
```

`MONGO_URL` and the `GOOGLE_*` vars are no longer required.

## Option A — Vercel CLI (most reliable)

```bash
npm i -g vercel
cd sheet2api
vercel login            # opens browser
vercel link             # create/link a project
# add env vars (run once each, paste the values above):
printf '%s' "https://efjkhbyhgyqesmawztny.supabase.co" | vercel env add SUPABASE_URL production
printf '%s' "<the anon key above>" | vercel env add SUPABASE_KEY production
vercel --prod           # build + deploy
```

## Option B — GitHub + Vercel import

1. Commit and push this folder to your repo.
2. On vercel.com → Add New → Project → import the repo.
3. Add the env vars above, then Deploy.

## Notes
- The Supabase tables (`users, sources, connectors, activity, cache, oauth_state`) already
  exist and have permissive RLS policies so the anon key can read/write. Because login is
  bypassed, treat this as a public/demo deployment — the anon key in client env is fine for
  that purpose but is not a secure multi-tenant setup.
