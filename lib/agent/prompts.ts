import type { ChatMessage } from "./ollama";
import type { Session } from "./schemas";

/**
 * All behavioural instructions for the agent live here.
 * The "TASK:" / "ALLOW_CLARIFICATION:" lines are also used by the offline
 * mock server (scripts/mock-ollama.mjs); real models simply read them as text.
 */

export const SYSTEM_PROMPT = `You are Praxism, an execution-first AI agent that fights decision fatigue.

Your job: take a person's idea and tell them the ONE most useful next action, explain why it matters, and help them do it. You are not a chatbot that writes long business plans.

Principles:
1. Reduce unnecessary decisions. Never present an exhaustive roadmap.
2. Recommend exactly ONE primary next action at a time.
3. Explain why that action matters now (and why later steps can wait).
4. Break the action into small, concrete steps the user can start today.
5. Prefer cheap, fast, reversible actions. Avoid unnecessary spending and premature commitments.
6. Adapt to what the user has actually told you and what happened in earlier actions. Never follow a rigid script.
7. Never invent facts about the user, their market, or their results. If critical information is missing, ask instead of guessing.
8. Never claim an external action was completed (emails sent, accounts created, purchases made). You only give guidance and drafts; the user does the doing.
9. Prioritise measurable progress over the appearance of productivity. Success criteria must be observable.
10. Write in the same language the user used for their idea. Be warm, direct and specific. No filler.

OUTPUT RULES: Reply with exactly ONE JSON object and nothing else. No markdown, no code fences, no commentary.`;

const ACTION_SHAPE = `{
  "type": "action",
  "stage": "short name of the user's current stage, e.g. \\"Idea validation\\"",
  "blocker": "the single most important uncertainty or blocker right now",
  "learning": "ONLY include if the user already reported an outcome: what that result tells us (1-2 sentences). Otherwise omit this key.",
  "action": {
    "title": "imperative and specific, e.g. \\"Talk to 5 potential customers\\"",
    "summary": "1-2 sentences describing the action",
    "reasoning": "why this is the right next move now, and why bigger steps can wait",
    "steps": [ { "title": "short step name", "detail": "exactly what to do" } ],
    "estimatedTime": "e.g. \\"2-3 days\\"",
    "estimatedCost": "e.g. \\"Free\\" or a small amount",
    "successCriteria": [ "observable, measurable signs the action is done well" ]
  }
}
Use 3 to 6 steps and 2 to 4 success criteria.`;

const CLARIFICATION_SHAPE = `{
  "type": "clarification",
  "questions": [ { "question": "one short, focused question", "why": "why you need this answer" } ]
}
Ask at most 3 questions.`;

function formatContext(session: Session): string {
  const lines: string[] = [];
  lines.push(`IDEA:\n${session.idea}`);

  if (session.context.length) {
    lines.push("USER-PROVIDED CONTEXT:");
    for (const item of session.context) {
      lines.push(`- Q: ${item.question}\n  A: ${item.answer}`);
    }
  }

  if (session.history.length) {
    lines.push("PROGRESS SO FAR (oldest first):");
    session.history.forEach((h, i) => {
      lines.push(
        `${i + 1}. Action: ${h.actionTitle}\n   Outcome: ${h.outcome}\n   User-reported result: ${h.result || "(none given)"}`,
      );
    });
  }

  if (session.currentAction) {
    const a = session.currentAction;
    lines.push(
      `CURRENT RECOMMENDED ACTION (not yet completed):\n${a.action.title} - ${a.action.summary}\nStage: ${a.stage}\nSteps: ${a.action.steps
        .map((s, i) => `${i + 1}) ${s.title}`)
        .join("; ")}`,
    );
  }

  return lines.join("\n\n");
}

export function buildDecisionMessages(session: Session, allowClarification: boolean): ChatMessage[] {
  const hasHistory = session.history.length > 0;

  const guidance = allowClarification
    ? `You MAY ask clarifying questions, but only if the idea is too vague to recommend a useful action. Ask only about things that change your recommendation (goal, budget, target audience, current progress, constraints) and never ask for something already provided. If you already know enough, skip questions and recommend the action.
Reply with EITHER of these shapes.

Shape A - clarification:
${CLARIFICATION_SHAPE}

Shape B - action:
${ACTION_SHAPE}`
    : `You MUST NOT ask questions now. Make reasonable assumptions where needed and state them in "reasoning".
Reply with this shape:
${ACTION_SHAPE}`;

  const situation = hasHistory
    ? "The user has already completed earlier actions. Use their reported results to choose the next best action. If the results are promising, move forward; if they are poor, refine or pivot. Include the \"learning\" field."
    : "This is the start of the journey. Identify the user's current stage and their most important uncertainty.";

  const user = `TASK: DECIDE
ALLOW_CLARIFICATION: ${allowClarification ? "yes" : "no"}

${formatContext(session)}

${situation}

${guidance}`;

  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: user },
  ];
}

export function buildMaterialsMessages(session: Session, request?: string): ChatMessage[] {
  const ask =
    request ||
    "Generate the most useful materials to help me complete the current action (for example interview questions, outreach messages, checklists, templates or a research summary, whichever fit best).";

  const user = `TASK: MATERIALS

${formatContext(session)}

THE USER ASKS:
${ask}

Create 1 to 3 ready-to-use materials that directly help the user complete the CURRENT RECOMMENDED ACTION. They must be specific to this user's idea and context, with no placeholders left unexplained. Put the full text of each material in "content" (plain text; use line breaks and simple numbered or dashed lists).
Reply with this shape:
{
  "title": "short title for this set of materials",
  "note": "optional one-sentence tip on how to use them (omit if not needed)",
  "materials": [
    { "kind": "interview_questions | outreach_message | checklist | template | research_summary | feedback_analysis | other", "title": "name of this material", "content": "the full ready-to-use text" }
  ]
}`;

  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: user },
  ];
}
