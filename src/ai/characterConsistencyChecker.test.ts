import { describe, expect, it } from "vitest";
import {
  checkExplicitCharacterContradictions,
  isCharacterConsistencyResponse,
  mergeCharacterInconsistencies,
  deduplicateCharacterInconsistencies,
  hasVerifiedCharacterEvidence,
  preserveTargetAfterModifierOnlyEdit,
  preserveTargetForDependentMemoryClaim,
  hasExplicitlyNegatedTargetMemoryClaim,
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

it("keeps a targeted memory issue open when only an adverb changes", () => {
  const target = {
    character: "Eve",
    category: "memory" as const,
    kind: "likely_contradiction" as const,
    confidence: "high" as const,
    message: "Eve contradicts her prior knowledge of the report.",
    explanation: "The later passage says she remembers authoring it.",
    evidence: [
      { paragraphIndex: 0, quote: "Eve had never seen the Bellwick drainage report.", interpretation: "She does not know it." },
      { paragraphIndex: 1, quote: "Eve clearly remembered writing and signing the Bellwick drainage report herself the previous winter.", interpretation: "She remembers authoring it." },
    ],
  };
  const text = [
    target.evidence[0].quote,
    "Eve definitly remembered writing and signing the Bellwick drainage report herself the previous winter.",
  ].join("\n");

  const preserved = preserveTargetAfterModifierOnlyEdit(target, text);
  expect(preserved).not.toBeNull();
  expect(preserved?.evidence[1].quote).toContain("definitly remembered writing");
});

it("keeps a memory issue open when a dependent sentence still claims recall", () => {
  const target = {
    character: "Sela",
    category: "memory" as const,
    kind: "likely_contradiction" as const,
    confidence: "high" as const,
    message: "Sela contradicts her earlier knowledge.",
    explanation: "She later remembers authoring the report.",
    evidence: [
      { paragraphIndex: 0, quote: "Sela had never seen the Harton equipment report.", interpretation: "She did not know the report." },
      { paragraphIndex: 1, quote: "Sela clearly remembered writing and signing the Harton equipment report herself the previous winter.", interpretation: "She remembers authoring it." },
    ],
  };
  const dependent = "She described its contents from memory while they waited for the coordinator to return it on Friday morning.";
  const text = [
    target.evidence[0].quote,
    `Sela clearly didn't remembered writing and signing the Harton equipment report herself the previous winter. ${dependent}`,
  ].join("\n");

  const preserved = preserveTargetForDependentMemoryClaim(target, text);
  expect(preserved).not.toBeNull();
  expect(preserved?.evidence.at(-1)?.quote).toBe(dependent);
});

it("treats an explicitly negated memory claim as corrected despite verb inflection", () => {
  const target = {
    character: "Eve",
    category: "memory" as const,
    kind: "likely_contradiction" as const,
    confidence: "high" as const,
    message: "Eve contradicts her earlier knowledge.",
    explanation: "She later remembers authoring the report.",
    evidence: [
      { paragraphIndex: 0, quote: "Eve had never seen the Bellwick drainage report.", interpretation: "She did not know it." },
      { paragraphIndex: 1, quote: "Eve clearly remembered writing and signing the Bellwick drainage report herself the previous winter.", interpretation: "She remembers authoring it." },
    ],
  };
  const corrected = [
    target.evidence[0].quote,
    "Eve didn't remembered writing and signing the Bellwick drainage report herself the previous winter.",
  ].join("\n");

  expect(hasExplicitlyNegatedTargetMemoryClaim(target, corrected)).toBe(true);
  expect(preserveTargetForDependentMemoryClaim(target, corrected)).toBeNull();
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

it("does not accumulate reclassified versions across repeated checks", () => {
  const [original] = checkExplicitCharacterContradictions("Alice never trusted Bob.\nAlice always trusted Bob.");
  const variant = { ...original, character: " alice ", category: "memory" as const,
    kind: "possible_ambiguity" as const, message: "Different wording" };
  let results = [original];
  for (let run = 0; run < 3; run++) {
    results = deduplicateCharacterInconsistencies([...results, variant]);
  }
  expect(results).toEqual([original]);
  expect(mergeCharacterInconsistencies([original], [variant])).toEqual([original]);
});

it("keeps separate conflicts and characters even in the same paragraphs", () => {
  const [original] = checkExplicitCharacterContradictions("Alice never trusted Bob.\nAlice always trusted Bob.");
  const separate = { ...original, evidence: original.evidence.map((item) => ({ ...item, quote: "Another claim entirely." })) };
  const otherCharacter = { ...original, character: "Eve" };
  expect(deduplicateCharacterInconsistencies([original, separate, otherCharacter])).toHaveLength(3);
});

it("requires every character quote to exist in its referenced current paragraph", () => {
  const text = "Alice never trusted Bob.\nAlice always trusted Bob.";
  const [issue] = checkExplicitCharacterContradictions(text);
  expect(hasVerifiedCharacterEvidence(issue, text)).toBe(true);
  expect(hasVerifiedCharacterEvidence(issue, "Alice trusted Eve.\nAlice always trusted Bob.")).toBe(false);
  expect(hasVerifiedCharacterEvidence({ ...issue, evidence: issue.evidence.map((item) => ({ ...item, paragraphIndex: 90 })) }, text)).toBe(false);
  expect(hasVerifiedCharacterEvidence({ ...issue, evidence: [] }, text)).toBe(false);
});
