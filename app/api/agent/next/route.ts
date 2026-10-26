import { continueSession } from "@/lib/agent/engine";
import { NextRequestSchema } from "@/lib/agent/schemas";
import { handle, ok, preflight, readJson } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const OPTIONS = (req: Request) => preflight(req);

/** Continue a session: answer questions, refine the idea, or generate task materials. */
export const POST = handle(async (req) => {
  const body = NextRequestSchema.parse(await readJson(req));
  const result = await continueSession(body);
  return ok(req, { ok: true, ...result });
});
