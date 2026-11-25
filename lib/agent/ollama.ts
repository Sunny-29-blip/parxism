import { z } from "zod";

/**
 * Everything that talks to the AI provider (Gemini or Ollama) lives in this file.
 * API keys are read from process.env on the server only.
 */

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type AiProvider = "gemini" | "ollama";

export type OllamaErrorCode =
  | "config" //       missing / invalid server configuration
  | "auth" //         provider rejected the API key
  | "rate_limit" //   provider said slow down (429)
  | "timeout" //      took too long
  | "upstream" //     provider is down / returned an error
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
  const ollamaBaseUrl = (process.env.OLLAMA_BASE_URL || "https://ollama.com").replace(/\/+$/, "");
  const isLocalOllama = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(ollamaBaseUrl);
  const geminiApiKey = (process.env.GEMINI_API_KEY || "").trim();
  const ollamaApiKey = (process.env.OLLAMA_API_KEY || "").trim();

  // Explicit OLLAMA_BASE_URL (e.g. local mock-ollama) keeps Ollama active; otherwise use Gemini when configured.
  const useGemini = Boolean(geminiApiKey) && !process.env.OLLAMA_BASE_URL;
  const provider: AiProvider = useGemini ? "gemini" : "ollama";

  return {
    provider,
    apiKey: provider === "gemini" ? geminiApiKey : ollamaApiKey,
    model:
      provider === "gemini"
        ? (process.env.GEMINI_MODEL || "gemini-3.5-flash").trim().replace(/^models\//, "")
        : (process.env.OLLAMA_MODEL || "gpt-oss:120b").trim(),
    baseUrl:
      provider === "gemini"
        ? (process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com").replace(/\/+$/, "")
        : ollamaBaseUrl,
    isLocal: provider === "ollama" && isLocalOllama,
    timeoutMs: Number(process.env.AI_TIMEOUT_MS || process.env.OLLAMA_TIMEOUT_MS) || 40_000,
  };
}

type ChatOptions = {
  messages: ChatMessage[];
  temperature?: number;
  /** Ask the model for JSON-only output. */
  json?: boolean;
  timeoutMs?: number;
};

/** Send a JSON POST request to the configured provider and map HTTP/network errors uniformly. */
async function postProviderJson(
  providerLabel: string,
  envKeyName: string,
  modelHint: string,
  url: string,
  headers: Record<string, string>,
  body: Record<string, unknown>,
  signal: AbortSignal,
): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal,
      cache: "no-store",
    });
  } catch {
    if (signal.aborted) {
      throw new OllamaError("timeout", "The AI model took too long to respond. Please try again.");
    }
    throw new OllamaError("upstream", `Could not reach the ${providerLabel} API. Please try again.`);
  }

  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 300);
    if (res.status === 401 || res.status === 403 || detail.includes("API_KEY_INVALID")) {
      throw new OllamaError(
        "auth",
        `${providerLabel} rejected the API key. Check that ${envKeyName} is correct and active.`,
        res.status,
      );
    }
    if (res.status === 429) {
      throw new OllamaError(
        "rate_limit",
        `${providerLabel} rate limit reached. Wait a moment and try again.`,
        429,
      );
    }
    if (res.status === 404) {
      throw new OllamaError("config", modelHint, 404);
    }
    throw new OllamaError("upstream", `${providerLabel} returned HTTP ${res.status}. ${detail}`.trim(), res.status);
  }

  try {
    return await res.json();
  } catch {
    if (signal.aborted) {
      throw new OllamaError("timeout", "The AI model took too long to respond. Please try again.");
    }
    throw new OllamaError("bad_response", `${providerLabel} returned a response that was not valid JSON.`);
  }
}

async function chatOnceGemini(
  cfg: ReturnType<typeof getConfig>,
  opts: ChatOptions,
  signal: AbortSignal,
): Promise<string> {
  const systemText = opts.messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n")
    .trim();

  const contents = opts.messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

  const body: Record<string, unknown> = {
    contents,
    generationConfig: {
      temperature: opts.temperature ?? 0.4,
      ...(opts.json ? { responseMimeType: "application/json" } : {}),
    },
  };
  if (systemText) {
    body.systemInstruction = { parts: [{ text: systemText }] };
  }

  const data = await postProviderJson(
    "Gemini",
    "GEMINI_API_KEY",
    `Gemini could not find the model "${cfg.model}". Check GEMINI_MODEL.`,
    `${cfg.baseUrl}/v1beta/models/${encodeURIComponent(cfg.model)}:generateContent`,
    { "x-goog-api-key": cfg.apiKey },
    body,
    signal,
  );

  const parts = (data as { candidates?: Array<{ content?: { parts?: Array<{ text?: unknown; thought?: boolean }> } }> })
    ?.candidates?.[0]?.content?.parts;
  const content = Array.isArray(parts)
    ? parts
        .filter((p) => !p.thought && typeof p.text === "string")
        .map((p) => p.text as string)
        .join("")
    : "";

  if (!content.trim()) {
    throw new OllamaError("bad_response", "The model returned an empty response.");
  }
  return content;
}

async function chatOnceOllama(
  cfg: ReturnType<typeof getConfig>,
  opts: ChatOptions,
  signal: AbortSignal,
): Promise<string> {
  const body: Record<string, unknown> = {
    model: cfg.model,
    messages: opts.messages,
    stream: false,
    options: { temperature: opts.temperature ?? 0.4 },
  };
  if (opts.json) body.format = "json";

  const data = await postProviderJson(
    "Ollama",
    "OLLAMA_API_KEY",
    `Ollama could not find the model "${cfg.model}". Check OLLAMA_MODEL (hosted names have no ":cloud" suffix).`,
    `${cfg.baseUrl}/api/chat`,
    cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {},
    body,
    signal,
  );

  const content = (data as { message?: { content?: unknown } })?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new OllamaError("bad_response", "The model returned an empty response.");
  }
  return content;
}

async function chatOnce(opts: ChatOptions): Promise<string> {
  const cfg = getConfig();

  if (!cfg.apiKey && !cfg.isLocal) {
    throw new OllamaError(
      "config",
      "The server is missing GEMINI_API_KEY (or OLLAMA_API_KEY). Add it in your environment variables (Vercel: Project Settings → Environment Variables) and redeploy.",
    );
  }

  const controller = new AbortController();
  const timeout = Math.max(1000, Math.min(opts.timeoutMs ?? cfg.timeoutMs, cfg.timeoutMs));
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    return cfg.provider === "gemini"
      ? await chatOnceGemini(cfg, opts, controller.signal)
      : await chatOnceOllama(cfg, opts, controller.signal);
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
