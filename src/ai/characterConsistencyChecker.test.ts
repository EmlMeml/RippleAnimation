import { describe, expect, it } from "vitest";
import {
  checkExplicitCharacterContradictions,
  isCharacterConsistencyResponse,
  mergeCharacterInconsistencies,
} from "./characterConsistencyChecker";

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

it("detects an explicit never/always contradiction without AI", () => {
  const text = [
    "Alice had never trusted Bob, not even as a child.",
    "Alice remembered the funeral. She had always trusted him completely.",
  ].join("\n");

  const result = checkExplicitCharacterContradictions(text);
  expect(result).toHaveLength(1);
  expect(result[0]).toMatchObject({ character: "Alice", confidence: "high" });
  expect(result[0].evidence.map((item) => item.paragraphIndex)).toEqual([0, 1]);
});

it("detects conflicting lifelong beliefs attributed to the same speaker", () => {
  const text = [
    "Eve replied, “I don’t believe in fate.”",
    "Eve laughed. “I’ve believed all my life that everything happens as meant.”",
  ].join("\n");

  const result = checkExplicitCharacterContradictions(text);
  expect(result).toHaveLength(1);
  expect(result[0].character).toBe("Eve");
});

it("does not duplicate an AI result covering the deterministic evidence", () => {
  const deterministic = checkExplicitCharacterContradictions([
    "Alice never trusted Bob.",
    "Alice always trusted Bob.",
  ].join("\n"));
  const aiResult = [{
    ...deterministic[0],
    message: "AI wording",
  }];

  expect(mergeCharacterInconsistencies(deterministic, aiResult)).toHaveLength(1);
});

it("filters age discrepancies out of character inconsistencies", () => {
  const ageIssue = {
    character: "Alice",
    category: "values_and_self_image" as const,
    kind: "likely_contradiction" as const,
    confidence: "high" as const,
    message: "Alice gives two different ages.",
    explanation: "She is first 32 and later says she turned twenty-nine.",
    evidence: [{ paragraphIndex: 1, quote: "At thirty-two", interpretation: "States her age." }],
  };

  expect(mergeCharacterInconsistencies([], [ageIssue])).toEqual([]);
});
