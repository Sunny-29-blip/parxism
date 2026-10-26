#!/usr/bin/env node
/**
 * End-to-end test of the whole loop against a running server.
 *
 *   BASE_URL=http://localhost:3000 npm run smoke
 *   BASE_URL=https://your-app.vercel.app npm run smoke
 */
const BASE = (process.env.BASE_URL || process.argv[2] || "http://localhost:3000").replace(/\/+$/, "");

let failures = 0;
const check = (cond, label) => {
  console.log(`${cond ? "  ✅" : "  ❌"} ${label}`);
  if (!cond) failures++;
};

async function call(path, body) {
  const res = await fetch(BASE + path, body
    ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
    : undefined);
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

console.log(`\nTesting ${BASE}\n`);

console.log("1. Health (deep: real call to Ollama)");
const health = await call("/api/health?deep=1");
check(health.status === 200 && health.json?.ok, `GET /api/health?deep=1 -> ${health.status} ${JSON.stringify(health.json?.ollama ?? health.json?.problem ?? "")}`);

console.log("2. Validation errors are clean");
const bad = await call("/api/agent/start", { idea: "" });
check(bad.status === 400 && bad.json?.error?.code === "validation_error", "empty idea -> 400 validation_error");

console.log("3. Start with an idea");
let r = await call("/api/agent/start", { idea: "I want to start a clothing brand, but I don't know where to begin." });
check(r.status === 200 && r.json?.ok, `POST /api/agent/start -> ${r.status} (type: ${r.json?.type})`);

let guard = 0;
while (r.json?.type === "clarification" && guard++ < 3) {
  console.log("   Agent asked:", r.json.data.questions.map((q) => q.question).join(" | "));
  const answers = r.json.data.questions.map((q) => ({ questionId: q.id, answer: "Young adults in my city, about $300 budget, nothing started yet." }));
  r = await call("/api/agent/next", { session: r.json.session, answers });
  check(r.status === 200, `answered questions -> ${r.status} (type: ${r.json?.type})`);
}
check(r.json?.type === "action", "received a next action");
console.log("   Next move:", r.json?.data?.action?.title);
const session1 = r.json.session;

console.log("4. Generate materials");
r = await call("/api/agent/next", { session: session1, intent: "generate_materials", message: "Write interview questions and an outreach message." });
check(r.status === 200 && r.json?.type === "materials" && r.json.data.materials.length > 0, `materials -> ${r.status} (${r.json?.data?.materials?.length} items)`);

console.log("5. Report outcome, get adapted next action");
r = await call("/api/agent/complete", { session: r.json.session, outcome: "done", result: "Talked to 5 people. 4 loved the idea, 2 said they'd pay around $40." });
check(r.status === 200 && r.json?.type === "action", `complete -> ${r.status} (type: ${r.json?.type})`);
console.log("   Adapted next move:", r.json?.data?.action?.title);
check(r.json?.session?.history?.length === 1, "history recorded");

console.log("6. Misuse is handled");
const noAction = await call("/api/agent/complete", { session: { ...session1, currentAction: null }, outcome: "done", result: "x" });
check(noAction.status === 409, `complete with no active action -> ${noAction.status}`);

console.log(failures ? `\n❌ ${failures} check(s) failed\n` : "\n🎉 All checks passed\n");
process.exit(failures ? 1 : 0);
