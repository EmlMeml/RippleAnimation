import { describe, expect, it } from "vitest";
import { checkConsistency } from "../../ai/consistencyChecker";
import { EXAMPLE_FACTS, SECOND_EXAMPLE_FACTS } from "./exampleFacts";

describe("EXAMPLE_FACTS", () => {
  it.each([
    ["Bellwick", EXAMPLE_FACTS],
    ["Harton", SECOND_EXAMPLE_FACTS],
  ])("produces the two focused factual inconsistencies for %s", (_, facts) => {
    const inconsistencies = checkConsistency(facts);

    expect(inconsistencies).toHaveLength(2);
    expect(inconsistencies.map(({ predicate }) => predicate).sort()).toEqual([
      "age",
      "born_in",
    ]);
  });
});
