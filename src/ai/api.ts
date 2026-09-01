import type { FactExtraction } from "../types/facts";

const AI_ENDPOINT =
  "https://small-hill-7bd7.ripple-ai.workers.dev/api/chat";
const AI_REQUEST_TIMEOUT_MS = 600_000;

interface AIResponse {
  response?: FactExtraction;
}

interface StructuredAIResponse<T> {
  response?: T;
}

interface StructuredAIErrorResponse {
  raw?: unknown;
}

function isLegacyFactExtraction(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { entities?: unknown; facts?: unknown };
  return Array.isArray(candidate.entities) && Array.isArray(candidate.facts);
}

/** Sends a prompt whose JSON response is validated by the caller. */
export async function askAIStructured<T>(
  prompt: string,
  validate: (value: unknown) => value is T
): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), AI_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(AI_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, responseType: "character_consistency" }),
      signal: controller.signal,
    });

    const responseText = await response.text();

    if (!response.ok) {
      /*
       * The current worker still validates every model response against the
       * legacy FactExtraction schema. For other explicitly validated response
       * types it returns the parsed model output as `raw` in a 502 response.
       * Accept that value only when this caller's validator confirms it.
       */
      let errorData: StructuredAIErrorResponse | undefined;
      try {
        errorData = JSON.parse(responseText) as StructuredAIErrorResponse;
      } catch {
        // The regular request error below contains the original response text.
      }
      const rawResponse = errorData?.raw;
      if (validate(rawResponse)) return rawResponse;
      if (isLegacyFactExtraction(rawResponse)) {
        throw new Error(
          "The AI backend returned the legacy fact-extraction format for the character consistency request. The worker must support a separate character-consistency response schema."
        );
      }

      throw new Error(`AI request failed: ${response.status} ${responseText}`);
    }

    const data = JSON.parse(responseText) as StructuredAIResponse<unknown>;
    if (!validate(data.response)) {
      throw new Error("AI returned an empty or malformed structured response.");
    }
    return data.response;
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(
        `AI request timed out after ${AI_REQUEST_TIMEOUT_MS / 1000} seconds.`,
        { cause: error }
      );
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function askAI(
  prompt: string
): Promise<FactExtraction> {
  const start = performance.now();
  const controller = new AbortController();
  const timeout = window.setTimeout(
    () => controller.abort(),
    AI_REQUEST_TIMEOUT_MS
  );

  console.log("[AI] Request startet");

  try {
    const response = await fetch(AI_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prompt }),
      signal: controller.signal,
    });
    console.log(
      `[AI] fetch fertig: ${((performance.now() - start) / 1000).toFixed(2)}s`
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `AI request failed: ${response.status} ${errorText}`
      );
    }

    const data = await response.json() as AIResponse;

    if (
      !data.response ||
      !Array.isArray(data.response.entities) ||
      !Array.isArray(data.response.facts)
    ) {
      console.error("[AI] Ungültige oder leere Antwort", data);
      throw new Error("AI returned an empty or malformed extraction response.");
    }

    console.log(
      `[AI] Gesamtzeit: ${((performance.now() - start) / 1000).toFixed(2)}s`
    );

    return data.response;
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(
        `AI request timed out after ${AI_REQUEST_TIMEOUT_MS / 1000} seconds.`
      );
    }

    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}
