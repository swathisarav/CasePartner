// Minimal PostgREST client over the Tauri HTTP plugin. supabase-js is
// deliberately avoided: this is three tables and five calls, and the plugin
// fetch keeps everything CORS-proof in packaged builds.
import { fetch } from "@tauri-apps/plugin-http";
import type { AppSettings } from "./settings";
import type { CaseData } from "../types/case";
import type { InterviewSession } from "../types/interview";
import type { ReviewData } from "../types/review";

const TIMEOUT_MS = 15_000;

export function supabaseConfigured(settings: AppSettings): boolean {
  return Boolean(settings.supabaseUrl.trim() && settings.supabaseAnonKey.trim());
}

async function rest(
  settings: AppSettings,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  pathAndQuery: string,
  body?: unknown,
  extraHeaders: Record<string, string> = {}
): Promise<unknown> {
  if (!supabaseConfigured(settings)) {
    throw new Error("Supabase is not configured (Setup tab)");
  }
  const base = settings.supabaseUrl.replace(/\/+$/, "");
  const res = await fetch(`${base}/rest/v1/${pathAndQuery}`, {
    method,
    headers: {
      apikey: settings.supabaseAnonKey,
      Authorization: `Bearer ${settings.supabaseAnonKey}`,
      "Content-Type": "application/json",
      ...extraHeaders,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Supabase ${method} ${pathAndQuery} failed (HTTP ${res.status}): ${text.slice(0, 300)}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

const UPSERT_HEADERS = { Prefer: "resolution=merge-duplicates" };

export async function upsertCase(settings: AppSettings, caseData: CaseData): Promise<void> {
  await rest(
    settings,
    "POST",
    "cases",
    [{ id: caseData.id, title: caseData.title, data: caseData, created_at: caseData.createdAt }],
    UPSERT_HEADERS
  );
}

export async function upsertSession(
  settings: AppSettings,
  caseData: CaseData,
  session: InterviewSession
): Promise<void> {
  // The session references the case; make sure the case row exists first so
  // the foreign key never fails (e.g. case saved before Supabase was set up).
  await upsertCase(settings, caseData);
  await rest(
    settings,
    "POST",
    "sessions",
    [
      {
        id: session.id,
        case_id: session.caseId,
        case_title: session.caseTitle,
        started_at: session.startedAt,
        ended_at: session.endedAt,
        status: session.status,
        data: session,
      },
    ],
    UPSERT_HEADERS
  );
}

export async function upsertReview(settings: AppSettings, review: ReviewData): Promise<void> {
  await rest(
    settings,
    "POST",
    "reviews",
    [
      {
        id: review.id,
        session_id: review.sessionId,
        case_id: review.caseId,
        data: review,
        created_at: review.createdAt,
      },
    ],
    UPSERT_HEADERS
  );
}

export interface SessionListItem {
  id: string;
  case_title: string;
  started_at: string;
  ended_at: string | null;
  status: string;
  reviews: { id: string }[];
}

export async function listSessions(settings: AppSettings): Promise<SessionListItem[]> {
  return (await rest(
    settings,
    "GET",
    "sessions?select=id,case_title,started_at,ended_at,status,reviews(id)&order=started_at.desc"
  )) as SessionListItem[];
}

export interface SessionDetail {
  id: string;
  case_id: string | null;
  data: InterviewSession;
  reviews: { id: string; data: ReviewData }[];
}

export async function getSessionDetail(
  settings: AppSettings,
  sessionId: string
): Promise<SessionDetail | null> {
  const rows = (await rest(
    settings,
    "GET",
    `sessions?id=eq.${sessionId}&select=id,case_id,data,reviews(id,data)`
  )) as SessionDetail[];
  return rows[0] ?? null;
}

export async function getCase(
  settings: AppSettings,
  caseId: string
): Promise<CaseData | null> {
  const rows = (await rest(
    settings,
    "GET",
    `cases?id=eq.${caseId}&select=data`
  )) as { data: CaseData }[];
  return rows[0]?.data ?? null;
}

export async function deleteSession(settings: AppSettings, sessionId: string): Promise<void> {
  await rest(settings, "DELETE", `sessions?id=eq.${sessionId}`);
}

/** All reviews, oldest first — the progress dashboard's data. */
export async function listReviews(
  settings: AppSettings
): Promise<{ created_at: string; data: ReviewData }[]> {
  return (await rest(
    settings,
    "GET",
    "reviews?select=created_at,data&order=created_at.asc"
  )) as { created_at: string; data: ReviewData }[];
}

/** Most recent review (optionally excluding one session's), for progress tracking. */
export async function getLatestReview(
  settings: AppSettings,
  excludeSessionId?: string
): Promise<ReviewData | null> {
  const filter = excludeSessionId ? `&session_id=neq.${excludeSessionId}` : "";
  const rows = (await rest(
    settings,
    "GET",
    `reviews?select=data&order=created_at.desc&limit=1${filter}`
  )) as { data: ReviewData }[];
  return rows[0]?.data ?? null;
}
