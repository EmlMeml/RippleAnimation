import { createClient } from "npm:@supabase/supabase-js@2";

const MAX_BATCH_SIZE = 20;
const MAX_PAYLOAD_BYTES = 16_384;
const MAX_EVENTS_PER_SESSION_PER_MINUTE = 300;

const ALLOWED_EVENT_TYPES = new Set([
  "study_started",
  "document_loaded",
  "analysis_started",
  "analysis_finished",
  "inconsistency_selected",
  "editor_marker_clicked",
  "editor_marker_hovered",
  "navigation_marker_clicked",
  "navigation_marker_hovered",
  "context_preview_clicked",
  "card_interaction",
  "inconsistency_work_started",
  "inconsistency_work_finished",
  "suggestion_accepted",
  "suggestion_rejected",
  "manual_edit_finished",
  "undo",
  "study_completed",
  "error",
]);

type EventInput = {
  session_id: string;
  participant_code: string | null;
  event_type: string;
  sequence_number: number;
  client_timestamp: string;
  app_version: string | null;
  payload: Record<string, unknown>;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function allowedOrigins(): Set<string> {
  return new Set(
    (Deno.env.get("ALLOWED_ORIGINS") ?? "http://localhost:5173")
      .split(",")
      .map((origin) => origin.trim().replace(/\/$/, ""))
      .filter(Boolean)
  );
}

function corsHeaders(origin: string | null): HeadersInit {
  return {
    "Access-Control-Allow-Origin": origin ?? "null",
    "Access-Control-Allow-Headers": "apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function jsonResponse(status: number, body: Record<string, unknown>, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
  });
}

function isSafePayload(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  if (new TextEncoder().encode(JSON.stringify(value)).length > MAX_PAYLOAD_BYTES) return false;
  return Object.values(value).every((item) =>
    item === null ||
    ["string", "number", "boolean"].includes(typeof item) ||
    (Array.isArray(item) && item.every((entry) =>
      entry === null || ["string", "number", "boolean"].includes(typeof entry)
    ))
  );
}

function validateEvent(value: unknown): value is EventInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const event = value as Partial<EventInput>;
  return (
    typeof event.session_id === "string" && UUID_PATTERN.test(event.session_id) &&
    (event.participant_code === null || (
      typeof event.participant_code === "string" &&
      event.participant_code.length >= 1 &&
      event.participant_code.length <= 40
    )) &&
    typeof event.event_type === "string" && ALLOWED_EVENT_TYPES.has(event.event_type) &&
    Number.isInteger(event.sequence_number) && Number(event.sequence_number) >= 0 &&
    typeof event.client_timestamp === "string" &&
    Number.isFinite(Date.parse(event.client_timestamp)) &&
    (event.app_version === null || (
      typeof event.app_version === "string" && event.app_version.length <= 100
    )) &&
    isSafePayload(event.payload)
  );
}

function validPublishableKey(requestKey: string | null): boolean {
  if (!requestKey) return false;
  try {
    const configured = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}") as Record<string, string>;
    if (Object.values(configured).includes(requestKey)) return true;
  } catch {
    // Fall through to the legacy key for local and older projects.
  }
  return requestKey === Deno.env.get("SUPABASE_ANON_KEY");
}

Deno.serve(async (request) => {
  const requestOrigin = request.headers.get("Origin")?.replace(/\/$/, "") ?? null;
  const originAllowed = requestOrigin !== null && allowedOrigins().has(requestOrigin);

  if (request.method === "OPTIONS") {
    return originAllowed
      ? new Response(null, { status: 204, headers: corsHeaders(requestOrigin) })
      : new Response(null, { status: 403 });
  }

  if (request.method !== "POST") return jsonResponse(405, { error: "Method not allowed" }, requestOrigin);
  if (!originAllowed) return jsonResponse(403, { error: "Origin not allowed" }, requestOrigin);
  if (!validPublishableKey(request.headers.get("apikey"))) {
    return jsonResponse(401, { error: "Invalid API key" }, requestOrigin);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(400, { error: "Invalid JSON" }, requestOrigin);
  }

  if (!Array.isArray(body) || body.length < 1 || body.length > MAX_BATCH_SIZE) {
    return jsonResponse(400, { error: `Expected 1-${MAX_BATCH_SIZE} events` }, requestOrigin);
  }
  if (!body.every(validateEvent)) {
    return jsonResponse(400, { error: "Invalid study event" }, requestOrigin);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(500, { error: "Function is not configured" }, requestOrigin);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const since = new Date(Date.now() - 60_000).toISOString();
  const sessionIds = [...new Set(body.map((event) => event.session_id))];

  for (const sessionId of sessionIds) {
    const incomingCount = body.filter((event) => event.session_id === sessionId).length;
    const { count, error } = await admin
      .from("study_events")
      .select("id", { count: "exact", head: true })
      .eq("session_id", sessionId)
      .gte("received_at", since);
    if (error) return jsonResponse(500, { error: "Rate-limit check failed" }, requestOrigin);
    if ((count ?? 0) + incomingCount > MAX_EVENTS_PER_SESSION_PER_MINUTE) {
      return jsonResponse(429, { error: "Rate limit exceeded" }, requestOrigin);
    }
  }

  const { error } = await admin
    .from("study_events")
    .upsert(body, { onConflict: "session_id,sequence_number", ignoreDuplicates: true });
  if (error) return jsonResponse(500, { error: "Event storage failed" }, requestOrigin);
  return new Response(null, { status: 204, headers: corsHeaders(requestOrigin) });
});
