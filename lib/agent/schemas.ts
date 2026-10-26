import { z } from "zod";

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

/** Strict text for data coming FROM the frontend (rejects over-long input). */
const inText = (max: number) => z.string().trim().min(1).max(max);

/**
 * Lenient text for data coming FROM the model: numbers become strings and
 * over-long text is trimmed instead of failing the whole response.
 */
const llmText = (max: number) =>
  z.preprocess(
    (v) => (typeof v === "number" ? String(v) : v),
    z
      .string()
      .trim()
      .min(1)
      .transform((s) => (s.length > max ? s.slice(0, max - 1).trimEnd() + "…" : s)),
  );

/* -------------------------------------------------------------------------- */
/*  Agent building blocks                                                     */
/* -------------------------------------------------------------------------- */

export const OutcomeSchema = z.enum(["done", "partial", "blocked", "skipped"]);
export type Outcome = z.infer<typeof OutcomeSchema>;

export const StepSchema = z.preprocess(
  (v) => (typeof v === "string" ? { title: v, detail: v } : v),
  z.object({ title: llmText(200), detail: llmText(800) }),
);

export const ActionSchema = z.object({
  title: llmText(200),
  summary: llmText(600),
  reasoning: llmText(1200),
  steps: z.array(StepSchema).min(1).max(8),
  estimatedTime: llmText(100),
  estimatedCost: llmText(100),
  successCriteria: z.array(llmText(300)).min(1).max(5),
});

/** The single recommended "next move" plus the context around it. */
export const ActiveActionSchema = z.object({
  stage: llmText(120),
  blocker: llmText(400),
  /** Only present after the user has reported at least one outcome. */
  learning: llmText(600).nullish(),
  action: ActionSchema,
});

export const QuestionSchema = z.object({
  id: inText(40),
  question: inText(600),
  why: inText(400).nullish(),
});

export const MaterialsSchema = z.object({
  title: llmText(200),
  note: llmText(600).nullish(),
  materials: z
    .array(
      z.object({
        /** e.g. interview_questions, outreach_message, checklist, template, research_summary, feedback_analysis */
        kind: llmText(40),
        title: llmText(200),
        content: llmText(8000),
      }),
    )
    .min(1)
    .max(4),
});

/* -------------------------------------------------------------------------- */
/*  What the model is allowed to return when asked to "decide"                */
/* -------------------------------------------------------------------------- */

export const ClarificationDecisionSchema = z.object({
  type: z.literal("clarification"),
  questions: z
    .array(z.object({ question: llmText(400), why: llmText(300).nullish() }))
    .min(1)
    .max(3),
});

export const ActionDecisionSchema = ActiveActionSchema.extend({
  type: z.literal("action"),
});

export const DecisionSchema = z.discriminatedUnion("type", [
  ClarificationDecisionSchema,
  ActionDecisionSchema,
]);

/* -------------------------------------------------------------------------- */
/*  Session (the whole conversation state; the frontend stores + echoes it)   */
/* -------------------------------------------------------------------------- */

export const HistoryItemSchema = z.object({
  actionTitle: inText(300),
  outcome: OutcomeSchema,
  result: z.string().max(3000),
  completedAt: inText(40),
});

export const SessionSchema = z.object({
  id: inText(64),
  idea: inText(2000),
  context: z
    .array(z.object({ question: inText(600), answer: inText(2000) }))
    .max(30),
  pendingQuestions: z.array(QuestionSchema).max(3),
  clarificationRounds: z.number().int().min(0).max(10),
  currentAction: ActiveActionSchema.nullable(),
  history: z.array(HistoryItemSchema).max(30),
  turn: z.number().int().min(0).max(1000),
  createdAt: inText(40),
  updatedAt: inText(40),
});

/* -------------------------------------------------------------------------- */
/*  Request bodies                                                            */
/* -------------------------------------------------------------------------- */

export const StartRequestSchema = z.object({
  idea: inText(2000),
  /** Optional extra info the UI already collected (budget, audience, location...). */
  details: z.string().trim().min(1).max(1500).optional(),
});

export const NextRequestSchema = z.object({
  session: SessionSchema,
  /**
   * What the user is doing. If omitted it is inferred:
   *  - pending questions  -> "answer"
   *  - else a `message`   -> "refine"
   *  - else               -> "generate_materials"
   */
  intent: z.enum(["answer", "generate_materials", "refine"]).optional(),
  answers: z
    // Blank answers are allowed here and simply skipped by the engine.
    .array(z.object({ questionId: inText(40), answer: z.string().trim().max(2000) }))
    .max(10)
    .optional(),
  /** Free text: a quick answer, extra info, or what materials the user wants. */
  message: inText(2000).optional(),
});

export const CompleteRequestSchema = z
  .object({
    session: SessionSchema,
    outcome: OutcomeSchema,
    /** What happened. Required unless the user skipped the task. */
    result: z.string().trim().max(3000).default(""),
  })
  .refine((v) => v.outcome === "skipped" || v.result.length > 0, {
    path: ["result"],
    message: "result is required unless outcome is 'skipped'",
  });

/* -------------------------------------------------------------------------- */
/*  Inferred types                                                            */
/* -------------------------------------------------------------------------- */

export type Session = z.output<typeof SessionSchema>;
export type Question = z.output<typeof QuestionSchema>;
export type ActiveAction = z.output<typeof ActiveActionSchema>;
export type Materials = z.output<typeof MaterialsSchema>;
export type StartRequest = z.output<typeof StartRequestSchema>;
export type NextRequest = z.output<typeof NextRequestSchema>;
export type CompleteRequest = z.output<typeof CompleteRequestSchema>;

export type SessionStatus = "awaiting_clarification" | "awaiting_task_completion";

export type AgentResult =
  | {
      type: "clarification";
      status: "awaiting_clarification";
      sessionId: string;
      session: Session;
      data: { questions: Question[] };
    }
  | {
      type: "action";
      status: "awaiting_task_completion";
      sessionId: string;
      session: Session;
      data: ActiveAction;
    }
  | {
      type: "materials";
      status: "awaiting_task_completion";
      sessionId: string;
      session: Session;
      data: Materials;
    };
