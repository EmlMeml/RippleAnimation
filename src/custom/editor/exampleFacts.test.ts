import { describe, expect, it } from "vitest";
import { checkConsistency } from "../../ai/consistencyChecker";
import { EXAMPLE_FACTS } from "./exampleFacts";

describe("EXAMPLE_FACTS", () => {
  it("produces every impact scope and a critical inconsistency", () => {
    const inconsistencies = checkConsistency(EXAMPLE_FACTS);

    expect(inconsistencies).toHaveLength(5);
    expect(inconsistencies.map(({ impact }) => impact).sort()).toEqual([
      "character",
      "character",
      "local",
      "relationship",
      "world",
    ]);
    expect(inconsistencies.some(({ severity }) => severity === "critical")).toBe(true);
  });
});
