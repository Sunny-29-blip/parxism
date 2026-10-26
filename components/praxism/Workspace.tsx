"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { MoveCard } from "@/components/praxism/MoveCard";
import { isMockMode, loadSession, praxismApi, saveSession, syncMockFlag } from "@/lib/praxism/api";
import type { Materials, Outcome, Question, Session, SuccessResponse } from "@/lib/praxism/types";

const EASE = [0.22, 1, 0.36, 1] as const;
const STATUSES = ["Reading your context", "Weighing options", "Choosing one move"];
const PLACEHOLDERS = ["I want to start a clothing brand…", "I want to launch a podcast…", "I want to sell my baked goods…"];
const OUTCOME_LABEL: Record<Outcome, string> = { done: "Done", partial: "Partly", blocked: "Blocked", skipped: "Skipped" };

export function Workspace() {
  const searchParams = useSearchParams();
  const ideaParam = searchParams.get("idea");
  const mockParam = searchParams.get("mock");
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [materials, setMaterials] = useState<Materials | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mock, setMock] = useState(false);
  const [drawer, setDrawer] = useState<"log" | "context" | null>(null);
  const [reporting, setReporting] = useState(false);
  const lastReq = useRef<(() => Promise<SuccessResponse>) | null>(null);
  const started = useRef(false);

  const run = useCallback(async (req: () => Promise<SuccessResponse>) => {
    lastReq.current = req;
    setLoading(true); setError(null);
    try {
      const res = await req();
      setSession(res.session); saveSession(res.session);
      if (res.type === "materials") setMaterials(res.data); else setMaterials(null);
      if (res.type !== "materials") { setReporting(false); window.scrollTo({ top: 0, behavior: "smooth" }); }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    syncMockFlag(mockParam);
    setMock(isMockMode());
    if (started.current) return;
    started.current = true;
    if (ideaParam) {
      const idea = ideaParam;
      saveSession(null);
      router.replace("/app");
      run(() => praxismApi.start({ idea }));
    } else {
      setSession(loadSession());
    }
  }, [ideaParam, mockParam, router, run]);

  const reset = () => { saveSession(null); setSession(null); setMaterials(null); setError(null); setReporting(false); };

  const state = !session ? "input" : session.pendingQuestions.length ? "questions" : session.currentAction ? "action" : "input";

  const log = <MissionLog session={session} />;
  const ctx = <Context session={session} />;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-background px-4 py-4 md:px-6">
        <div className="flex items-center gap-4">
          <Link href="/" className="font-mono text-[12px] tracking-[0.4em]">PRAXISM</Link>
          {mock && <span className="label rounded-full border border-line px-2 py-0.5 text-fg-3">Mock data</span>}
        </div>
        <div className="flex items-center gap-2">
          <button className="label px-2 py-2 text-fg-2 xl:hidden" onClick={() => setDrawer("log")}>Log</button>
          <button className="label px-2 py-2 text-fg-2 xl:hidden" onClick={() => setDrawer("context")}>Context</button>
          <button className="btn-ghost !py-2" onClick={reset} disabled={loading}>New idea</button>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1240px] justify-center">
        <aside className="hidden w-[260px] shrink-0 border-r border-line xl:block">{log}</aside>
        <main className="w-full max-w-[640px] px-4 py-10 md:px-6 xl:px-0 xl:mx-0 xl:border-r xl:border-line">
          <div className="xl:px-6">
            {loading && <Loading />}
            {error && !loading && (
              <div className="mb-8 flex items-center justify-between gap-4 border border-line p-4" role="alert">
                <p className="text-[14px]">{error}</p>
                <button className="btn-ghost !py-2" onClick={() => lastReq.current && run(lastReq.current)}>Retry</button>
              </div>
            )}
            <AnimatePresence mode="wait">
              <motion.div
                key={state + (session?.turn ?? 0)}
                initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -40 }}
                transition={{ duration: 0.6, ease: EASE }}
              >
                {state === "input" && <IdeaInput disabled={loading} onSubmit={(idea, details) => run(() => praxismApi.start({ idea, details: details || undefined }))} />}
                {state === "questions" && session && (
                  <Clarify questions={session.pendingQuestions} disabled={loading}
                    onSubmit={(answers) => run(() => praxismApi.next({ session, intent: "answer", answers }))} />
                )}
                {state === "action" && session?.currentAction && (
                  <div className="space-y-8">
                    <MoveCard move={session.currentAction} />
                    <ActionBar
                      disabled={loading}
                      reporting={reporting}
                      onReportToggle={() => setReporting((r) => !r)}
                      onHelp={(m) => run(() => praxismApi.next({ session, intent: "generate_materials", message: m || undefined }))}
                      onRefine={(m) => run(() => praxismApi.next({ session, intent: "refine", message: m }))}
                    />
                    {reporting && (
                      <Report disabled={loading} onSubmit={(outcome, result) => run(() => praxismApi.complete({ session, outcome, result }))} />
                    )}
                    {materials && <Kit materials={materials} />}
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
        <aside className="hidden w-[320px] shrink-0 xl:block">{ctx}</aside>
      </div>

      <AnimatePresence>
        {drawer && (
          <motion.div className="fixed inset-0 z-40 bg-background xl:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="flex justify-end border-b border-line p-4">
              <button className="label text-fg-2" onClick={() => setDrawer(null)}>Close</button>
            </div>
            <div className="overflow-y-auto">{drawer === "log" ? log : ctx}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Loading() {
  const [i, setI] = useState(0);
  useEffect(() => { const t = setInterval(() => setI((x) => (x + 1) % STATUSES.length), 2500); return () => clearInterval(t); }, []);
  return (
    <div className="mb-8">
      <div className="h-px w-full bg-line"><div className="loading-line h-px w-full bg-ember" /></div>
      <p className="label mt-3 text-fg-2" aria-live="polite">{STATUSES[i]}</p>
    </div>
  );
}

function IdeaInput({ onSubmit, disabled }: { onSubmit: (idea: string, details: string) => void; disabled: boolean }) {
  const [idea, setIdea] = useState("");
  const [details, setDetails] = useState("");
  const [open, setOpen] = useState(false);
  const [p, setP] = useState(0);
  useEffect(() => { const t = setInterval(() => setP((x) => (x + 1) % PLACEHOLDERS.length), 3000); return () => clearInterval(t); }, []);
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (idea.trim()) onSubmit(idea.trim(), details.trim()); }}>
      <p className="label text-fg-3">New mission</p>
      <h1 className="display mt-4 text-[40px] md:text-[64px]">What's your idea?</h1>
      <label htmlFor="idea" className="sr-only">Your idea</label>
      <textarea id="idea" rows={3} value={idea} onChange={(e) => setIdea(e.target.value)} placeholder={PLACEHOLDERS[p]}
        className="underline-input mt-8 resize-none py-3 text-[20px]" />
      <button type="button" className="label mt-6 text-fg-2 hover:text-foreground" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? "− Hide details" : "+ Add details"}
      </button>
      {open && (
        <textarea rows={3} value={details} onChange={(e) => setDetails(e.target.value)} aria-label="Details"
          placeholder="Budget, location, background" className="underline-input mt-4 resize-none py-2 text-[14px]" />
      )}
      <div className="mt-8"><button className="btn-primary" disabled={disabled || !idea.trim()}>Find my next move</button></div>
    </form>
  );
}

function Clarify({ questions, onSubmit, disabled }: { questions: Question[]; onSubmit: (a: { questionId: string; answer: string }[]) => void; disabled: boolean }) {
  const [a, setA] = useState<Record<string, string>>({});
  // Only send questions the user actually answered; at least one is required.
  const answered = questions
    .map((q) => ({ questionId: q.id, answer: (a[q.id] ?? "").trim() }))
    .filter((x) => x.answer.length > 0);
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (answered.length) onSubmit(answered); }}>
      <p className="label text-ember">Before we decide · {questions.length} questions</p>
      <div className="mt-8 space-y-10">
        {questions.map((q) => (
          <div key={q.id}>
            <label htmlFor={q.id} className="block text-[20px]">{q.question}</label>
            {q.why && <p className="label mt-2 normal-case tracking-normal text-fg-2">{q.why}</p>}
            <input id={q.id} value={a[q.id] ?? ""} onChange={(e) => setA({ ...a, [q.id]: e.target.value })} className="underline-input mt-4 py-2" />
          </div>
        ))}
      </div>
      <div className="mt-10"><button className="btn-primary" disabled={disabled || answered.length === 0}>Continue</button></div>
    </form>
  );
}

function ActionBar({ onHelp, onRefine, onReportToggle, reporting, disabled }: {
  onHelp: (m: string) => void; onRefine: (m: string) => void; onReportToggle: () => void; reporting: boolean; disabled: boolean;
}) {
  const [mode, setMode] = useState<"help" | "refine" | null>(null);
  const [text, setText] = useState("");
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <button className="btn-ghost" disabled={disabled} aria-pressed={mode === "help"} onClick={() => { setMode(mode === "help" ? null : "help"); setText(""); }}>Help me do this</button>
        <button className="btn-ghost" disabled={disabled} aria-pressed={mode === "refine"} onClick={() => { setMode(mode === "refine" ? null : "refine"); setText(""); }}>This doesn't fit</button>
        <button className="btn-primary" disabled={disabled} aria-pressed={reporting} onClick={onReportToggle}>Report result</button>
      </div>
      {mode && (
        <form className="mt-6" onSubmit={(e) => {
          e.preventDefault();
          if (mode === "help") onHelp(text.trim());
          else if (text.trim()) onRefine(text.trim());
          setMode(null);
        }}>
          {mode === "help" ? (
            <input aria-label="What do you need?" placeholder="What do you need? (optional)" value={text} onChange={(e) => setText(e.target.value)} className="underline-input py-2" />
          ) : (
            <textarea aria-label="What doesn't fit?" rows={3} placeholder="What doesn't fit?" value={text} onChange={(e) => setText(e.target.value)} className="underline-input resize-none py-2" />
          )}
          <button className="btn-ghost mt-4" disabled={disabled || (mode === "refine" && !text.trim())}>
            {mode === "help" ? "Generate materials" : "Refine this move"}
          </button>
        </form>
      )}
    </div>
  );
}

function Report({ onSubmit, disabled }: { onSubmit: (o: Outcome, r: string) => void; disabled: boolean }) {
  const [o, setO] = useState<Outcome>("done");
  const [r, setR] = useState("");
  const opts: [Outcome, string][] = [["done", "Done"], ["partial", "Partly"], ["blocked", "Blocked"], ["skipped", "Skip"]];
  const valid = o === "skipped" || r.trim().length > 0;
  return (
    <form className="border border-line p-6" onSubmit={(e) => { e.preventDefault(); if (valid) onSubmit(o, r.trim()); }}>
      <p className="label text-fg-3">Report result</p>
      <div role="radiogroup" aria-label="Outcome" className="mt-4 grid grid-cols-4 border border-line">
        {opts.map(([v, l], i) => (
          <button type="button" role="radio" aria-checked={o === v} key={v} onClick={() => setO(v)}
            className={`label py-3 transition-colors ${i ? "border-l border-line" : ""} ${o === v ? "bg-raised text-foreground" : "text-fg-2"}`}>
            {l}
          </button>
        ))}
      </div>
      <textarea rows={4} value={r} onChange={(e) => setR(e.target.value)} aria-label="What happened"
        placeholder="What happened? Be specific, numbers help." className="underline-input mt-6 resize-none py-2" />
      <button className="btn-primary mt-6" disabled={disabled || !valid}>Get my next move</button>
    </form>
  );
}

function Kit({ materials }: { materials: Materials }) {
  return (
    <section>
      <p className="label text-fg-3">Execution kit</p>
      <h3 className="display mt-3 text-[28px]">{materials.title}</h3>
      {materials.note && <p className="mt-2 text-[14px] text-fg-2">{materials.note}</p>}
      <div className="mt-6 space-y-4">
        {materials.materials.map((m, i) => <Doc key={i} {...m} />)}
      </div>
    </section>
  );
}

function Doc({ kind, title, content }: { kind: string; title: string; content: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="border border-line bg-surface">
      <div className="flex items-center justify-between border-b border-line px-5 py-3">
        <div>
          <p className="label text-fg-3">{kind.replace(/_/g, " ")}</p>
          <p className="mt-1 font-medium">{title}</p>
        </div>
        <button className="label text-fg-2 hover:text-foreground" onClick={async () => {
          await navigator.clipboard.writeText(content); setCopied(true); setTimeout(() => setCopied(false), 1500);
        }}>{copied ? "Copied" : "Copy"}</button>
      </div>
      <p className="whitespace-pre-wrap p-5 font-mono text-[12px] leading-relaxed text-fg-2">{content}</p>
    </div>
  );
}

function MissionLog({ session }: { session: Session | null }) {
  return (
    <div className="p-6">
      <p className="label text-fg-3">Mission log</p>
      {session ? (
        <>
          <p className="mt-4 text-[14px]">{session.idea}</p>
          <ol className="mt-6 space-y-4 border-t border-line pt-6">
            <AnimatePresence>
              {session.history.map((h, i) => (
                <motion.li key={i} initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.7, ease: EASE }}>
                  <span className={`label rounded-full border px-2 py-0.5 ${h.outcome === "done" ? "border-ember text-ember" : h.outcome === "blocked" ? "border-sand text-sand" : "border-line text-fg-2"}`}>
                    {OUTCOME_LABEL[h.outcome]}
                  </span>
                  <p className="mt-2 text-[14px]">{h.actionTitle}</p>
                  {h.result && <p className="mt-1 text-[12px] text-fg-3">{h.result}</p>}
                </motion.li>
              ))}
            </AnimatePresence>
            {session.history.length === 0 && <li className="text-[14px] text-fg-3">No moves completed yet.</li>}
          </ol>
        </>
      ) : <p className="mt-4 text-[14px] text-fg-3">Start with an idea.</p>}
    </div>
  );
}

function Context({ session }: { session: Session | null }) {
  const a = session?.currentAction;
  return (
    <div className="space-y-8 p-6">
      <p className="label text-fg-3">Context</p>
      <div>
        <p className="label text-fg-3">Stage</p>
        <p className="mt-2 text-[14px]">{a?.stage ?? "—"}</p>
      </div>
      <div>
        <p className="label text-fg-3">Biggest unknown</p>
        <p className="mt-2 text-[14px]">{a?.blocker || "—"}</p>
      </div>
      <div>
        <p className="label text-fg-3">What we know</p>
        {session?.context.length ? (
          <dl className="mt-3 space-y-4">
            {session.context.map((c, i) => (
              <div key={i}>
                <dt className="text-[12px] text-fg-3">{c.question}</dt>
                <dd className="mt-1 text-[14px]">{c.answer || "—"}</dd>
              </div>
            ))}
          </dl>
        ) : <p className="mt-2 text-[14px] text-fg-3">Nothing yet.</p>}
      </div>
    </div>
  );
}
