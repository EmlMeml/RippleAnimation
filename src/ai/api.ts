import type { FactExtraction } from "../types/facts";

const AI_ENDPOINT =
  "https://small-hill-7bd7.ripple-ai.workers.dev/api/chat";

interface AIResponse {
  response: FactExtraction;
}

export async function askAI(
  prompt: string
): Promise<FactExtraction> {
  const response = await fetch(AI_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();

    throw new Error(
      `AI request failed: ${response.status} ${errorText}`
    );
  }

  const data = await response.json() as AIResponse;

  return data.response;
}
