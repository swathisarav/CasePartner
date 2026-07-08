// All requests go through the Tauri HTTP plugin (Rust side) rather than the
// webview's fetch: WebView2's `tauri.localhost` origin is not in Ollama's
// default CORS allowlist, so browser-side fetch would break in packaged builds.
import { fetch } from "@tauri-apps/plugin-http";
import type { AppSettings } from "./settings";

export type CheckStatus = "ok" | "fail" | "skipped";

export interface CheckResult {
  status: CheckStatus;
  detail: string;
}

const TIMEOUT_MS = 8000;

export interface OllamaHealth {
  server: CheckResult;
  parseModel: CheckResult;
  interviewModel: CheckResult;
}

export async function checkOllama(settings: AppSettings): Promise<OllamaHealth> {
  const base = settings.ollamaUrl.replace(/\/+$/, "");
  let tags: { models?: { name: string }[] };
  try {
    const res = await fetch(`${base}/api/tags`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      const fail: CheckResult = {
        status: "fail",
        detail: `Ollama responded with HTTP ${res.status}`,
      };
      const skipped: CheckResult = { status: "skipped", detail: "Server check failed" };
      return { server: fail, parseModel: skipped, interviewModel: skipped };
    }
    tags = await res.json();
  } catch (e) {
    const skipped: CheckResult = { status: "skipped", detail: "Server check failed" };
    return {
      server: {
        status: "fail",
        detail: `Cannot reach Ollama at ${base} — is \`ollama serve\` running? (${errMsg(e)})`,
      },
      parseModel: skipped,
      interviewModel: skipped,
    };
  }

  const available = (tags.models ?? []).map((m) => m.name);
  const server: CheckResult = {
    status: "ok",
    detail: `Ollama reachable at ${base} (${available.length} model${available.length === 1 ? "" : "s"} installed)`,
  };
  return {
    server,
    parseModel: modelCheck(available, settings.ollamaParseModel, settings.ollamaFallbackModel),
    interviewModel: modelCheck(
      available,
      settings.ollamaInterviewModel,
      settings.ollamaFallbackModel
    ),
  };
}

function modelCheck(available: string[], wanted: string, fallback: string): CheckResult {
  if (hasModel(available, wanted)) {
    return { status: "ok", detail: `${wanted} is installed` };
  }
  if (fallback && hasModel(available, fallback)) {
    return {
      status: "ok",
      detail: `${wanted} not installed, will use fallback ${fallback}`,
    };
  }
  return {
    status: "fail",
    detail: `Neither ${wanted} nor fallback is installed. Run: ollama pull ${wanted}`,
  };
}

/** Model names may or may not carry a tag (e.g. "qwen2.5:14b-instruct" vs "qwen2.5"). */
export function hasModel(available: string[], wanted: string): boolean {
  return available.some((name) => name === wanted || name.split(":")[0] === wanted);
}

export async function checkSupabase(settings: AppSettings): Promise<CheckResult> {
  const url = settings.supabaseUrl.replace(/\/+$/, "");
  const key = settings.supabaseAnonKey;
  if (!url || !key) {
    return {
      status: "skipped",
      detail: "Supabase URL / anon key not configured yet — fill them in and save",
    };
  }
  try {
    const res = await fetch(`${url}/auth/v1/health`, {
      headers: { apikey: key },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.ok) {
      return { status: "ok", detail: `Supabase project reachable at ${url}` };
    }
    if (res.status === 401 || res.status === 403) {
      return { status: "fail", detail: "Supabase reachable but the anon key was rejected" };
    }
    return { status: "fail", detail: `Supabase responded with HTTP ${res.status}` };
  } catch (e) {
    return { status: "fail", detail: `Cannot reach Supabase at ${url} (${errMsg(e)})` };
  }
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
