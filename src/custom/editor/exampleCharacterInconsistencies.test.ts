import { describe, expect, it } from "vitest";
import { isCharacterConsistencyResponse } from "../../ai/characterConsistencyChecker";
import { EXAMPLE_CHARACTER_INCONSISTENCIES } from "./exampleCharacterInconsistencies";

describe("EXAMPLE_CHARACTER_INCONSISTENCIES", () => {
  it("contains three valid precomputed character inconsistencies", () => {
    expect(EXAMPLE_CHARACTER_INCONSISTENCIES).toHaveLength(3);
    expect(isCharacterConsistencyResponse({
      inconsistencies: EXAMPLE_CHARACTER_INCONSISTENCIES,
    })).toBe(true);
  });
});
