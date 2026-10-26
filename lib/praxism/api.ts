import type {
  ActiveAction, CompleteBody, ErrorResponse, NextBody, Question, Session, StartBody, SuccessResponse,
} from "./types";

/* The API lives in this same Next.js app (app/api/*), so calls are same-origin. */
const BASE = "";
export const SESSION_KEY = "praxism-session";
const MOCK_KEY = "praxism-mock";

/**
 * Mock mode = fake, scripted answers with no AI call. It is OFF by default.
 * Turn it on with NEXT_PUBLIC_USE_MOCK=true (build time), or instantly in a
 * browser by opening /app?mock=1 (and /app?mock=0 to turn it off again).
 * The workspace shows a "Mock data" badge whenever it is on.
 */
export function isMockMode(): boolean {
  if (process.env.NEXT_PUBLIC_USE_MOCK === "true") return true;
  if (typeof window === "undefined") return false;
  try { return localStorage.getItem(MOCK_KEY) === "1"; } catch { return false; }
}

/** Reads ?mock=1 / ?mock=0 from the URL and remembers the choice in this browser. */
export function syncMockFlag(param: string | null) {
  try {
    if (param === "1") localStorage.setItem(MOCK_KEY, "1");
    if (param === "0") localStorage.removeItem(MOCK_KEY);
  } catch { /* storage unavailable */ }
}

export class PraxismError extends Error {
  code: string;
  constructor(code: string, message: string) { super(message); this.code = code; }
}

async function post(path: string, body: unknown): Promise<SuccessResponse> {
  if (isMockMode()) return mock(path, body);
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
  } catch {
    throw new PraxismError("network", "Could not reach Praxism. Check your connection and retry.");
  }
  const json = (await res.json().catch(() => null)) as SuccessResponse | ErrorResponse | null;
  if (!res.ok || !json || !json.ok) {
    const err = json && !json.ok ? json.error : null;
    if (!err && res.status === 504) {
      throw new PraxismError("timeout", "The AI took too long to answer. Retry, it usually works the second time.");
    }
    throw new PraxismError(err?.code ?? "unknown", err?.message ?? `Request failed (${res.status}).`);
  }
  return json;
}

export const praxismApi = {
  start: (b: StartBody) => post("/api/agent/start", b),
  next: (b: NextBody) => post("/api/agent/next", b),
  complete: (b: CompleteBody) => post("/api/agent/complete", b),
};

export function loadSession(): Session | null {
  try { const r = localStorage.getItem(SESSION_KEY); return r ? (JSON.parse(r) as Session) : null; } catch { return null; }
}
export function saveSession(s: Session | null) {
  try {
    if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s)); else localStorage.removeItem(SESSION_KEY);
  } catch { /* storage full or unavailable: the session still lives in memory */ }
}

/* ---------------- Mock ---------------- */
const wait = () => new Promise((r) => setTimeout(r, 1500 + Math.random() * 1000));
const now = () => new Date().toISOString();

const QUESTIONS: Question[] = [
  { id: "q_customer", question: "Who do you picture wearing it first?", why: "The first customer decides what you test." },
  { id: "q_budget", question: "How much can you spend before you see a sale?", why: "Sets how much we can risk on samples." },
  { id: "q_sold", question: "Have you sold anything before, online or in person?", why: "Tells us whether to start with channels or with product." },
];

const MOVE_1: ActiveAction = {
  stage: "Validation",
  blocker: "You don't yet know if anyone wants this enough to pay.",
  learning: null,
  action: {
    title: "Talk to 5 potential customers",
    summary: "Before spending on inventory, hear from real buyers.",
    reasoning: "Inventory is the most expensive mistake you can make before you know anyone wants this.",
    steps: [
      { title: "List 10 people who match your customer", detail: "Names, not ideas." },
      { title: "Message them for a 10-minute chat", detail: "Ask for their time, not their opinion." },
      { title: "Ask how they shop today, not if they'd buy", detail: "Stories beat surveys." },
    ],
    estimatedTime: "2-3 days", estimatedCost: "Free",
    successCriteria: ["5 conversations completed", "3+ describe the same problem"],
  },
};

const MOVE_2: ActiveAction = {
  stage: "Validation",
  blocker: "You know the problem. You don't know if they'll pay your price.",
  learning: "Several people said they can't find basics that fit well at a fair price. That is the wedge, not the brand story.",
  action: {
    title: "Pre-sell 10 sample tees",
    summary: "Take real orders for one product before you produce a full run.",
    reasoning: "Money changing hands is the only validation that counts. Ten orders tells you more than a hundred compliments.",
    steps: [
      { title: "Get one sample made locally", detail: "One fit, two colors. Nothing more." },
      { title: "Shoot it on someone you interviewed", detail: "Phone camera, daylight, plain wall." },
      { title: "Send a pre-order link to everyone you spoke to", detail: "Ship in 3 weeks. Be upfront about it." },
    ],
    estimatedTime: "1 week", estimatedCost: "$80-150",
    successCriteria: ["10 paid pre-orders", "At least 4 from people you didn't interview"],
  },
};

function mkSession(idea: string): Session {
  const t = now();
  return { id: `mock_${Date.now().toString(36)}`, idea, context: [], pendingQuestions: [], clarificationRounds: 0, currentAction: null, history: [], turn: 0, createdAt: t, updatedAt: t };
}

async function mock(path: string, raw: unknown): Promise<SuccessResponse> {
  await wait();
  const body = raw as Record<string, unknown>;
  if (path.endsWith("/start")) {
    const b = body as unknown as StartBody;
    if (!b.idea?.trim()) throw new PraxismError("invalid_input", "Tell us your idea first.");
    const s = { ...mkSession(b.idea), pendingQuestions: QUESTIONS, clarificationRounds: 1, turn: 1 };
    return { ok: true, type: "clarification", status: "awaiting_clarification", sessionId: s.id, session: s, data: { questions: QUESTIONS } };
  }
  if (path.endsWith("/next")) {
    const b = body as unknown as NextBody;
    const s = b.session;
    if (b.intent === "answer") {
      const context = [...s.context, ...(b.answers ?? []).map((a) => ({
        question: s.pendingQuestions.find((q) => q.id === a.questionId)?.question ?? a.questionId, answer: a.answer,
      }))];
      const ns: Session = { ...s, context, pendingQuestions: [], currentAction: MOVE_1, turn: s.turn + 1, updatedAt: now() };
      return { ok: true, type: "action", status: "awaiting_task_completion", sessionId: ns.id, session: ns, data: MOVE_1 };
    }
    if (b.intent === "generate_materials") {
      const ns = { ...s, turn: s.turn + 1, updatedAt: now() };
      const t = s.currentAction?.action.title ?? "this move";
      return {
        ok: true, type: "materials", status: "awaiting_task_completion", sessionId: ns.id, session: ns,
        data: {
          title: `Kit for: ${t}`, note: b.message ? `Tailored to: ${b.message}` : null,
          materials: [
            { kind: "outreach_message", title: "First message", content: "Hey [name], I'm starting a small clothing line and trying to understand how people shop for everyday basics.\n\nWould you have 10 minutes this week for a quick call? No pitch, I just want to hear how you do it today.\n\nThanks either way." },
            { kind: "interview_script", title: "10-minute script", content: "1. When did you last buy a basic tee or hoodie? Walk me through it.\n2. Where did you look first?\n3. What almost stopped you from buying?\n4. What did you pay? Did it feel fair?\n5. What annoys you about what you own now?\n\nDo not mention your brand until the last minute." },
            { kind: "tracking_sheet", title: "Notes template", content: "Name | Date | Where they shop | Last price paid | Main frustration | Quote\n---\n" },
          ],
        },
      };
    }
    if (b.intent === "refine") {
      const cur = s.currentAction ?? MOVE_1;
      const refined: ActiveAction = {
        ...cur,
        action: {
          ...cur.action,
          title: "Run a 3-question poll with 20 people",
          summary: "A lighter version that fits your time: async, no calls.",
          steps: [
            { title: "Write 3 questions about how they buy basics", detail: "Open-ended. No yes/no." },
            { title: "Send to 20 people via DM or a group chat", detail: "Ask for honest, short answers." },
            { title: "Group answers by frustration", detail: "Look for the same complaint twice." },
          ],
          estimatedTime: "2 days",
        },
      };
      const ns = { ...s, currentAction: refined, turn: s.turn + 1, updatedAt: now() };
      return { ok: true, type: "action", status: "awaiting_task_completion", sessionId: ns.id, session: ns, data: refined };
    }
    throw new PraxismError("invalid_intent", "Unknown request.");
  }
  if (path.endsWith("/complete")) {
    const b = body as unknown as CompleteBody;
    const s = b.session;
    const next = s.history.length === 0 ? MOVE_2 : { ...MOVE_2, learning: "Pre-orders tell us price is the lever. Next we test a second product at the same price." };
    const ns: Session = {
      ...s,
      history: [...s.history, { actionTitle: s.currentAction?.action.title ?? "Move", outcome: b.outcome, result: b.result, completedAt: now() }],
      currentAction: next, turn: s.turn + 1, updatedAt: now(),
    };
    return { ok: true, type: "action", status: "awaiting_task_completion", sessionId: ns.id, session: ns, data: next };
  }
  throw new PraxismError("not_found", "Unknown endpoint.");
}
