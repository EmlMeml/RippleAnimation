import { describe, expect, it } from "vitest";
import {
  checkConsistency,
} from "./consistencyChecker";
import type { FactExtraction } from "../types/facts";

describe("checkConsistency", () => {
  it("erkennt widersprüchliche exklusive Fakten", () => {
    const extraction: FactExtraction = {
      entities: [],
      facts: [
        {
          subject: "Anna",
          predicate: "lives_in",
          object: "Munich",
        },
        {
          subject: "Anna",
          predicate: "lives_in",
          object: "Berlin",
        },
      ],
    };

    const result = checkConsistency(extraction);

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("conflicting_fact");
  });

  it("erkennt Groß-/Kleinschreibung nicht als Widerspruch", () => {
    const extraction: FactExtraction = {
      entities: [],
      facts: [
        {
          subject: "Anna",
          predicate: "lives_in",
          object: "Munich",
        },
        {
          subject: "anna",
          predicate: "lives_in",
          object: "munich",
        },
      ],
    };

    const result = checkConsistency(extraction);

    expect(result).toHaveLength(0);
  });

  it("erkennt younger_than und older_than als Widerspruch", () => {
    const extraction: FactExtraction = {
      entities: [],
      facts: [
        {
          subject: "Anna",
          predicate: "younger_than",
          object: "Thomas",
        },
        {
          subject: "Anna",
          predicate: "older_than",
          object: "Thomas",
        },
      ],
    };

    const result = checkConsistency(extraction);

    expect(result).toHaveLength(1);
  });

  it("erkennt umgekehrte younger_than/older_than Aussagen als konsistent", () => {
    const extraction: FactExtraction = {
      entities: [],
      facts: [
        {
          subject: "Anna",
          predicate: "younger_than",
          object: "Thomas",
        },
        {
          subject: "Thomas",
          predicate: "older_than",
          object: "Anna",
        },
      ],
    };

    const result = checkConsistency(extraction);

    expect(result).toHaveLength(0);
  });

  it("erkennt parent_of und child_of in korrekter Richtung als konsistent", () => {
    const extraction: FactExtraction = {
      entities: [],
      facts: [
        {
          subject: "Anna",
          predicate: "parent_of",
          object: "Thomas",
        },
        {
          subject: "Thomas",
          predicate: "child_of",
          object: "Anna",
        },
      ],
    };

    const result = checkConsistency(extraction);

    expect(result).toHaveLength(0);
  });

  it("erkennt parent_of und child_of in derselben Richtung als Widerspruch", () => {
    const extraction: FactExtraction = {
      entities: [],
      facts: [
        {
          subject: "Anna",
          predicate: "parent_of",
          object: "Thomas",
        },
        {
          subject: "Anna",
          predicate: "child_of",
          object: "Thomas",
        },
      ],
    };

    const result = checkConsistency(extraction);

    expect(result).toHaveLength(1);
  });

  it("erkennt sibling_of als symmetrische Beziehung", () => {
    const extraction: FactExtraction = {
      entities: [],
      facts: [
        {
          subject: "Anna",
          predicate: "sibling_of",
          object: "Thomas",
        },
        {
          subject: "Thomas",
          predicate: "sibling_of",
          object: "Anna",
        },
      ],
    };

    const result = checkConsistency(extraction);

    expect(result).toHaveLength(0);
  });

  it("erkennt friend_of als symmetrische Beziehung", () => {
    const extraction: FactExtraction = {
      entities: [],
      facts: [
        {
          subject: "Anna",
          predicate: "friend_of",
          object: "Thomas",
        },
        {
          subject: "Thomas",
          predicate: "friend_of",
          object: "Anna",
        },
      ],
    };

    const result = checkConsistency(extraction);

    expect(result).toHaveLength(0);
  });
});