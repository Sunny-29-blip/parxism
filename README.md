# Praxism

**Turn ideas into action. One step at a time.**
Tell Praxism your idea → it asks a few questions → gives you ONE next move → helps you do it → learns from your result → picks the next move.

One Next.js app: the frontend (designed in Lovable, ported to Next.js) and the AI backend (Ollama API) live together and deploy to Vercel as a single project.

---

## Run it locally

```bash
npm install
cp .env.example .env.local        # Windows cmd: copy .env.example .env.local
```
Open `.env.local`, put your real `OLLAMA_API_KEY` in, then:
```bash
npm run dev
```
- App: <http://localhost:3000> (landing) and <http://localhost:3000/app> (workspace)
- Check the AI connection: <http://localhost:3000/api/health?deep=1> should show `"reachable": true`

## Deploy to Vercel

1. Push this folder to a **new** GitHub repo. `.env.local` is git-ignored, so your key is never committed.
2. vercel.com → **Add New → Project** → import the repo. Framework is detected as **Next.js**. Don't change build settings.
3. Before clicking Deploy, open **Environment Variables** and add:

   | Name | Value |
   |---|---|
   | `OLLAMA_API_KEY` | your key from <https://ollama.com/settings/keys> |
   | `OLLAMA_MODEL` | `gpt-oss:120b`, or the model your hackathon requires |

4. Click **Deploy**.
5. Open `https://YOUR-APP.vercel.app/api/health?deep=1`. It must say `"reachable": true`.
6. Optional full test from your laptop: `BASE_URL=https://YOUR-APP.vercel.app npm run smoke`

Changed an env var later? **Redeploy.** Vercel only applies env vars to new deployments.

## Demo-day checklist

- [ ] `/api/health?deep=1` on the live URL shows `"reachable": true` (do this 30 minutes before, and again right before you present)
- [ ] Do one full run-through on the live URL: idea → questions → move → "Help me do this" → "Report result" → new move
- [ ] Before presenting, click **New idea** so you start clean
- [ ] Use a strong demo result when reporting, with numbers ("Talked to 5 people, 4 liked it, 2 would pay ₹800"). That's what makes the adapted next move impressive.
- [ ] Each AI step takes roughly 3 to 20 seconds. Talk over the loading line, don't click twice.
- [ ] Test on the exact laptop + browser you'll present from.

**Emergency fallback:** if Ollama is down during your slot, open `/app?mock=1` on the live site. The app switches to scripted answers instantly (no redeploy), and a "Mock data" badge appears. Be upfront with the judges if you use it. `/app?mock=0` turns it off.

## Project layout

```
app/
  page.tsx                  landing page (/)
  app/page.tsx              workspace (/app)
  api/agent/start|next|complete/route.ts   the AI agent API
  api/health/route.ts       status check (?deep=1 tests Ollama)
  globals.css               design tokens (colors, fonts, utilities)
  layout.tsx, icon.svg, not-found.tsx, error.tsx
components/praxism/         Landing, Workspace, MoveCard (the UI)
lib/praxism/                frontend API calls + types (+ scripted mock mode)
lib/agent/                  backend: prompts, engine, Ollama client, schemas
lib/http.ts, lib/errors.ts  consistent JSON errors
scripts/                    smoke test + fake Ollama for offline dev
docs/API.md                 API reference
```

- **Change how the AI thinks:** edit `lib/agent/prompts.ts`.
- **Change the look:** edit `components/praxism/*` and `app/globals.css`.
- **Frontend ↔ backend contract:** `lib/praxism/types.ts` must match `lib/agent/schemas.ts`. `npm run typecheck` (and the Vercel build) fails if they drift apart.

> This project no longer syncs with Lovable (Lovable builds on TanStack Start; this is Next.js). Make further design changes here, in code.

## Things to know

- **Stateless backend:** the whole conversation is a `session` object the browser holds (also saved in localStorage, so a refresh keeps progress) and sends back each call. No database needed.
- **Timeouts:** API routes allow up to 60 s. Bad AI output is automatically repaired (up to 3 tries).
- **Your key stays secret:** `OLLAMA_API_KEY` is only used server-side.
- **No login or rate limiting:** anyone with the URL can use your Ollama quota. Fine for a demo; don't leave it public for long.

## Troubleshooting

| What you see | Fix |
|---|---|
| "The server is missing OLLAMA_API_KEY" | Add it in Vercel env vars, then redeploy |
| "Ollama rejected the API key" | Key wrong/revoked → create a new one |
| "Ollama could not find the model" | Fix `OLLAMA_MODEL` (no `:cloud` suffix) |
| "Ollama rate limit reached" | Wait a minute |
| "The AI took too long…" | Click Retry; if it keeps happening, try a faster model |
| Fonts look plain | Check the browser can reach fonts.googleapis.com (school/office wifi sometimes blocks it) |

## Offline development (no key, no quota)

```bash
npm run mock-ollama                                   # terminal 1
OLLAMA_BASE_URL=http://localhost:11500 npm run dev    # terminal 2
```
