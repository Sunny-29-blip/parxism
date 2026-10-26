"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, useMotionValueEvent, useReducedMotion, useScroll, useTransform, type MotionValue } from "framer-motion";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { MoveCard } from "@/components/praxism/MoveCard";
import type { ActiveAction } from "@/lib/praxism/types";

const EASE = [0.22, 1, 0.36, 1] as const;

const FRAGMENTS = [
  "Should I build a website first?", "How much money do I need?", "Find manufacturers?", "Instagram page?",
  "Register a company?", "What if nobody buys it?", "Do I need a co-founder?", "Open a store?", "Which supplier?",
  "What price?", "Need a logo?", "Step 20?", "LLC or sole trader?", "Trademark?", "Who is my customer?",
  "What about shipping?", "Where do I even start?", "Am I too late?", "Packaging?", "Ads or organic?",
];

function rand(seed: number) { const x = Math.sin(seed * 9301 + 49297) * 233280; return x - Math.floor(x); }

function Fragment({ i, progress }: { i: number; progress: MotionValue<number> }) {
  const f = useMemo(() => {
    const x = rand(i) * 100 - 50, y = rand(i + 99) * 90 - 45;
    return {
      text: FRAGMENTS[i % FRAGMENTS.length], x, y, mono: i % 2 === 0,
      size: [12, 14, 20, 28, 40][Math.floor(rand(i + 7) * 5)], op: 0.1 + rand(i + 3) * 0.5,
      drift: (rand(i + 11) - 0.5) * 30,
    };
  }, [i]);
  const left = useTransform(progress, [0, 0.45], [`${f.x}vw`, "0vw"]);
  const top = useTransform(progress, [0, 0.45], [`${f.y}vh`, "0vh"]);
  const dx = useTransform(progress, [0, 0.45], [0, f.drift * 6]);
  const scale = useTransform(progress, [0, 0.4, 0.48], [1, 0.6, 0]);
  const opacity = useTransform(progress, [0, 0.4, 0.48], [f.op, f.op, 0]);
  return (
    <motion.span
      aria-hidden
      style={{ x: left, y: top, translateX: dx, scale, opacity, fontSize: f.size }}
      className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap ${f.mono ? "font-mono" : "display"}`}
    >
      <motion.span
        className="block"
        animate={{ x: [0, f.drift, 0] }}
        transition={{ duration: 18 + rand(i) * 12, repeat: Infinity, ease: "easeInOut" }}
      >
        {f.text}
      </motion.span>
    </motion.span>
  );
}

function Hero() {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const [pending, setPending] = useState(47);
  useMotionValueEvent(scrollYProgress, "change", (v) => setPending(Math.max(1, Math.round(47 - Math.min(v / 0.6, 1) * 46))));
  const lineW = useTransform(scrollYProgress, [0.4, 0.55, 0.7, 0.78], ["0%", "60%", "60%", "0%"]);
  const lineO = useTransform(scrollYProgress, [0.4, 0.45, 0.72, 0.78], [0, 1, 1, 0]);
  const headO = useTransform(scrollYProgress, [0.7, 0.85], [0, 1]);
  const headY = useTransform(scrollYProgress, [0.7, 0.9], [reduce ? 0 : 40, 0]);
  const scrollO = useTransform(scrollYProgress, [0, 0.1], [1, 0]);

  return (
    <section ref={ref} className="relative h-[250vh]">
      <div className="vignette sticky top-0 h-screen overflow-hidden">
        <div className="absolute inset-0 text-foreground">
          {Array.from({ length: 40 }, (_, i) => <Fragment key={i} i={i} progress={scrollYProgress} />)}
        </div>
        <motion.div style={{ width: lineW, opacity: lineO }} className="absolute left-1/2 top-1/2 h-px -translate-x-1/2 bg-ember" />
        <motion.div style={{ opacity: headO, y: headY }} className="absolute inset-0 flex flex-col items-center justify-center px-4 text-center">
          <h1 className="display text-[clamp(64px,11vw,176px)]">One move.</h1>
          <p className="mt-6 max-w-[64ch] text-fg-2">You don't need the whole journey. You need the next step.</p>
        </motion.div>
        <p className="label absolute bottom-8 left-4 text-fg-2 md:left-6" aria-live="off">
          Decisions pending: <span className="text-foreground tabular-nums">{pending}</span>
        </p>
        <motion.div style={{ opacity: scrollO }} className="absolute bottom-8 left-1/2 flex -translate-x-1/2 flex-col items-center gap-3">
          <span className="label text-fg-3">Scroll</span>
          <span className="h-10 w-px bg-line-hover" />
        </motion.div>
      </div>
    </section>
  );
}

function Reveal({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.9, ease: EASE, delay }}
    >
      {children}
    </motion.div>
  );
}

function Problem() {
  return (
    <section className="shell py-20 md:py-40">
      <div className="grid grid-cols-1 gap-10 md:grid-cols-12 md:items-end md:gap-6">
        <Reveal className="md:col-span-7">
          <h2 className="display text-[64px] md:text-[96px]">Ideas don't die from laziness.</h2>
        </Reveal>
        <Reveal className="md:col-span-4 md:col-start-9" delay={0.15}>
          <p className="max-w-[64ch] text-fg-2">
            They die from decision fatigue. You start worrying about step 20 before step 1, every question creates
            five more, and inaction gets mistaken for a lack of discipline.
          </p>
        </Reveal>
      </div>
      <div className="mt-20 grid grid-cols-1 border-t border-line md:grid-cols-3">
        {["Step 20 before step 1", "Every question spawns five more", "It isn't laziness. It's overload."].map((t, i) => (
          <p key={t} className={`label py-6 text-fg-2 md:pr-6 ${i > 0 ? "border-t border-line md:border-l md:border-t-0 md:pl-6" : ""}`}>{t}</p>
        ))}
      </div>
    </section>
  );
}

const LOOP = [
  ["Idea", "You say what you want to do. Out loud, in one sentence."],
  ["Understand", "Praxism asks only what it needs to know."],
  ["Decide", "One move. Chosen from everything you could do."],
  ["Execute", "Materials, scripts, checklists. You just do it."],
  ["Learn", "Report what happened. The plan absorbs the result."],
];

function Loop() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 80%", "end 40%"] });
  const len = useTransform(scrollYProgress, [0, 1], [0, 1]);
  return (
    <section className="border-t border-line py-20 md:py-40">
      <div className="shell" ref={ref}>
        <p className="label text-fg-3">The loop</p>
        <div className="relative mt-12">
          <svg className="pointer-events-none absolute -top-2 left-0 hidden h-24 w-full md:block" viewBox="0 0 1000 96" preserveAspectRatio="none" aria-hidden>
            <motion.path
              d="M0 8 H960 C995 8 995 88 960 88 H520 C490 88 470 60 470 30"
              fill="none" stroke="var(--ember)" strokeWidth="1" vectorEffect="non-scaling-stroke"
              style={{ pathLength: len }}
            />
          </svg>
          <ol className="grid grid-cols-1 gap-10 pt-10 sm:grid-cols-2 md:grid-cols-5 md:gap-6">
            {LOOP.map(([t, d], i) => (
              <Reveal key={t} delay={i * 0.08}>
                <li className="list-none">
                  <span className="label text-fg-3">{String(i + 1).padStart(2, "0")}</span>
                  <h3 className="display mt-3 text-[40px]">{t}</h3>
                  <p className="mt-3 text-[14px] text-fg-2">{d}</p>
                </li>
              </Reveal>
            ))}
          </ol>
        </div>
        <p className="label mt-20 text-fg-3">Learn feeds back into decide. The loop repeats.</p>
      </div>
    </section>
  );
}

const EXAMPLE: ActiveAction = {
  stage: "Validation", blocker: "", learning: null,
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

function Annotation({ label, top }: { label: string; top: string }) {
  return (
    <div className="absolute left-full hidden items-center gap-3 lg:flex" style={{ top }}>
      <span className="h-px w-16 bg-line-hover" />
      <span className="label whitespace-nowrap text-fg-2">{label}</span>
    </div>
  );
}

function Product() {
  return (
    <section className="border-t border-line py-20 md:py-40">
      <div className="shell">
        <Reveal><h2 className="display max-w-[16ch] text-[40px] md:text-[64px]">Your entire screen. One decision.</h2></Reveal>
        <Reveal className="relative mx-auto mt-16 max-w-[640px]" delay={0.1}>
          <MoveCard move={EXAMPLE} interactive={false} />
          <Annotation label="One action" top="7%" />
          <Annotation label="Why now" top="28%" />
          <Annotation label="Done when" top="76%" />
        </Reveal>
        <div className="mx-auto mt-10 flex max-w-[640px] flex-wrap gap-6">
          {["No menu", "No dashboard", "Report result"].map((t) => <span key={t} className="label text-fg-3">{t}</span>)}
        </div>
      </div>
    </section>
  );
}

function Closing() {
  const [idea, setIdea] = useState("");
  const router = useRouter();
  return (
    <section className="flex min-h-screen items-center border-t border-line py-20">
      <div className="shell">
        <Reveal><h2 className="display text-[64px] md:text-[176px]">What's your idea?</h2></Reveal>
        <form
          className="mt-12 flex max-w-[860px] flex-col gap-6 md:flex-row md:items-end"
          onSubmit={(e) => { e.preventDefault(); if (idea.trim()) router.push(`/app?idea=${encodeURIComponent(idea.trim())}`); }}
        >
          <label className="sr-only" htmlFor="closing-idea">Your idea</label>
          <input
            id="closing-idea" value={idea} onChange={(e) => setIdea(e.target.value)}
            placeholder="I want to start a clothing brand…"
            className="underline-input py-3 text-[20px]"
          />
          <button className="btn-primary shrink-0" disabled={!idea.trim()}>Find my next move</button>
        </form>
      </div>
    </section>
  );
}

export function Landing() {
  return (
    <main className="bg-background">
      <header className="fixed inset-x-0 top-0 z-20 flex items-center justify-between px-4 py-6 md:px-6">
        <span className="font-mono text-[12px] tracking-[0.4em]">PRAXISM</span>
        <Link href="/app" className="text-[14px] text-fg-2 transition-colors hover:text-foreground">Start →</Link>
      </header>
      <Hero />
      <Problem />
      <Loop />
      <Product />
      <Closing />
      <footer className="shell border-t border-line py-6">
        <p className="label text-fg-3">Praxism · One move at a time</p>
      </footer>
    </main>
  );
}
