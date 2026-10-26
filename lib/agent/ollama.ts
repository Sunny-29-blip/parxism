import { z } from "zod";

/**
 * Everything that talks to Ollama lives in this file.
 * The API key is read from process.env on the server only.
 */

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type OllamaErrorCode =
  | "config" //       missing / invalid server configuration
  | "auth" //         Ollama rejected the API key
  | "rate_limit" //   Ollama said slow down (429)
  | "timeout" //      took too long
  | "upstream" //     Ollama is down / returned an error
  | "bad_response"; // model output could not be turned into valid data

export class OllamaError extends Error {
  code: OllamaErrorCode;
  upstreamStatus?: number;

  constructor(code: OllamaErrorCode, message: string, upstreamStatus?: number) {
    super(message);
    this.name = "OllamaError";
    this.code = code;
    this.upstreamStatus = upstreamStatus;
  }
}

export function getConfig() {
  const baseUrl = (process.env.OLLAMA_BASE_URL || "https://ollama.com").replace(/\/+$/, "");
  const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(baseUrl);
  return {
    apiKey: (process.env.OLLAMA_API_KEY || "").trim(),
    model: (process.env.OLLAMA_MODEL || "gpt-oss:120b").trim(),
    baseUrl,
    isLocal,
    timeoutMs: Number(process.env.OLLAMA_TIMEOUT_MS) || 40_000,
  };
}

type ChatOptions = {
  messages: ChatMessage[];
  temperature?: number;
  /** Ask Ollama for JSON-only output (`format: "json"`). */
  json?: boolean;
  timeoutMs?: number;
};

async function chatOnce(opts: ChatOptions): Promise<string> {
  const cfg = getConfig();

  if (!cfg.apiKey && !cfg.isLocal) {
    throw new OllamaError(
      "config",
      "The server is missing OLLAMA_API_KEY. Add it in your environment variables (Vercel: Project Settings → Environment Variables) and redeploy.",
    );
  }

  const body: Record<string, unknown> = {
    model: cfg.model,
    messages: opts.messages,
    stream: false,
    options: { temperature: opts.temperature ?? 0.4 },
  };
  if (opts.json) body.format = "json";

  const controller = new AbortController();
  const timeout = Math.max(1000, Math.min(opts.timeoutMs ?? cfg.timeoutMs, cfg.timeoutMs));
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    let res: Response;
    try {
      res = await fetch(`${cfg.baseUrl}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
        cache: "no-store",
      });
    } catch (err) {
      if (controller.signal.aborted) {
        throw new OllamaError("timeout", "The AI model took too long to respond. Please try again.");
      }
      throw new OllamaError("upstream", "Could not reach the Ollama API. Please try again.");
    }

    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).slice(0, 300);
      if (res.status === 401 || res.status === 403) {
        throw new OllamaError(
          "auth",
          "Ollama rejected the API key. Check that OLLAMA_API_KEY is correct and active.",
          res.status,
        );
      }
      if (res.status === 429) {
        throw new OllamaError("rate_limit", "Ollama rate limit reached. Wait a moment and try again.", 429);
      }
      if (res.status === 404) {
        throw new OllamaError(
          "config",
          `Ollama could not find the model "${cfg.model}". Check OLLAMA_MODEL (hosted names have no ":cloud" suffix).`,
          404,
        );
      }
      throw new OllamaError("upstream", `Ollama returned HTTP ${res.status}. ${detail}`.trim(), res.status);
    }

    let data: unknown;
    try {
      data = await res.json();
    } catch {
      if (controller.signal.aborted) {
        throw new OllamaError("timeout", "The AI model took too long to respond. Please try again.");
      }
      throw new OllamaError("bad_response", "Ollama returned a response that was not valid JSON.");
    }

    const content = (data as { message?: { content?: unknown } })?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      throw new OllamaError("bad_response", "The model returned an empty response.");
    }
    return content;
  } finally {
    clearTimeout(timer);
  }
}

/** One chat call with a single retry for transient failures. */
export async function chat(opts: ChatOptions): Promise<string> {
  const started = Date.now();
  const attempt = async (o: ChatOptions) => {
    try {
      return await chatOnce(o);
    } catch (err) {
      // Some models reject `format`. Retry once without it.
      if (err instanceof OllamaError && o.json && err.upstreamStatus === 400) {
        return chatOnce({ ...o, json: false });
      }
      throw err;
    }
  };

  try {
    return await attempt(opts);
  } catch (err) {
    const transient =
      err instanceof OllamaError &&
      err.code === "upstream" &&
      (err.upstreamStatus === undefined || [500, 502, 503, 504].includes(err.upstreamStatus));
    const budget = (opts.timeoutMs ?? getConfig().timeoutMs) - (Date.now() - started);
    if (transient && budget > 4000) {
      await new Promise((r) => setTimeout(r, 700));
      return attempt({ ...opts, timeoutMs: budget - 700 });
    }
    throw err;
  }
}

/* -------------------------------------------------------------------------- */
/*  Structured output                                                         */
/* -------------------------------------------------------------------------- */

function extractJson(text: string): { ok: true; value: unknown } | { ok: false } {
  let t = text.trim();
  const fenced = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) t = fenced[1].trim();

  try {
    return { ok: true, value: JSON.parse(t) };
  } catch {
    /* fall through */
  }
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      return { ok: true, value: JSON.parse(t.slice(start, end + 1)) };
    } catch {
      /* fall through */
    }
  }
  return { ok: false };
}

function describeIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, 6)
    .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("; ");
}

/**
 * Ask the model for JSON and validate it against a zod schema.
 * If the output is malformed, the model is shown what was wrong and asked to
 * fix it (up to `maxAttempts` total tries, within an overall time budget).
 */
export async function generateJson<S extends z.ZodType>(
  schema: S,
  messages: ChatMessage[],
  opts: { temperature?: number; maxAttempts?: number; budgetMs?: number } = {},
): Promise<z.output<S>> {
  const maxAttempts = opts.maxAttempts ?? 3;
  const budgetMs = opts.budgetMs ?? 52_000;
  const started = Date.now();
  let convo = messages;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const remaining = budgetMs - (Date.now() - started);
    if (remaining < 3000) {
      throw new OllamaError("timeout", "The AI model took too long to respond. Please try again.");
    }

    const raw = await chat({
      messages: convo,
      temperature: opts.temperature,
      json: true,
      timeoutMs: remaining,
    });

    let problem: string;
    const extracted = extractJson(raw);
    if (extracted.ok) {
      const parsed = schema.safeParse(extracted.value);
      if (parsed.success) return parsed.data;
      problem = describeIssues(parsed.error);
    } else {
      problem = "The output was not valid JSON.";
    }

    console.warn(`[praxism] model output rejected (attempt ${attempt}/${maxAttempts}): ${problem}`);
    convo = [
      ...messages,
      { role: "assistant", content: raw.slice(0, 6000) },
      {
        role: "user",
        content: `Your previous reply was rejected: ${problem}\nReply again with ONLY the corrected JSON object, exactly in the requested shape. No prose, no markdown.`,
      },
    ];
  }

  throw new OllamaError(
    "bad_response",
    "The AI model did not return a usable response. Please try again.",
  );
}

/** Tiny round-trip used by GET /api/health?deep=1 */
export async function ping(): Promise<{ ok: true; ms: number }> {
  const started = Date.now();
  await chat({
    messages: [{ role: "user", content: "Reply with the single word: pong" }],
    temperature: 0,
    timeoutMs: 25_000,
  });
  return { ok: true, ms: Date.now() - started };
}
