/**
 * Compile-time guard: the frontend's types (lib/praxism/types.ts) must stay
 * compatible with the backend's zod schemas. If you change a schema and
 * `npm run typecheck` (or `next build`) fails here, update the frontend types.
 */
import type { Session as UISession, SuccessResponse } from "../praxism/types";
import type { AgentResult, Session } from "./schemas";

export const sessionToUI = (s: Session): UISession => s;
export const sessionFromUI = (s: UISession): Session => s;
export const resultToUI = (r: AgentResult): SuccessResponse => ({ ok: true, ...r });
