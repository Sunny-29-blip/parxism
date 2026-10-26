import { startSession } from "@/lib/agent/engine";
import { StartRequestSchema } from "@/lib/agent/schemas";
import { handle, ok, preflight, readJson } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const OPTIONS = (req: Request) => preflight(req);

/** Start a session from an idea. Returns clarifying questions OR the first next action. */
export const POST = handle(async (req) => {
  const body = StartRequestSchema.parse(await readJson(req));
  const result = await startSession(body);
  return ok(req, { ok: true, ...result });
});
