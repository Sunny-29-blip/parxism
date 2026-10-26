import { ApiError } from "../errors";
import { generateJson } from "./ollama";
import { buildDecisionMessages, buildMaterialsMessages } from "./prompts";
import {
  ActionDecisionSchema,
  DecisionSchema,
  MaterialsSchema,
  type AgentResult,
  type CompleteRequest,
  type NextRequest,
  type Session,
  type StartRequest,
} from "./schemas";

/**
 * The decision-making workflow. This file knows nothing about HTTP.
 *
 * The backend is STATELESS: the whole conversation lives in the `session`
 * object, which every response returns and the frontend sends back on the
 * next call. That is what makes it work on Vercel serverless functions
 * (which keep no memory between requests) without needing a database.
 */

const MAX_CLARIFICATION_ROUNDS = 2;

const now = () => new Date().toISOString();

function touch(session: Session, patch: Partial<Session> = {}): Session {
  return { ...session, ...patch, turn: session.turn + 1, updatedAt: now() };
}

/** Core step: ask the model for either clarifying questions or ONE next action. */
async function decide(session: Session): Promise<AgentResult> {
  // Only ask questions at the very start, and never more than a couple of rounds.
  const allowClarification =
    session.history.length === 0 && session.clarificationRounds < MAX_CLARIFICATION_ROUNDS;

  const decision = await generateJson(
    allowClarification ? DecisionSchema : ActionDecisionSchema,
    buildDecisionMessages(session, allowClarification),
    { temperature: 0.4 },
  );

  if (decision.type === "clarification") {
    const round = session.clarificationRounds + 1;
    const questions = decision.questions.map((q, i) => ({
      id: `r${round}q${i + 1}`,
      question: q.question,
      why: q.why ?? null,
    }));
    const next = touch(session, {
      pendingQuestions: questions,
      clarificationRounds: round,
      currentAction: null,
    });
    return {
      type: "clarification",
      status: "awaiting_clarification",
      sessionId: next.id,
      session: next,
      data: { questions },
    };
  }

  const { type: _type, ...active } = decision;
  const next = touch(session, { pendingQuestions: [], currentAction: active });
  return {
    type: "action",
    status: "awaiting_task_completion",
    sessionId: next.id,
    session: next,
    data: active,
  };
}

/* ---------------------------- POST /agent/start --------------------------- */

export async function startSession(input: StartRequest): Promise<AgentResult> {
  const created = now();
  const session: Session = {
    id: crypto.randomUUID(),
    idea: input.idea,
    context: input.details
      ? [{ question: "Additional details from the user", answer: input.details }]
      : [],
    pendingQuestions: [],
    clarificationRounds: 0,
    currentAction: null,
    history: [],
    turn: 0,
    createdAt: created,
    updatedAt: created,
  };
  return decide(session);
}

/* ---------------------------- POST /agent/next ---------------------------- */

export async function continueSession(input: NextRequest): Promise<AgentResult> {
  const session = input.session;
  const intent =
    input.intent ??
    (session.pendingQuestions.length ? "answer" : input.message ? "refine" : "generate_materials");

  if (intent === "answer") {
    if (!session.pendingQuestions.length) {
      throw new ApiError(409, "no_pending_questions", "There are no pending questions to answer.");
    }

    const additions: Session["context"] = [];
    const answers = (input.answers ?? []).filter((a) => a.answer.length > 0);
    if (answers.length) {
      for (const a of answers) {
        const q = session.pendingQuestions.find((p) => p.id === a.questionId);
        if (!q) {
          throw new ApiError(400, "unknown_question_id", `Unknown questionId "${a.questionId}".`, {
            validIds: session.pendingQuestions.map((p) => p.id),
          });
        }
        additions.push({ question: q.question, answer: a.answer });
      }
    } else if (input.message) {
      // Convenience: one free-text reply that covers all pending questions.
      additions.push({
        question: session.pendingQuestions.map((p) => p.question).join(" / "),
        answer: input.message,
      });
    } else {
      throw new ApiError(400, "answers_required", "Provide `answers` (or a `message`) for the pending questions.", {
        pendingQuestions: session.pendingQuestions,
      });
    }

    return decide({
      ...session,
      context: [...session.context, ...additions].slice(-30),
      pendingQuestions: [],
    });
  }

  if (intent === "refine") {
    if (!input.message) {
      throw new ApiError(400, "message_required", "`message` is required when intent is 'refine'.");
    }
    if (session.pendingQuestions.length) {
      throw new ApiError(409, "pending_questions", "Answer the pending questions first.", {
        pendingQuestions: session.pendingQuestions,
      });
    }
    return decide({
      ...session,
      context: [
        ...session.context,
        { question: "Additional information or feedback from the user", answer: input.message },
      ].slice(-30),
    });
  }

  // intent === "generate_materials"
  if (!session.currentAction) {
    throw new ApiError(
      409,
      "no_active_action",
      "There is no active action to generate materials for. Call /api/agent/start (or answer the pending questions) first.",
    );
  }
  const materials = await generateJson(
    MaterialsSchema,
    buildMaterialsMessages(session, input.message),
    { temperature: 0.6 },
  );
  const next = touch(session);
  return {
    type: "materials",
    status: "awaiting_task_completion",
    sessionId: next.id,
    session: next,
    data: materials,
  };
}

/* --------------------------- POST /agent/complete -------------------------- */

export async function completeTask(input: CompleteRequest): Promise<AgentResult> {
  const session = input.session;
  if (!session.currentAction) {
    throw new ApiError(
      409,
      "no_active_action",
      "There is no active action to complete. Call /api/agent/start first.",
    );
  }

  const history = [
    ...session.history,
    {
      actionTitle: session.currentAction.action.title,
      outcome: input.outcome,
      result: input.result,
      completedAt: now(),
    },
  ].slice(-30);

  return decide({ ...session, history, currentAction: null, pendingQuestions: [] });
}
