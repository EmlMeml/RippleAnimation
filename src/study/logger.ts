import type { StudyEvent, StudyEventPayload, StudyEventType } from "./events";

const STORAGE_KEY = "ripple-study-events-v1";
const SESSION_KEY = "ripple-study-session-v1";
const PARTICIPANT_KEY = "ripple-study-participant-v1";
const FLUSH_DELAY_MS = 1_000;
const MAX_BATCH_SIZE = 20;

type ActiveWork = {
  inconsistencyId: string;
  workSessionId: string;
  source: string;
  activeStartedAt: number | null;
  activeDurationMs: number;
  interactionCount: number;
};

let sequenceNumber = 0;
let flushTimer: number | null = null;
let isFlushing = false;
let activeWork: ActiveWork | null = null;
let studyStartedLogged = false;
let studyCompletedLogged = false;

function storageAvailable(): boolean {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

function readQueue(): StudyEvent[] {
  if (!storageAvailable()) return [];
  try {
    const value = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function writeQueue(events: StudyEvent[]) {
  if (!storageAvailable()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
  } catch (error) {
    if (import.meta.env.DEV) console.warn("Study event could not be buffered", error);
  }
}

function getOrCreateSessionId(): string {
  if (!storageAvailable()) return crypto.randomUUID();
  const existing = window.sessionStorage.getItem(SESSION_KEY);
  if (existing) return existing;
  const created = crypto.randomUUID();
  window.sessionStorage.setItem(SESSION_KEY, created);
  return created;
}

function getParticipantCode(): string | null {
  if (!storageAvailable()) return null;
  return window.sessionStorage.getItem(PARTICIPANT_KEY)?.trim() || null;
}

function endpointConfig() {
  const url = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, "");
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  return url && key ? { endpoint: `${url}/rest/v1/study_events`, key } : null;
}

function scheduleFlush() {
  if (flushTimer !== null || typeof window === "undefined") return;
  flushTimer = window.setTimeout(() => {
    flushTimer = null;
    void flushStudyEvents();
  }, FLUSH_DELAY_MS);
}

export function setStudyParticipantCode(code: string | null) {
  if (!storageAvailable()) return;
  const normalized = code?.trim().slice(0, 40);
  if (normalized) window.sessionStorage.setItem(PARTICIPANT_KEY, normalized);
  else window.sessionStorage.removeItem(PARTICIPANT_KEY);
}

export async function completeStudyLogging(): Promise<boolean> {
  if (!studyCompletedLogged) {
    studyCompletedLogged = true;
    finishInconsistencyWork("study_completed");
    logStudyEvent("study_completed", { outcome: "completed" });
  }
  return flushAllStudyEvents();
}

export function logStudyEvent(
  eventType: StudyEventType,
  payload: StudyEventPayload = {}
): StudyEvent {
  const event: StudyEvent = {
    session_id: getOrCreateSessionId(),
    participant_code: getParticipantCode(),
    event_type: eventType,
    sequence_number: sequenceNumber++,
    client_timestamp: new Date().toISOString(),
    app_version: import.meta.env.VITE_APP_VERSION || null,
    payload,
  };

  if (
    activeWork &&
    payload.inconsistency_id === activeWork.inconsistencyId &&
    eventType !== "inconsistency_work_started" &&
    eventType !== "inconsistency_work_finished"
  ) {
    activeWork.interactionCount += 1;
  }

  writeQueue([...readQueue(), event]);
  scheduleFlush();
  return event;
}

export async function flushStudyEvents(): Promise<void> {
  const config = endpointConfig();
  if (!config || isFlushing) return;
  const queue = readQueue();
  if (queue.length === 0) return;

  isFlushing = true;
  const batch = queue.slice(0, MAX_BATCH_SIZE);
  try {
    const response = await fetch(config.endpoint, {
      method: "POST",
      headers: {
        apikey: config.key,
        Authorization: `Bearer ${config.key}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(batch),
      keepalive: true,
    });
    if (!response.ok) throw new Error(`Study logging failed (${response.status})`);
    writeQueue(readQueue().slice(batch.length));
  } catch (error) {
    if (import.meta.env.DEV) console.warn(error);
  } finally {
    isFlushing = false;
    if (readQueue().length > 0) scheduleFlush();
  }
}

async function flushAllStudyEvents(timeoutMs = 5_000): Promise<boolean> {
  if (!endpointConfig()) return false;
  const deadline = Date.now() + timeoutMs;

  while (readQueue().length > 0 && Date.now() < deadline) {
    if (isFlushing) {
      await new Promise((resolve) => window.setTimeout(resolve, 50));
      continue;
    }
    await flushStudyEvents();
    if (readQueue().length > 0) {
      await new Promise((resolve) => window.setTimeout(resolve, 250));
    }
  }

  return readQueue().length === 0;
}

function pauseActiveWork() {
  if (!activeWork?.activeStartedAt) return;
  activeWork.activeDurationMs += performance.now() - activeWork.activeStartedAt;
  activeWork.activeStartedAt = null;
}

function resumeActiveWork() {
  if (!activeWork || activeWork.activeStartedAt !== null) return;
  activeWork.activeStartedAt = performance.now();
}

export function startInconsistencyWork(inconsistencyId: string, source: string) {
  if (activeWork?.inconsistencyId === inconsistencyId) return;
  finishInconsistencyWork("selection_changed");
  activeWork = {
    inconsistencyId,
    workSessionId: crypto.randomUUID(),
    source,
    activeStartedAt: document.visibilityState === "visible" ? performance.now() : null,
    activeDurationMs: 0,
    interactionCount: 0,
  };
  logStudyEvent("inconsistency_work_started", {
    inconsistency_id: inconsistencyId,
    work_session_id: activeWork.workSessionId,
    source,
  });
}

export function finishInconsistencyWork(outcome: string) {
  if (!activeWork) return;
  pauseActiveWork();
  const finished = activeWork;
  activeWork = null;
  logStudyEvent("inconsistency_work_finished", {
    inconsistency_id: finished.inconsistencyId,
    work_session_id: finished.workSessionId,
    source: finished.source,
    outcome,
    duration_ms: Math.round(finished.activeDurationMs),
    interaction_count: finished.interactionCount,
  });
}

export function initializeStudyLogging(): () => void {
  const visibilityHandler = () => {
    if (document.visibilityState === "hidden") {
      pauseActiveWork();
      void flushStudyEvents();
    } else {
      resumeActiveWork();
    }
  };
  const pageHideHandler = () => {
    finishInconsistencyWork("page_closed");
    if (!studyCompletedLogged) {
      studyCompletedLogged = true;
      logStudyEvent("study_completed", { outcome: "page_closed" });
    }
    void flushStudyEvents();
  };

  document.addEventListener("visibilitychange", visibilityHandler);
  window.addEventListener("pagehide", pageHideHandler, { once: true });
  if (!studyStartedLogged) {
    studyStartedLogged = true;
    logStudyEvent("study_started", { path: window.location.pathname });
  }

  return () => {
    document.removeEventListener("visibilitychange", visibilityHandler);
    window.removeEventListener("pagehide", pageHideHandler);
    void flushStudyEvents();
  };
}
