import type { FactExtraction } from "../types/facts";

const AI_ENDPOINT =
  "https://small-hill-7bd7.ripple-ai.workers.dev/api/chat";
const AI_REQUEST_TIMEOUT_MS = 600_000;

interface AIResponse {
  response?: FactExtraction;
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
