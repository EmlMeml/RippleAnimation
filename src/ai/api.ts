import type { FactExtraction } from "../types/facts";

const AI_ENDPOINT =
  "https://small-hill-7bd7.ripple-ai.workers.dev/api/chat";

interface AIResponse {
  response: FactExtraction;
}

export async function askAI(
  prompt: string
): Promise<FactExtraction> {
  const start = performance.now();
  console.log("[AI] Request startet");
  const response = await fetch(AI_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt,
    }),
  });
  console.log(
    `[AI] fetch fertig: ${((performance.now() - start) / 1000).toFixed(2)}s`
  );

  if (!response.ok) {
    console.log("vor response");
    const errorText = await response.text();
    console.log("nach response");
    throw new Error(
      `AI request failed: ${response.status} ${errorText}`
    );
  }
  
  console.log("[AI] vor json");
  const jsonStart = performance.now();
  const data = await response.json() as AIResponse;

  console.log(
    `[AI] JSON parsing: ${((performance.now() - jsonStart) / 1000).toFixed(2)}s`
  );

  console.log(
    `[AI] Gesamtzeit: ${((performance.now() - start) / 1000).toFixed(2)}s`
  );

  return data.response;
}
