import { describe, expect, it } from "vitest";
import { checkConsistency } from "../../ai/consistencyChecker";
import { EXAMPLE_FACTS } from "./exampleFacts";
import { reconcileReevaluation } from "./reconcileReevaluation";

describe("reconcileReevaluation", () => {
  const original = checkConsistency(EXAMPLE_FACTS);
  const location = original.find((issue) => issue.predicate === "located_in")!;
  const others = original.filter((issue) => issue !== location);

  it("keeps the Location card and its identity when rechecking omits it with open passages", () => {
    expect(location).toBeDefined();
    const result = reconcileReevaluation(others, location, undefined, 2);
    expect(result).toEqual([...others, location]);
    expect(result.at(-1)).toBe(location);
    expect(others).not.toContain(location);
  });

  it("allows resolution when no affected passages remain", () => {
    expect(reconcileReevaluation(others, location, undefined, 0)).toBe(others);
  });

  it("uses refreshed evidence without adding the old card again", () => {
    const refreshed = { ...location, facts: location.facts.slice(0, 1) };
    const detected = [...others, refreshed];
    expect(reconcileReevaluation(detected, location, refreshed, 2)).toBe(detected);
  });

  it("leaves an untargeted analysis unchanged", () => {
    expect(reconcileReevaluation(others, undefined, undefined, 2)).toBe(others);
  });
});
