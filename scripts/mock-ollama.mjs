#!/usr/bin/env node
/**
 * Fake Ollama server for OFFLINE development and testing (no API key, no quota).
 *
 *   npm run mock-ollama                 # terminal 1 (listens on :11500)
 *   OLLAMA_BASE_URL=http://localhost:11500 npm run dev   # terminal 2
 *
 * MOCK_FLAKY=1 makes it return messy / invalid output sometimes, to exercise
 * the backend's JSON extraction and self-repair logic.
 */
import http from "node:http";

const PORT = Number(process.env.MOCK_PORT) || 11500;
const FLAKY = process.env.MOCK_FLAKY === "1";
let counter = 0;

const action = (learning) => ({
  type: "action",
  stage: learning ? "Willingness to pay" : "Idea validation",
  blocker: learning
    ? "We don't yet know whether people will pay for this."
    : "We don't know if real people want this.",
  ...(learning ? { learning } : {}),
  action: {
    title: learning ? "Test willingness to pay with a pre-order page" : "Talk to 5 potential customers",
    summary: "A small, cheap action that removes the biggest uncertainty.",
    reasoning: "Spending money before validating demand is the riskiest move, so we test demand first.",
    steps: [
      { title: "List 10 people", detail: "Write down 10 people who match your target customer." },
      { title: "Reach out", detail: "Message them and ask for a 10-minute chat." },
      { title: "Ask about the problem", detail: "Ask how they solve this today, not whether they'd buy." },
    ],
    estimatedTime: "2-3 days",
    estimatedCost: "Free",
    successCriteria: ["5 conversations completed", "At least 3 describe the same problem"],
  },
});

const clarification = () => ({
  type: "clarification",
  questions: [
    { question: "Who do you imagine buying this?", why: "Determines how we validate." },
    { question: "What budget can you commit right now?", why: "Keeps the next step affordable." },
  ],
});

const materials = () => ({
  title: "Customer interview kit",
  note: "Keep each conversation under 15 minutes.",
  materials: [
    {
      kind: "interview_questions",
      title: "Interview questions",
      content: "1. Tell me about the last time you bought something like this.\n2. What was frustrating about it?\n3. How do you solve it today?",
    },
    {
      kind: "outreach_message",
      title: "Outreach message",
      content: "Hi! I'm exploring an idea and would love 10 minutes of your opinion. Free this week?",
    },
  ],
});

function reply(messages) {
  const text = messages.map((m) => m.content).join("\n");
  const repairing = text.includes("Your previous reply was rejected");
  counter++;

  if (FLAKY && !repairing && counter % 3 === 1) return "Sure! Here you go:\n```json\n{ \"nonsense\": true }\n```";
  if (FLAKY && !repairing && counter % 3 === 2) {
    const body = pick(text);
    return `Here is the JSON you asked for:\n${JSON.stringify(body)}\nHope that helps!`;
  }
  return JSON.stringify(pick(text));
}

function pick(text) {
  if (text.includes("TASK: MATERIALS")) return materials();
  const allowClarify = text.includes("ALLOW_CLARIFICATION: yes");
  const hasAnswers = /\n- Q:/.test(text);
  const hasHistory = text.includes("PROGRESS SO FAR");
  if (allowClarify && !hasAnswers) return clarification();
  return action(hasHistory ? "The interviews showed real interest, so next we test whether people will pay." : undefined);
}

http
  .createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      res.setHeader("Content-Type", "application/json");
      if (req.url === "/api/tags") return res.end(JSON.stringify({ models: [{ name: "mock-model" }] }));
      if (req.url === "/api/chat" && req.method === "POST") {
        const body = JSON.parse(raw || "{}");
        const content = body.messages?.some((m) => m.content.includes("pong")) ? "pong" : reply(body.messages ?? []);
        // small delay so it feels like a real call
        return setTimeout(
          () => res.end(JSON.stringify({ model: body.model, message: { role: "assistant", content }, done: true })),
          150,
        );
      }
      res.statusCode = 404;
      res.end("{}");
    });
  })
  .listen(PORT, () => console.log(`Mock Ollama listening on http://localhost:${PORT} (flaky=${FLAKY})`));
