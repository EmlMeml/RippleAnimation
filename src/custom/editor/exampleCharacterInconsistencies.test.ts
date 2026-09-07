import { describe, expect, it } from "vitest";
import { isCharacterConsistencyResponse } from "../../ai/characterConsistencyChecker";
import {
  EXAMPLE_CHARACTER_INCONSISTENCIES,
  SECOND_EXAMPLE_CHARACTER_INCONSISTENCIES,
} from "./exampleCharacterInconsistencies";

describe("EXAMPLE_CHARACTER_INCONSISTENCIES", () => {
  it.each([
    ["Bellwick", EXAMPLE_CHARACTER_INCONSISTENCIES],
    ["Harton", SECOND_EXAMPLE_CHARACTER_INCONSISTENCIES],
  ])("contains two valid precomputed character inconsistencies for %s", (_, inconsistencies) => {
    expect(inconsistencies).toHaveLength(2);
    expect(inconsistencies.map(({ category }) => category).sort()).toEqual(["belief", "memory"]);
    expect(isCharacterConsistencyResponse({ inconsistencies })).toBe(true);
  });
});
