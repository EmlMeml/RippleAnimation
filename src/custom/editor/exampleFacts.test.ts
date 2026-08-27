import { describe, expect, it } from "vitest";
import { checkConsistency } from "../../ai/consistencyChecker";
import { EXAMPLE_FACTS } from "./exampleFacts";

describe("EXAMPLE_FACTS", () => {
  it("produces three focused factual inconsistencies", () => {
    const inconsistencies = checkConsistency(EXAMPLE_FACTS);

    expect(inconsistencies).toHaveLength(3);
    expect(inconsistencies.map(({ impact }) => impact).sort()).toEqual([
      "character",
      "local",
      "world",
    ]);
    expect(inconsistencies.some(({ severity }) => severity === "critical")).toBe(true);
  });
});
