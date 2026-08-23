import { describe, expect, it } from "vitest";
import { resolvePronouns } from "./pronounResolver";

describe("resolvePronouns", () => {
  it("ordnet ein weibliches Pronomen der zuletzt erwähnten Figur zu", () => {
    const result = resolvePronouns({
      entities: [
        { id: "anna", name: "Anna", type: "person" },
      ],
      facts: [
        { subject: "anna", predicate: "lives_in", object: "munich" },
        { subject: "sie", predicate: "lives_in", object: "berlin" },
      ],
    });

    expect(result.facts[1].subject).toBe("anna");
  });

  it("berücksichtigt bekannte Geschlechter bei der Auflösung", () => {
    const result = resolvePronouns({
      entities: [
        { id: "anna", name: "Anna", type: "person" },
        { id: "thomas", name: "Thomas", type: "person" },
      ],
      facts: [
        { subject: "anna", predicate: "gender", value: "female" },
        { subject: "thomas", predicate: "gender", value: "male" },
        { subject: "er", predicate: "lives_in", object: "berlin" },
      ],
    });

    expect(result.facts[2].subject).toBe("thomas");
  });
});
