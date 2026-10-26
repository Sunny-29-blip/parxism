export type Outcome = "done" | "partial" | "blocked" | "skipped";
export interface Step { title: string; detail: string }
export interface Action {
  title: string; summary: string; reasoning: string; steps: Step[];
  estimatedTime: string; estimatedCost: string; successCriteria: string[];
}
export interface ActiveAction { stage: string; blocker: string; learning?: string | null; action: Action }
export interface Question { id: string; question: string; why?: string | null }
export interface Materials { title: string; note?: string | null; materials: { kind: string; title: string; content: string }[] }
export interface HistoryItem { actionTitle: string; outcome: Outcome; result: string; completedAt: string }
export interface Session {
  id: string; idea: string; context: { question: string; answer: string }[];
  pendingQuestions: Question[]; clarificationRounds: number; currentAction: ActiveAction | null;
  history: HistoryItem[]; turn: number; createdAt: string; updatedAt: string;
}
interface Base { ok: true; sessionId: string; session: Session }
export type SuccessResponse =
  | (Base & { type: "clarification"; status: "awaiting_clarification"; data: { questions: Question[] } })
  | (Base & { type: "action"; status: "awaiting_task_completion"; data: ActiveAction })
  | (Base & { type: "materials"; status: "awaiting_task_completion"; data: Materials });
export interface ErrorResponse { ok: false; error: { code: string; message: string; details?: unknown } }

export interface StartBody { idea: string; details?: string | undefined }
export interface NextBody {
  session: Session; intent?: "answer" | "generate_materials" | "refine";
  answers?: { questionId: string; answer: string }[]; message?: string | undefined;
}
export interface CompleteBody { session: Session; outcome: Outcome; result: string }
