# Deploying Lumina AI

This app is built on TanStack Start. Server functions (chat, file save, project CRUD) need a **Node/edge server runtime**.

## Vercel (recommended)

Server functions work out of the box.

1. Push the repo to GitHub.
2. Import the repo in Vercel.
3. Add Environment Variables (Project Settings → Environment Variables):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
   - `VITE_SUPABASE_PROJECT_ID`
   - `SUPABASE_URL`
   - `SUPABASE_PUBLISHABLE_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `LOVABLE_API_KEY` ← paste the rotated key here
4. Deploy. Vercel detects `vercel.json` and runs `bun run build`.

## GitHub Pages (static only — limited)

GitHub Pages serves static files only — **server functions (AI chat, file save) will not work**. Use this only for previewing the marketing/landing pages.

1. Repo → Settings → Pages → Source: **GitHub Actions**.
2. Add the same `VITE_*` env vars under Settings → Secrets and variables → Actions.
3. Push to `main`. The workflow in `.github/workflows/deploy-pages.yml` builds and publishes the static output.

For full functionality, use Vercel, Cloudflare Workers, or keep using Lovable Cloud.

## LOVABLE_API_KEY

The key was rotated. Copy it from **Project Settings → Secrets → LOVABLE_API_KEY** and paste it into Vercel's Environment Variables.
