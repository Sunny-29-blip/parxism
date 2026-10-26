import { getConfig, ping } from "@/lib/agent/ollama";
import { handle, ok, preflight } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export const OPTIONS = (req: Request) => preflight(req);

/**
 * GET /api/health          -> is the server up and configured? (instant)
 * GET /api/health?deep=1   -> also makes a tiny real call to Ollama to prove
 *                             the API key + model work. Use it once after deploy.
 */
export const GET = handle(async (req) => {
  const cfg = getConfig();
  const configured = Boolean(cfg.apiKey) || cfg.isLocal;

  const body: Record<string, unknown> = {
    ok: configured,
    service: "praxism-backend",
    time: new Date().toISOString(),
    config: {
      hasApiKey: Boolean(cfg.apiKey),
      model: cfg.model,
      ollamaBaseUrl: cfg.baseUrl,
    },
  };
  if (!configured) {
    body.problem = "OLLAMA_API_KEY is not set on the server.";
  }

  if (new URL(req.url).searchParams.get("deep") === "1" && configured) {
    try {
      const r = await ping();
      body.ollama = { reachable: true, latencyMs: r.ms };
    } catch (err) {
      body.ok = false;
      body.ollama = {
        reachable: false,
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  }

  return ok(req, body, body.ok ? 200 : 503);
});
