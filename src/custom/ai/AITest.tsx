import { useState } from "react";
import { askAI } from "../../ai/api";
import type { FactExtraction } from "../../types/facts";

export default function AITest() {
  const [prompt, setPrompt] = useState(
    "Anna is 27 years old. Her brother Thomas is 30 years old. Thomas is Anna's younger brother."
  );

  const [answer, setAnswer] =
    useState<FactExtraction | null>(null);

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState("");

  async function handleAsk() {
    setLoading(true);
    setAnswer(null);
    setError("");

    try {
      const result = await askAI(prompt);

      console.log("AI result:", result);

      setAnswer(result);
    } catch (err) {
      console.error(err);

      setError(
        err instanceof Error
          ? err.message
          : "Unknown error"
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h1>AI Test</h1>

      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={10}
        style={{ width: "100%" }}
      />

      <button
        onClick={handleAsk}
        disabled={loading || !prompt.trim()}
      >
        {loading ? "Analyzing..." : "Analyze text"}
      </button>

      {error && (
        <p>
          Error: {error}
        </p>
      )}

      {answer && (
        <div>
          <h2>Extracted Facts</h2>

          <pre>
            {JSON.stringify(answer, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}