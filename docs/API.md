# Praxism API reference (for the frontend developer)

Base URL: same origin (`/api/...`). The frontend and API are one Next.js app.
All bodies are JSON. All responses are JSON.

## The one idea to understand: the `session`

The backend remembers nothing between calls. Every successful response includes a `session` object.
**Keep the latest one (React state is fine) and send it back unchanged on your next call.** Don't edit it.

## The user flow → which endpoint

```
Idea input            POST /api/agent/start
   │
   ├─ type "clarification" → show questions → POST /api/agent/next {answers}   (may repeat once)
   │
   └─ type "action"        → show "Your next move"
            │
            ├─ "Help me do it"  → POST /api/agent/next {intent:"generate_materials"} → type "materials"
            │
            └─ "I did it"       → POST /api/agent/complete {outcome, result} → new type "action"  (loop)
```

## Responses

Success always looks like `{ ok: true, type, status, sessionId, session, data }`.

| `type` | `status` | `data` | What to render |
|---|---|---|---|
| `clarification` | `awaiting_clarification` | `{ questions: [{ id, question, why }] }` | A short form; submit with `answers` |
| `action` | `awaiting_task_completion` | `{ stage, blocker, learning?, action: { title, summary, reasoning, steps[{title,detail}], estimatedTime, estimatedCost, successCriteria[] } }` | The "Your next move" card |
| `materials` | `awaiting_task_completion` | `{ title, note?, materials: [{ kind, title, content }] }` | Copyable text blocks. `content` is plain text with line breaks |

`learning` only appears after the user reported an outcome. It's a nice thing to show ("What we learned").
The *current* action is always at `session.currentAction`, so you can restore the UI from a saved session.

Errors always look like `{ ok: false, error: { code, message, details? } }` with a non-2xx status.
`message` is safe to show to users.

| Status | `code` | Meaning |
|---|---|---|
| 400 | `validation_error` | Bad body. `details.issues` lists the fields |
| 400 / 409 | `unknown_question_id`, `answers_required`, `no_pending_questions`, `no_active_action`, ... | Called in the wrong state |
| 429 | `ollama_rate_limit` | Too many requests; retry shortly |
| 502 / 504 | `ollama_upstream`, `ollama_timeout`, `ollama_bad_response` | AI hiccup; offer a "Try again" button (resend the same request) |
| 500 | `ollama_config`, `ollama_auth`, `internal_error` | Server misconfigured (tell the backend dev) |

Responses take roughly 3 to 20 s (it's an LLM call), so show a loading state and **disable the submit button while waiting**.

## Endpoints

### `GET /api/health`
Quick status. `?deep=1` also makes a real Ollama call (use once after deploy).

### `POST /api/agent/start`
```json
{ "idea": "I want to start a clothing brand", "details": "optional extra info e.g. budget" }
```
Returns `clarification` or `action`.

### `POST /api/agent/next`
Always include `session`. Then, depending on what the user is doing:

```jsonc
// 1) Answering clarification questions (intent inferred when questions are pending)
{ "session": {...}, "answers": [ { "questionId": "r1q1", "answer": "Young adults" } ] }
// ...or one free-text reply covering all questions
{ "session": {...}, "message": "Young adults, $300 budget" }

// 2) Ask for help executing the current action
{ "session": {...}, "intent": "generate_materials", "message": "optional: what you want, e.g. 'outreach DM for Instagram'" }

// 3) User adds info / pushes back and wants the recommendation revised
{ "session": {...}, "intent": "refine", "message": "I can't afford any inventory yet" }
```

### `POST /api/agent/complete`
```json
{ "session": {...}, "outcome": "done", "result": "Talked to 5 people, 4 liked it, 2 would pay ~$40" }
```
`outcome`: `"done" | "partial" | "blocked" | "skipped"`. `result` is required unless `skipped`.
Returns the next adapted `action`.

## Where the frontend calls it

All network code lives in `lib/praxism/api.ts` (`praxismApi.start/next/complete`) with types in
`lib/praxism/types.ts`. Components never call `fetch` directly. `components/praxism/Workspace.tsx`
shows the full flow: it keeps the latest `session` in state + localStorage and sends it back on every call.
