import { describe, expect, it } from "vitest";
import { isCharacterConsistencyResponse } from "./characterConsistencyChecker";

describe("isCharacterConsistencyResponse", () => {
  it("accepts a valid result", () => {
    expect(isCharacterConsistencyResponse({ inconsistencies: [{
      character: "Mara", category: "belief", kind: "unexplained_shift",
      confidence: "high", message: "Her belief changes abruptly.",
      explanation: "No transition is shown.",
      evidence: [{ paragraphIndex: 1, quote: "I trust nobody.", interpretation: "Establishes distrust." }],
    }] })).toBe(true);
  });

  it("rejects invented categories and malformed evidence", () => {
    expect(isCharacterConsistencyResponse({ inconsistencies: [{
      character: "Mara", category: "appearance", kind: "unexplained_shift",
      confidence: "high", message: "x", explanation: "x", evidence: [],
    }] })).toBe(false);
  });
});
