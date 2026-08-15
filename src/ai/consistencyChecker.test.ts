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

/* 
    Selbst-Beziehungen
 */
  it("erkennt sibling_of mit sich selbst als Widerspruch", () => {
    const extraction: FactExtraction = {
        entities: [],
        facts: [
        {
            subject: "Anna",
            predicate: "sibling_of",
            object: "Anna",
        },
        ],
    };

    const result = checkConsistency(extraction);

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("conflicting_fact");
});

it("erkennt married_to mit sich selbst als Widerspruch", () => {
  const extraction: FactExtraction = {
    entities: [],
    facts: [
      {
        subject: "Anna",
        predicate: "married_to",
        object: "Anna",
      },
    ],
  };

  const result = checkConsistency(extraction);

  expect(result).toHaveLength(1);
});

it("erkennt eine normale married_to Beziehung als konsistent", () => {
  const extraction: FactExtraction = {
    entities: [],
    facts: [
      {
        subject: "Anna",
        predicate: "married_to",
        object: "Thomas",
      },
    ],
  };

  const result = checkConsistency(extraction);

  expect(result).toHaveLength(0);
});

/* 
    Transistive Beziehungen
 */
it("erkennt einen indirekten younger_than/older_than Konflikt", () => {
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
        predicate: "younger_than",
        object: "Peter",
      },
      {
        subject: "Anna",
        predicate: "older_than",
        object: "Peter",
      },
    ],
  };

  const result = checkConsistency(extraction);

  expect(result).toHaveLength(1);
  expect(result[0].type).toBe("conflicting_fact");
});

it("erkennt einen indirekten Konflikt über mehrere Ebenen", () => {
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
        predicate: "younger_than",
        object: "Peter",
      },
      {
        subject: "Peter",
        predicate: "younger_than",
        object: "Klaus",
      },
      {
        subject: "Anna",
        predicate: "older_than",
        object: "Klaus",
      },
    ],
  };

  const result = checkConsistency(extraction);

  expect(result).toHaveLength(1);
});

it("erkennt einen transitiven younger_than Pfad ohne Widerspruch", () => {
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
        predicate: "younger_than",
        object: "Peter",
      },
    ],
  };

  const result = checkConsistency(extraction);

  expect(result).toHaveLength(0);
});

it("akzeptiert eine konsistente transitive younger_than Beziehung", () => {
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
        predicate: "younger_than",
        object: "Peter",
      },
    ],
  };

  const result = checkConsistency(extraction);

  expect(result).toHaveLength(0);
});

/* 
    Duplikate in Fakten
 */
it("erkennt identische exklusive Fakten nicht als Widerspruch", () => {
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
        object: "Munich",
      },
    ],
  };

  const result = checkConsistency(extraction);

  expect(result).toHaveLength(0);
});

it("erkennt identische sibling_of Fakten nicht als Widerspruch", () => {
  const extraction: FactExtraction = {
    entities: [],
    facts: [
      {
        subject: "Anna",
        predicate: "sibling_of",
        object: "Thomas",
      },
      {
        subject: "Anna",
        predicate: "sibling_of",
        object: "Thomas",
      },
    ],
  };

  const result = checkConsistency(extraction);

  expect(result).toHaveLength(0);
});

it("erkennt identische parent_of Fakten nicht als Widerspruch", () => {
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
        predicate: "parent_of",
        object: "Thomas",
      },
    ],
  };

  const result = checkConsistency(extraction);

  expect(result).toHaveLength(0);
});

it("erkennt parent_of und child_of in korrekter Richtung auch bei doppelten Fakten als konsistent", () => {
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
      {
        subject: "Anna",
        predicate: "parent_of",
        object: "Thomas",
      },
    ],
  };

  const result = checkConsistency(extraction);

  expect(result).toHaveLength(0);
});

it("erkennt trotz eines Duplikats einen echten lives_in Konflikt", () => {
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
});

/*
* Special Case: located_in 
*/
it("erkennt widersprüchliche located_in Fakten", () => {
  const extraction: FactExtraction = {
    entities: [],
    facts: [
      {
        subject: "Munich",
        predicate: "located_in",
        object: "Bavaria",
      },
      {
        subject: "Munich",
        predicate: "located_in",
        object: "France",
      },
    ],
  };

  const result = checkConsistency(extraction);

  expect(result).toHaveLength(1);
  expect(result[0].type).toBe("conflicting_fact");
});

it("erkennt hierarchische located_in Fakten nicht als Widerspruch", () => {
  const extraction: FactExtraction = {
    entities: [],
    facts: [
      {
        subject: "Munich",
        predicate: "located_in",
        object: "Bavaria",
      },
      {
        subject: "Bavaria",
        predicate: "located_in",
        object: "Germany",
      },
    ],
  };

  const result = checkConsistency(extraction);

  expect(result).toHaveLength(0);
});

/*
 * Zeitliche Konsistenzen 
 */
it("erkennt unterschiedliche Orte zu unterschiedlichen Zeitpunkten als konsistent", () => {
  const extraction: FactExtraction = {
    entities: [
      { id: "anna", name: "Anna", type: "person" },
      { id: "munich", name: "München", type: "place" },
      { id: "berlin", name: "Berlin", type: "place" },
    ],
    facts: [
      {
        subject: "anna",
        predicate: "located_in",
        object: "munich",
        temporal: {
          text: "heute",
          from: "2026-08-14",
          to: "2026-08-14",
        },
      },
      {
        subject: "anna",
        predicate: "located_in",
        object: "berlin",
        temporal: {
          text: "morgen",
          from: "2026-08-15",
          to: "2026-08-15",
        },
      },
    ],
  };

  const result = checkConsistency(extraction);

  expect(result).toHaveLength(0);
});

it("erkennt unterschiedliche Orte zum gleichen Zeitpunkt als Widerspruch", () => {
  const extraction: FactExtraction = {
    entities: [
      { id: "anna", name: "Anna", type: "person" },
      { id: "munich", name: "München", type: "place" },
      { id: "berlin", name: "Berlin", type: "place" },
    ],
    facts: [
      {
        subject: "anna",
        predicate: "located_in",
        object: "munich",
        temporal: {
          text: "heute",
          from: "2026-08-14",
          to: "2026-08-14",
        },
      },
      {
        subject: "anna",
        predicate: "located_in",
        object: "berlin",
        temporal: {
          text: "heute",
          from: "2026-08-14",
          to: "2026-08-14",
        },
      },
    ],
  };

  const result = checkConsistency(extraction);

  expect(result).toHaveLength(1);
});

it("erkennt parent_of und child_of als inverse Beziehung", () => {
  const extraction: FactExtraction = {
    entities: [
      { id: "anna", name: "Anna", type: "person" },
      { id: "thomas", name: "Thomas", type: "person" },
    ],
    facts: [
      {
        subject: "anna",
        predicate: "parent_of",
        object: "thomas",
      },
      {
        subject: "thomas",
        predicate: "child_of",
        object: "anna",
      },
    ],
  };

  const result = checkConsistency(extraction);

  expect(result).toHaveLength(0);
});

it("erkennt owns und has als inverse Beziehung", () => {
  const extraction: FactExtraction = {
    entities: [
      { id: "anna", name: "Anna", type: "person" },
      { id: "car", name: "Auto", type: "object" },
    ],
    facts: [
      {
        subject: "anna",
        predicate: "owns",
        object: "car",
      },
      {
        subject: "car",
        predicate: "has",
        object: "anna",
      },
    ],
  };

  const result = checkConsistency(extraction);

  expect(result).toHaveLength(0);
});


it("erkennt unterschiedliche lives_in Zeiträume als konsistent", () => {
  const extraction: FactExtraction = {
    entities: [],
    facts: [
      {
        subject: "anna",
        predicate: "lives_in",
        object: "munich",
        temporal: {
          text: "am 14.08.",
          from: "2026-08-14",
          to: "2026-08-14",
        },
      },
      {
        subject: "anna",
        predicate: "lives_in",
        object: "berlin",
        temporal: {
          text: "am 15.08.",
          from: "2026-08-15",
          to: "2026-08-15",
        },
      },
    ],
  };

  const result = checkConsistency(extraction);

  expect(result).toHaveLength(0);
});

it("erkennt unterschiedliche lives_in Orte zum gleichen Zeitpunkt als Widerspruch", () => {
  const extraction: FactExtraction = {
    entities: [],
    facts: [
      {
        subject: "anna",
        predicate: "lives_in",
        object: "munich",
        temporal: {
          text: "heute",
          from: "2026-08-14",
          to: "2026-08-14",
        },
      },
      {
        subject: "anna",
        predicate: "lives_in",
        object: "berlin",
        temporal: {
          text: "heute",
          from: "2026-08-14",
          to: "2026-08-14",
        },
      },
    ],
  };

  const result = checkConsistency(extraction);

  expect(result).toHaveLength(1);
});

it("erkennt sich überschneidende lives_in Zeiträume als Widerspruch", () => {
  const extraction: FactExtraction = {
    entities: [],
    facts: [
      {
        subject: "anna",
        predicate: "lives_in",
        object: "munich",
        temporal: {
          text: "14.08. bis 16.08.",
          from: "2026-08-14",
          to: "2026-08-16",
        },
      },
      {
        subject: "anna",
        predicate: "lives_in",
        object: "berlin",
        temporal: {
          text: "15.08.",
          from: "2026-08-15",
          to: "2026-08-15",
        },
      },
    ],
  };

  const result = checkConsistency(extraction);

  expect(result).toHaveLength(1);
});

it("erkennt einen gemeinsamen Grenztag als Widerspruch", () => {
  const extraction: FactExtraction = {
    entities: [],
    facts: [
      {
        subject: "anna",
        predicate: "lives_in",
        object: "munich",
        temporal: {
          text: "14.08. bis 15.08.",
          from: "2026-08-14",
          to: "2026-08-15",
        },
      },
      {
        subject: "anna",
        predicate: "lives_in",
        object: "berlin",
        temporal: {
          text: "15.08. bis 16.08.",
          from: "2026-08-15",
          to: "2026-08-16",
        },
      },
    ],
  };

  const result = checkConsistency(extraction);

  expect(result).toHaveLength(1);
});

it("erkennt sich überschneidende located_in Zeiträume als Widerspruch", () => {
  const extraction: FactExtraction = {
    entities: [],
    facts: [
      {
        subject: "anna",
        predicate: "located_in",
        object: "munich",
        temporal: {
          text: "14.08. bis 16.08.",
          from: "2026-08-14",
          to: "2026-08-16",
        },
      },
      {
        subject: "anna",
        predicate: "located_in",
        object: "berlin",
        temporal: {
          text: "15.08.",
          from: "2026-08-15",
          to: "2026-08-15",
        },
      },
    ],
  };

  const result = checkConsistency(extraction);

  expect(result).toHaveLength(1);
});

it("erkennt getrennte located_in Zeiträume als konsistent", () => {
  const extraction: FactExtraction = {
    entities: [],
    facts: [
      {
        subject: "anna",
        predicate: "located_in",
        object: "munich",
        temporal: {
          text: "14.08.",
          from: "2026-08-14",
          to: "2026-08-14",
        },
      },
      {
        subject: "anna",
        predicate: "located_in",
        object: "berlin",
        temporal: {
          text: "15.08.",
          from: "2026-08-15",
          to: "2026-08-15",
        },
      },
    ],
  };

  const result = checkConsistency(extraction);

  expect(result).toHaveLength(0);
});

it("erkennt unterschiedliche Arbeitgeber ohne zeitlichen Kontext als Widerspruch", () => {
  const extraction: FactExtraction = {
    entities: [],
    facts: [
      {
        subject: "anna",
        predicate: "works_at",
        object: "company_a",
      },
      {
        subject: "anna",
        predicate: "works_at",
        object: "company_b",
      },
    ],
  };

  const result = checkConsistency(extraction);

  expect(result).toHaveLength(1);
});

it("erkennt unterschiedliche Arbeitgeber zu unterschiedlichen Zeitpunkten als konsistent", () => {
  const extraction: FactExtraction = {
    entities: [],
    facts: [
      {
        subject: "anna",
        predicate: "works_at",
        object: "company_a",
        temporal: {
          text: "2024",
          from: "2024-01-01",
          to: "2024-12-31",
        },
      },
      {
        subject: "anna",
        predicate: "works_at",
        object: "company_b",
        temporal: {
          text: "2026",
          from: "2026-01-01",
          to: "2026-12-31",
        },
      },
    ],
  };

  const result = checkConsistency(extraction);

  expect(result).toHaveLength(0);
});

it("erkennt überschneidende unterschiedliche Arbeitgeber als Widerspruch", () => {
  const extraction: FactExtraction = {
    entities: [],
    facts: [
      {
        subject: "anna",
        predicate: "works_at",
        object: "company_a",
        temporal: {
          text: "2024 bis 2026",
          from: "2024-01-01",
          to: "2026-12-31",
        },
      },
      {
        subject: "anna",
        predicate: "works_at",
        object: "company_b",
        temporal: {
          text: "2026",
          from: "2026-01-01",
          to: "2026-12-31",
        },
      },
    ],
  };

  const result = checkConsistency(extraction);

  expect(result).toHaveLength(1);
});


it("erkennt zeitlich getrennte opposing predicates als konsistent", () => {
  const extraction: FactExtraction = {
    entities: [],
    facts: [
      {
        subject: "anna",
        predicate: "younger_than",
        object: "thomas",
        temporal: {
          text: "heute",
          from: "2026-08-14",
          to: "2026-08-14",
        },
      },
      {
        subject: "anna",
        predicate: "older_than",
        object: "thomas",
        temporal: {
          text: "morgen",
          from: "2026-08-15",
          to: "2026-08-15",
        },
      },
    ],
  };

  const result = checkConsistency(extraction);

  expect(result).toHaveLength(0);
});

it("erkennt zeitlich getrennte inverse Richtungen als konsistent", () => {
  const extraction: FactExtraction = {
    entities: [],
    facts: [
      {
        subject: "anna",
        predicate: "parent_of",
        object: "thomas",
        temporal: {
          text: "heute",
          from: "2026-08-14",
          to: "2026-08-14",
        },
      },
      {
        subject: "anna",
        predicate: "child_of",
        object: "thomas",
        temporal: {
          text: "morgen",
          from: "2026-08-15",
          to: "2026-08-15",
        },
      },
    ],
  };

  const result = checkConsistency(extraction);

  console.log(result);

  expect(result).toHaveLength(0);
});

it("erkennt überlappende inverse Richtungen als Widerspruch", () => {
  const extraction: FactExtraction = {
    entities: [],
    facts: [
      {
        subject: "anna",
        predicate: "parent_of",
        object: "thomas",
        temporal: {
          text: "heute",
          from: "2026-08-14",
          to: "2026-08-14",
        },
      },
      {
        subject: "anna",
        predicate: "child_of",
        object: "thomas",
        temporal: {
          text: "heute",
          from: "2026-08-14",
          to: "2026-08-14",
        },
      },
    ],
  };

  const result = checkConsistency(extraction);

  expect(result).toHaveLength(1);
});

it("erkennt zeitlich getrennte inverse Richtungen als konsistent", () => {
  const extraction: FactExtraction = {
    entities: [],
    facts: [
      {
        subject: "anna",
        predicate: "parent_of",
        object: "thomas",
        temporal: {
          text: "heute",
          from: "2026-08-14",
          to: "2026-08-14",
        },
      },
      {
        subject: "anna",
        predicate: "child_of",
        object: "thomas",
        temporal: {
          text: "morgen",
          from: "2026-08-15",
          to: "2026-08-15",
        },
      },
    ],
  };

  const result = checkConsistency(extraction);

  expect(result).toHaveLength(0);
});

// Tests for transitive Relations
it("erkennt zeitlich getrennten transitiven Konflikt als konsistent", () => {
  const extraction: FactExtraction = {
    entities: [],
    facts: [
      {
        subject: "anna",
        predicate: "younger_than",
        object: "ben",
        temporal: {
          text: "heute",
          from: "2026-08-14",
          to: "2026-08-14",
        },
      },
      {
        subject: "ben",
        predicate: "younger_than",
        object: "clara",
        temporal: {
          text: "heute",
          from: "2026-08-14",
          to: "2026-08-14",
        },
      },
      {
        subject: "anna",
        predicate: "older_than",
        object: "clara",
        temporal: {
          text: "morgen",
          from: "2026-08-15",
          to: "2026-08-15",
        },
      },
    ],
  };

  const result = checkConsistency(extraction);

  expect(result).toHaveLength(0);
});

});