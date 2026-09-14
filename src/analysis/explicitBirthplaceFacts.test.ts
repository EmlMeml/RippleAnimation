import { describe, expect, it } from "vitest";
import { addMissingExplicitBirthplaceFacts, explicitBirthplaceClaims } from "./explicitBirthplaceFacts";
import { checkConsistency } from "../ai/consistencyChecker";
import { EXAMPLE_TEXT } from "../custom/editor/exampleText";

const entities = [{ id: "alice", name: "Alice", type: "person" as const }];

describe("explicit birthplace facts", () => {
  it("retains Bellwick/Marston after the reported age typo even when AI omits all birthplace facts", () => {
    const text = EXAMPLE_TEXT.replace("thirty-two", "Thirthy-three");
    const result = addMissingExplicitBirthplaceFacts(text, { entities, facts: [] });
    expect(result.facts.map((fact) => fact.object)).toEqual(["bellwick", "marston"]);
    expect(checkConsistency(result)).toEqual(expect.arrayContaining([
      expect.objectContaining({ predicate: "born_in", subject: "alice" }),
    ]));
    for (const fact of result.facts) {
      expect(text.slice(fact.source!.start, fact.source!.end)).toContain("Alice was born in");
    }
  });

  it("does not retain an old contradiction after the birthplace is actually corrected", () => {
    const result = addMissingExplicitBirthplaceFacts(
      "Alice was born in Bellwick.\nAlice was born in Bellwick.", { entities, facts: [] },
    );
    expect(checkConsistency(result)).toEqual([]);
  });

  it("reuses entity IDs and does not duplicate extracted facts", () => {
    const original = { entities: [...entities, { id: "place-1", name: "New York", type: "place" as const }],
      facts: [{ subject: "alice", predicate: "born_in" as const, object: "place-1", source: { paragraphIndex: 0 } }] };
    const result = addMissingExplicitBirthplaceFacts("Alice was born in New York.", original);
    expect(result).toEqual(original);
    expect(result).not.toBe(original);
  });

  it.each([
    "Alice was not born in Bellwick.",
    "Maybe Alice was born in Bellwick.",
    "Ben claimed Alice was born in Bellwick.",
    "Alice was born in Bellwick or Marston.",
    "Alice was born in May.",
    "“Alice was born in Bellwick,” Ben lied.",
  ])("does not invent a definite birthplace from %s", (text) => {
    expect(explicitBirthplaceClaims(text, "Alice")).toEqual([]);
  });
});
