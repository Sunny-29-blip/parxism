import { z } from "zod";
import { ApiError } from "./errors";
import { OllamaError } from "./agent/ollama";

/* ------------------------------- CORS ------------------------------------ */

function corsHeaders(req: Request): Record<string, string> {
  const allowed = (process.env.ALLOWED_ORIGINS || "*")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  let allowOrigin = "*";
  if (!allowed.includes("*")) {
    const origin = req.headers.get("origin");
    allowOrigin = origin && allowed.includes(origin) ? origin : allowed[0] ?? "";
  }

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
    "Cache-Control": "no-store",
  };
}

/** Respond to a CORS preflight request. */
export function preflight(req: Request): Response {
  return new Response(null, { status: 204, headers: corsHeaders(req) });
}

/* ----------------------------- Responses --------------------------------- */

export function ok(req: Request, body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: corsHeaders(req) });
}

type ErrorBody = { ok: false; error: { code: string; message: string; details?: unknown } };

function errorResponse(req: Request, status: number, code: string, message: string, details?: unknown) {
  const body: ErrorBody = { ok: false, error: { code, message, ...(details !== undefined ? { details } : {}) } };
  return Response.json(body, { status, headers: corsHeaders(req) });
}

const OLLAMA_STATUS: Record<string, number> = {
  config: 500,
  auth: 502,
  rate_limit: 429,
  timeout: 504,
  upstream: 502,
  bad_response: 502,
};

export function fail(req: Request, err: unknown): Response {
  if (err instanceof ApiError) {
    return errorResponse(req, err.status, err.code, err.message, err.details);
  }
  if (err instanceof z.ZodError) {
    return errorResponse(req, 400, "validation_error", "The request body is invalid.", {
      issues: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }
  if (err instanceof OllamaError) {
    console.error(`[praxism] ollama error (${err.code}): ${err.message}`);
    return errorResponse(req, OLLAMA_STATUS[err.code] ?? 502, `ollama_${err.code}`, err.message);
  }
  console.error("[praxism] unexpected error", err);
  return errorResponse(req, 500, "internal_error", "Something went wrong on the server.");
}

/** Wrap a route handler so every error becomes a consistent JSON response. */
export function handle(fn: (req: Request) => Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    try {
      return await fn(req);
    } catch (err) {
      return fail(req, err);
    }
  };
}

/* ------------------------------ Requests --------------------------------- */

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new ApiError(400, "invalid_json", "The request body must be valid JSON.");
  }
}
