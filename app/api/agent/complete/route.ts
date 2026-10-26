import { completeTask } from "@/lib/agent/engine";
import { CompleteRequestSchema } from "@/lib/agent/schemas";
import { handle, ok, preflight, readJson } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const OPTIONS = (req: Request) => preflight(req);

/** Report what happened with the current action and get the adapted next action. */
export const POST = handle(async (req) => {
  const body = CompleteRequestSchema.parse(await readJson(req));
  const result = await completeTask(body);
  return ok(req, { ok: true, ...result });
});
