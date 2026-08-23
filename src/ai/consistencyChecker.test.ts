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

  it("erkennt younger_than und older_than in korrekter umgekehrter Richtung als konsistent", () => {
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

  it("erkennt older_than und younger_than in derselben Richtung als Widerspruch", () => {
    const extraction: FactExtraction = {
      entities: [],
      facts: [
        {
          subject: "Anna",
          predicate: "older_than",
          object: "Thomas",
        },
        {
          subject: "Anna",
          predicate: "younger_than",
          object: "Thomas",
        },
      ],
    };

    const result = checkConsistency(extraction);

    expect(result).toHaveLength(1);
  });

  it("erkennt einen Widerspruch auch zwischen mehreren unabhängigen Fakten", () => {
    const extraction: FactExtraction = {
      entities: [],
      facts: [
        {
          subject: "Anna",
          predicate: "friend_of",
          object: "Lisa",
        },
        {
          subject: "Thomas",
          predicate: "younger_than",
          object: "Peter",
        },
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

  it("erkennt mehrere unabhängige Widersprüche", () => {
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
        {
          subject: "Lisa",
          predicate: "parent_of",
          object: "Peter",
        },
        {
          subject: "Lisa",
          predicate: "child_of",
          object: "Peter",
        },
      ],
    };

    const result = checkConsistency(extraction);

    expect(result).toHaveLength(2);
  });

  it("erkennt sibling_of in beiden Richtungen als konsistent", () => {
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

  it("erkennt friend_of in beiden Richtungen als konsistent", () => {
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

/* 
 * Zeitliche Tests
*/
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

it("erkennt einen transitiven Konflikt bei vollständig überlappendem Zeitraum", () => {
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

it("erkennt einen transitiven Konflikt nicht, wenn der Gegen-Fact zeitlich getrennt ist", () => {
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

it("erkennt keinen transitiven Konflikt, wenn eine Kante des Pfades zeitlich getrennt ist", () => {
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
          text: "morgen",
          from: "2026-08-15",
          to: "2026-08-15",
        },
      },
      {
        subject: "anna",
        predicate: "older_than",
        object: "clara",
        temporal: {
          text: "heute",
          from: "2026-08-14",
          to: "2026-08-14",
        },
      },
    ],
  };

  const result = checkConsistency(extraction);

  expect(result).toHaveLength(0);
});



/*
 *  Zyklen
*/
it("erkennt einen direkten Zyklus bei younger_than", () => {
  const extraction: FactExtraction = {
    entities: [],
    facts: [
      {
        subject: "anna",
        predicate: "younger_than",
        object: "ben",
      },
      {
        subject: "ben",
        predicate: "younger_than",
        object: "anna",
      },
    ],
  };

  const result = checkConsistency(extraction);

  expect(result).toHaveLength(1);
  expect(result[0].type).toBe("conflicting_fact");
});

it("erkennt einen indirekten Zyklus bei younger_than", () => {
  const extraction: FactExtraction = {
    entities: [],
    facts: [
      {
        subject: "anna",
        predicate: "younger_than",
        object: "ben",
      },
      {
        subject: "ben",
        predicate: "younger_than",
        object: "clara",
      },
      {
        subject: "clara",
        predicate: "younger_than",
        object: "anna",
      },
    ],
  };

  const result = checkConsistency(extraction);

  expect(result).toHaveLength(1);
  expect(result[0].type).toBe("conflicting_fact");
});

it("erkennt eine normale transitive younger_than Kette nicht als Konflikt", () => {
  const extraction: FactExtraction = {
    entities: [],
    facts: [
      {
        subject: "anna",
        predicate: "younger_than",
        object: "ben",
      },
      {
        subject: "ben",
        predicate: "younger_than",
        object: "clara",
      },
    ],
  };

  const result = checkConsistency(extraction);

  expect(result).toHaveLength(0);
});

it("erkennt einen längeren transitiven Zyklus", () => {
  const extraction: FactExtraction = {
    entities: [],
    facts: [
      {
        subject: "anna",
        predicate: "younger_than",
        object: "ben",
      },
      {
        subject: "ben",
        predicate: "younger_than",
        object: "clara",
      },
      {
        subject: "clara",
        predicate: "younger_than",
        object: "david",
      },
      {
        subject: "david",
        predicate: "younger_than",
        object: "anna",
      },
    ],
  };

  const result = checkConsistency(extraction);

  expect(result).toHaveLength(1);
});

it("erkennt einen Zyklus bei older_than", () => {
  const extraction: FactExtraction = {
    entities: [],
    facts: [
      {
        subject: "anna",
        predicate: "older_than",
        object: "ben",
      },
      {
        subject: "ben",
        predicate: "older_than",
        object: "clara",
      },
      {
        subject: "clara",
        predicate: "older_than",
        object: "anna",
      },
    ],
  };

  const result = checkConsistency(extraction);

  expect(result).toHaveLength(1);
});

it("erkennt zeitlich getrennte transitive Zyklen nicht als Konflikt", () => {
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
        object: "anna",
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

it("erkennt einen direkten Selbstzyklus bei younger_than", () => {
  const extraction: FactExtraction = {
    entities: [],
    facts: [
      {
        subject: "anna",
        predicate: "younger_than",
        object: "anna",
      },
    ],
  };

  const result = checkConsistency(extraction);

  expect(result).toHaveLength(1);
  expect(result[0].type).toBe("conflicting_fact");
});

it("erkennt einen direkten Selbstzyklus bei older_than", () => {
  const extraction: FactExtraction = {
    entities: [],
    facts: [
      {
        subject: "anna",
        predicate: "older_than",
        object: "anna",
      },
    ],
  };

  const result = checkConsistency(extraction);

  expect(result).toHaveLength(1);
  expect(result[0].type).toBe("conflicting_fact");
});

/*
 * zeitliche Zykluslogik
*/

it("erkennt einen zeitlich vollständig überlappenden Zyklus", () => {
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
        subject: "clara",
        predicate: "younger_than",
        object: "anna",
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
  expect(result[0].type).toBe("conflicting_fact");
});

it("erkennt keinen Zyklus bei vollständig getrennten Zeiträumen", () => {
  const extraction: FactExtraction = {
    entities: [],
    facts: [
      {
        subject: "anna",
        predicate: "younger_than",
        object: "ben",
        temporal: {
          text: "14.08.",
          from: "2026-08-14",
          to: "2026-08-14",
        },
      },
      {
        subject: "ben",
        predicate: "younger_than",
        object: "clara",
        temporal: {
          text: "15.08.",
          from: "2026-08-15",
          to: "2026-08-15",
        },
      },
      {
        subject: "clara",
        predicate: "younger_than",
        object: "anna",
        temporal: {
          text: "16.08.",
          from: "2026-08-16",
          to: "2026-08-16",
        },
      },
    ],
  };

  const result = checkConsistency(extraction);

  expect(result).toHaveLength(0);
});

it("erkennt keinen Zyklus wenn eine Kante zeitlich getrennt ist", () => {
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
        subject: "clara",
        predicate: "younger_than",
        object: "anna",
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

it("erkennt einen Zyklus bei teilweise überlappenden Zeiträumen", () => {
  const extraction: FactExtraction = {
    entities: [],
    facts: [
      {
        subject: "anna",
        predicate: "younger_than",
        object: "ben",
        temporal: {
          text: "14.08. bis 16.08.",
          from: "2026-08-14",
          to: "2026-08-16",
        },
      },
      {
        subject: "ben",
        predicate: "younger_than",
        object: "clara",
        temporal: {
          text: "15.08. bis 17.08.",
          from: "2026-08-15",
          to: "2026-08-17",
        },
      },
      {
        subject: "clara",
        predicate: "younger_than",
        object: "anna",
        temporal: {
          text: "16.08.",
          from: "2026-08-16",
          to: "2026-08-16",
        },
      },
    ],
  };

  const result = checkConsistency(extraction);

  expect(result).toHaveLength(1);
  expect(result[0].type).toBe("conflicting_fact");
});

it("erkennt einen Zyklus bei einem gemeinsamen zeitlichen Grenztag", () => {
  const extraction: FactExtraction = {
    entities: [],
    facts: [
      {
        subject: "anna",
        predicate: "younger_than",
        object: "ben",
        temporal: {
          text: "14.08. bis 15.08.",
          from: "2026-08-14",
          to: "2026-08-15",
        },
      },
      {
        subject: "ben",
        predicate: "younger_than",
        object: "clara",
        temporal: {
          text: "15.08. bis 16.08.",
          from: "2026-08-15",
          to: "2026-08-16",
        },
      },
      {
        subject: "clara",
        predicate: "younger_than",
        object: "anna",
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
  expect(result[0].type).toBe("conflicting_fact");
});

/*
 *  undefined/null
 */
it("ignoriert younger_than Fakten ohne Objekt", () => {
  const extraction: FactExtraction = {
    entities: [],
    facts: [
      {
        subject: "anna",
        predicate: "younger_than",
        object: undefined,
      },
    ],
  };

  const result = checkConsistency(extraction);

  expect(result).toHaveLength(0);
});


it("ignoriert younger_than Fakten mit null als Objekt", () => {
  const extraction: FactExtraction = {
    entities: [],
    facts: [
      {
        subject: "anna",
        predicate: "younger_than",
        object: null,
      },
    ],
  };

  const result = checkConsistency(extraction);

  expect(result).toHaveLength(0);
});

/*
 * Case-insensitiver Zyklus 
 */

it("erkennt einen direkten Zyklus unabhängig von Groß-/Kleinschreibung", () => {
  const extraction: FactExtraction = {
    entities: [],
    facts: [
      {
        subject: "Anna",
        predicate: "younger_than",
        object: "Ben",
      },
      {
        subject: "ben",
        predicate: "younger_than",
        object: "ANNA",
      },
    ],
  };

  const result = checkConsistency(extraction);

  expect(result).toHaveLength(1);
  expect(result[0].type).toBe("conflicting_fact");
});

it("erkennt einen indirekten Zyklus unabhängig von Groß-/Kleinschreibung", () => {
  const extraction: FactExtraction = {
    entities: [],
    facts: [
      {
        subject: "Anna",
        predicate: "younger_than",
        object: "Ben",
      },
      {
        subject: "ben",
        predicate: "younger_than",
        object: "Clara",
      },
      {
        subject: "CLARA",
        predicate: "younger_than",
        object: "anna",
      },
    ],
  };

  const result = checkConsistency(extraction);

  expect(result).toHaveLength(1);
  expect(result[0].type).toBe("conflicting_fact");
});

it("meldet einen Zyklus trotz doppelter Fakten nur einmal", () => {
  const extraction: FactExtraction = {
    entities: [],
    facts: [
      {
        subject: "anna",
        predicate: "younger_than",
        object: "ben",
      },
      {
        subject: "anna",
        predicate: "younger_than",
        object: "ben",
      },
      {
        subject: "ben",
        predicate: "younger_than",
        object: "anna",
      },
    ],
  };

  const result = checkConsistency(extraction);

  expect(result).toHaveLength(1);
  expect(result[0].type).toBe("conflicting_fact");
});

it("meldet einen längeren Zyklus mit Duplikaten nur einmal", () => {
  const extraction: FactExtraction = {
    entities: [],
    facts: [
      {
        subject: "anna",
        predicate: "younger_than",
        object: "ben",
      },
      {
        subject: "ben",
        predicate: "younger_than",
        object: "clara",
      },
      {
        subject: "ben",
        predicate: "younger_than",
        object: "clara",
      },
      {
        subject: "clara",
        predicate: "younger_than",
        object: "david",
      },
      {
        subject: "david",
        predicate: "younger_than",
        object: "anna",
      },
    ],
  };

  const result = checkConsistency(extraction);

  expect(result).toHaveLength(1);
  expect(result[0].type).toBe("conflicting_fact");
});

/*
 *  Zykeln + Gegenrelation
 */
it("erkennt einen Zyklus und einen direkten Gegen-Fact ohne doppelte Meldung", () => {
  const extraction: FactExtraction = {
    entities: [],
    facts: [
      {
        subject: "anna",
        predicate: "younger_than",
        object: "ben",
      },
      {
        subject: "ben",
        predicate: "younger_than",
        object: "clara",
      },
      {
        subject: "clara",
        predicate: "younger_than",
        object: "anna",
      },
      {
        subject: "anna",
        predicate: "older_than",
        object: "clara",
      },
    ],
  };

  const result = checkConsistency(extraction);

  expect(
    result.filter(
      (inconsistency) =>
        inconsistency.type === "conflicting_fact"
    ).length
  ).toBeGreaterThan(0);
});

it("erkennt einen Zyklus und den daraus resultierenden Gegen-Fact", () => {
  const extraction: FactExtraction = {
    entities: [],
    facts: [
      {
        subject: "anna",
        predicate: "younger_than",
        object: "ben",
      },
      {
        subject: "ben",
        predicate: "younger_than",
        object: "clara",
      },
      {
        subject: "clara",
        predicate: "younger_than",
        object: "anna",
      },
      {
        subject: "anna",
        predicate: "older_than",
        object: "clara",
      },
    ],
  };

  const result = checkConsistency(extraction);

  expect(result.length).toBeGreaterThan(0);

  expect(
    result.some(
      (inconsistency) =>
        inconsistency.type === "conflicting_fact" &&
        inconsistency.predicate === "younger_than"
    )
  ).toBe(true);
});

it("erkennt keine Inkonsistenz bei konsistent umgekehrter Altersbeziehung", () => {
  const extraction: FactExtraction = {
    entities: [],
    facts: [
      {
        subject: "anna",
        predicate: "younger_than",
        object: "ben",
      },
      {
        subject: "ben",
        predicate: "younger_than",
        object: "clara",
      },
      {
        subject: "clara",
        predicate: "older_than",
        object: "anna",
      },
    ],
  };

  const result = checkConsistency(extraction);

  expect(result).toHaveLength(0);
});

it("erkennt keinen Alterskonflikt bei zeitlich getrennter Gegenbeziehung", () => {
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

/*
 * Alters-/Translativitätlogik 
*/
it("erkennt keinen Alterskonflikt bei zeitlich getrennter Gegenbeziehung", () => {
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

it("erkennt eine mehrstufige located_in Hierarchie als konsistent", () => {
  const extraction: FactExtraction = {
    entities: [],
    facts: [
      {
        subject: "munich",
        predicate: "located_in",
        object: "bavaria",
      },
      {
        subject: "bavaria",
        predicate: "located_in",
        object: "germany",
      },
      {
        subject: "germany",
        predicate: "located_in",
        object: "europe",
      },
    ],
  };

  const result = checkConsistency(extraction);

  expect(result).toHaveLength(0);
});

it("erkennt direkten und indirekten located_in Zusammenhang als konsistent", () => {
  const extraction: FactExtraction = {
    entities: [],
    facts: [
      {
        subject: "munich",
        predicate: "located_in",
        object: "bavaria",
      },
      {
        subject: "bavaria",
        predicate: "located_in",
        object: "germany",
      },
      {
        subject: "munich",
        predicate: "located_in",
        object: "germany",
      },
    ],
  };

  const result = checkConsistency(extraction);

  expect(result).toHaveLength(0);
});

it("erkennt einen echten located_in Konflikt trotz vorhandener Hierarchie", () => {
  const extraction: FactExtraction = {
    entities: [],
    facts: [
      {
        subject: "munich",
        predicate: "located_in",
        object: "bavaria",
      },
      {
        subject: "bavaria",
        predicate: "located_in",
        object: "germany",
      },
      {
        subject: "munich",
        predicate: "located_in",
        object: "france",
      },
    ],
  };

  const result = checkConsistency(extraction);

  expect(result).toHaveLength(1);
  expect(result[0].type).toBe("conflicting_fact");
});

it("erkennt einen located_in Konflikt über mehrere Hierarchieebenen", () => {
  const extraction: FactExtraction = {
    entities: [],
    facts: [
      {
        subject: "munich",
        predicate: "located_in",
        object: "bavaria",
      },
      {
        subject: "bavaria",
        predicate: "located_in",
        object: "germany",
      },
      {
        subject: "germany",
        predicate: "located_in",
        object: "europe",
      },
      {
        subject: "munich",
        predicate: "located_in",
        object: "france",
      },
    ],
  };

  const result = checkConsistency(extraction);

  expect(result).toHaveLength(1);
});

/*
 * Zeitlich getrennte Hierarchie 
*/
it("erkennt zeitlich getrennte located_in Hierarchien als konsistent", () => {
  const extraction: FactExtraction = {
    entities: [],
    facts: [
      {
        subject: "munich",
        predicate: "located_in",
        object: "bavaria",
        temporal: {
          text: "heute",
          from: "2026-08-14",
          to: "2026-08-14",
        },
      },
      {
        subject: "bavaria",
        predicate: "located_in",
        object: "germany",
        temporal: {
          text: "heute",
          from: "2026-08-14",
          to: "2026-08-14",
        },
      },
      {
        subject: "munich",
        predicate: "located_in",
        object: "germany",
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

it("erkennt widersprüchliche located_in Angaben trotz Hierarchie", () => {
  const extraction: FactExtraction = {
    entities: [],
    facts: [
      {
        subject: "munich",
        predicate: "located_in",
        object: "bavaria",
        temporal: {
          text: "heute",
          from: "2026-08-14",
          to: "2026-08-14",
        },
      },
      {
        subject: "bavaria",
        predicate: "located_in",
        object: "germany",
        temporal: {
          text: "heute",
          from: "2026-08-14",
          to: "2026-08-14",
        },
      },
      {
        subject: "munich",
        predicate: "located_in",
        object: "france",
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
  expect(result[0].type).toBe("conflicting_fact");
});

it("erkennt einen zeitlich überlappenden located_in Zyklus", () => {
  const extraction: FactExtraction = {
    entities: [],
    facts: [
      {
        subject: "munich",
        predicate: "located_in",
        object: "bavaria",
        temporal: {
          text: "heute",
          from: "2026-08-14",
          to: "2026-08-14",
        },
      },
      {
        subject: "bavaria",
        predicate: "located_in",
        object: "germany",
        temporal: {
          text: "heute",
          from: "2026-08-14",
          to: "2026-08-14",
        },
      },
      {
        subject: "germany",
        predicate: "located_in",
        object: "munich",
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
  expect(result[0].type).toBe("conflicting_fact");
});

it("erkennt keinen zeitlich getrennten located_in Zyklus als Konflikt", () => {
  const extraction: FactExtraction = {
    entities: [],
    facts: [
      {
        subject: "munich",
        predicate: "located_in",
        object: "bavaria",
        temporal: {
          text: "heute",
          from: "2026-08-14",
          to: "2026-08-14",
        },
      },
      {
        subject: "bavaria",
        predicate: "located_in",
        object: "germany",
        temporal: {
          text: "morgen",
          from: "2026-08-15",
          to: "2026-08-15",
        },
      },
      {
        subject: "germany",
        predicate: "located_in",
        object: "munich",
        temporal: {
          text: "übermorgen",
          from: "2026-08-16",
          to: "2026-08-16",
        },
      },
    ],
  };

  const result = checkConsistency(extraction);

  expect(result).toHaveLength(0);
});


it("erkennt keinen located_in Zyklus bei nur teilweise überlappenden Zeiträumen", () => {
  const extraction: FactExtraction = {
    entities: [],
    facts: [
      {
        subject: "munich",
        predicate: "located_in",
        object: "bavaria",
        temporal: {
          text: "14.08. bis 15.08.",
          from: "2026-08-14",
          to: "2026-08-15",
        },
      },
      {
        subject: "bavaria",
        predicate: "located_in",
        object: "germany",
        temporal: {
          text: "15.08. bis 16.08.",
          from: "2026-08-15",
          to: "2026-08-16",
        },
      },
      {
        subject: "germany",
        predicate: "located_in",
        object: "munich",
        temporal: {
          text: "16.08.",
          from: "2026-08-16",
          to: "2026-08-16",
        },
      },
    ],
  };

  const result = checkConsistency(extraction);

  expect(result).toHaveLength(0);
});

it("erkennt einen located_in Zyklus bei vollständiger zeitlicher Überlappung", () => {
  const extraction: FactExtraction = {
    entities: [],
    facts: [
      {
        subject: "munich",
        predicate: "located_in",
        object: "bavaria",
        temporal: {
          text: "14.08. bis 16.08.",
          from: "2026-08-14",
          to: "2026-08-16",
        },
      },
      {
        subject: "bavaria",
        predicate: "located_in",
        object: "germany",
        temporal: {
          text: "15.08. bis 16.08.",
          from: "2026-08-15",
          to: "2026-08-16",
        },
      },
      {
        subject: "germany",
        predicate: "located_in",
        object: "munich",
        temporal: {
          text: "16.08.",
          from: "2026-08-16",
          to: "2026-08-16",
        },
      },
    ],
  };

  const result = checkConsistency(extraction);

  expect(result).toHaveLength(1);
  expect(result[0].type).toBe("conflicting_fact");
});

/*
 * transistive Konfilkte ohne Zyklus 
*/
it("erkennt einen Widerspruch zwischen indirektem located_in Zusammenhang und direktem Fact", () => {
  const extraction: FactExtraction = {
    entities: [],
    facts: [
      {
        subject: "munich",
        predicate: "located_in",
        object: "bavaria",
      },
      {
        subject: "bavaria",
        predicate: "located_in",
        object: "germany",
      },
      {
        subject: "munich",
        predicate: "located_in",
        object: "france",
      },
    ],
  };

  const result = checkConsistency(extraction);

  expect(result).toHaveLength(1);
  expect(result[0].type).toBe("conflicting_fact");
});

it("erkennt einen indirekten located_in Zusammenhang ohne Widerspruch als konsistent", () => {
  const extraction: FactExtraction = {
    entities: [],
    facts: [
      {
        subject: "munich",
        predicate: "located_in",
        object: "bavaria",
      },
      {
        subject: "bavaria",
        predicate: "located_in",
        object: "germany",
      },
    ],
  };

  const result = checkConsistency(extraction);

  expect(result).toHaveLength(0);
});

it("erkennt zeitlich getrennte indirekte located_in Beziehungen als konsistent", () => {
  const extraction: FactExtraction = {
    entities: [],
    facts: [
      {
        subject: "munich",
        predicate: "located_in",
        object: "bavaria",
        temporal: {
          text: "2026",
          from: "2026-01-01",
          to: "2026-12-31",
        },
      },
      {
        subject: "bavaria",
        predicate: "located_in",
        object: "germany",
        temporal: {
          text: "2026",
          from: "2026-01-01",
          to: "2026-12-31",
        },
      },
      {
        subject: "munich",
        predicate: "located_in",
        object: "france",
        temporal: {
          text: "2027",
          from: "2027-01-01",
          to: "2027-12-31",
        },
      },
    ],
  };

  const result = checkConsistency(extraction);

  expect(result).toHaveLength(0);
});

/*
 * Grenzfälle zwischen exklusiven, inversen und transitiven Beziehungen 
*/

it("erkennt mehrstufige located_in Hierarchien mit gemeinsamem Obergebiet als konsistent", () => {
  const extraction: FactExtraction = {
    entities: [],
    facts: [
      {
        subject: "munich",
        predicate: "located_in",
        object: "bavaria",
      },
      {
        subject: "bavaria",
        predicate: "located_in",
        object: "germany",
      },
      {
        subject: "germany",
        predicate: "located_in",
        object: "europe",
      },
      {
        subject: "france",
        predicate: "located_in",
        object: "europe",
      },
      {
        subject: "paris",
        predicate: "located_in",
        object: "france",
      },
    ],
  };

  const result = checkConsistency(extraction);

  expect(result).toHaveLength(0);
});

it("erkennt einen Konflikt bei mehrstufiger located_in Hierarchie", () => {
  const extraction: FactExtraction = {
    entities: [],
    facts: [
      {
        subject: "munich",
        predicate: "located_in",
        object: "bavaria",
      },
      {
        subject: "bavaria",
        predicate: "located_in",
        object: "germany",
      },
      {
        subject: "germany",
        predicate: "located_in",
        object: "europe",
      },
      {
        subject: "munich",
        predicate: "located_in",
        object: "france",
      },
    ],
  };

  const result = checkConsistency(extraction);

  expect(result).toHaveLength(1);
  expect(result[0].type).toBe("conflicting_fact");
});

it("erkennt keinen Konflikt bei konsistenten alternativen located_in Pfaden", () => {
  const extraction: FactExtraction = {
    entities: [],
    facts: [
      {
        subject: "munich",
        predicate: "located_in",
        object: "bavaria",
      },
      {
        subject: "bavaria",
        predicate: "located_in",
        object: "germany",
      },
      {
        subject: "munich",
        predicate: "located_in",
        object: "southern_germany",
      },
      {
        subject: "southern_germany",
        predicate: "located_in",
        object: "germany",
      },
    ],
  };

  const result = checkConsistency(extraction);

  expect(result).toHaveLength(0);
});

it("erkennt widersprüchliche direkte located_in Angaben", () => {
  const extraction: FactExtraction = {
    entities: [],
    facts: [
      {
        subject: "munich",
        predicate: "located_in",
        object: "bavaria",
      },
      {
        subject: "munich",
        predicate: "located_in",
        object: "france",
      },
    ],
  };

  const result = checkConsistency(extraction);

  expect(result).toHaveLength(1);
  expect(result[0].type).toBe("conflicting_fact");
});

it("erkennt unterschiedliche direkte located_in Angaben trotz gemeinsamem Obergebiet als Konflikt", () => {
  const extraction: FactExtraction = {
    entities: [],
    facts: [
      {
        subject: "munich",
        predicate: "located_in",
        object: "bavaria",
      },
      {
        subject: "bavaria",
        predicate: "located_in",
        object: "germany",
      },
      {
        subject: "munich",
        predicate: "located_in",
        object: "france",
      },
      {
        subject: "france",
        predicate: "located_in",
        object: "europe",
      },
    ],
  };

  const result = checkConsistency(extraction);

  expect(result).toHaveLength(1);
  expect(result[0].type).toBe("conflicting_fact");
});

it("erkennt alternative located_in Pfade mit gemeinsamem Zwischengebiet als konsistent", () => {
  const extraction: FactExtraction = {
    entities: [],
    facts: [
      {
        subject: "munich",
        predicate: "located_in",
        object: "bavaria",
      },
      {
        subject: "bavaria",
        predicate: "located_in",
        object: "germany",
      },
      {
        subject: "munich",
        predicate: "located_in",
        object: "southern_germany",
      },
      {
        subject: "southern_germany",
        predicate: "located_in",
        object: "bavaria",
      },
    ],
  };

  const result = checkConsistency(extraction);

  expect(result).toHaveLength(0);
});

it("erkennt einen transitiven Zyklus nur bei zeitlich überlappenden Pfaden", () => {
  const extraction: FactExtraction = {
    entities: [],
    facts: [
      {
        subject: "a",
        predicate: "located_in",
        object: "b",
        temporal: {
          from: "2020",
          to: "2022",
        },
      },
      {
        subject: "b",
        predicate: "located_in",
        object: "a",
        temporal: {
          from: "2021",
          to: "2023",
        },
      },
    ],
  };

  const result = checkConsistency(extraction);

  expect(result).toHaveLength(1);
  expect(result[0].type).toBe("conflicting_fact");
});

it("erkennt keinen transitiven Zyklus bei vollständig getrennten Zeiträumen", () => {
  const extraction: FactExtraction = {
    entities: [],
    facts: [
      {
        subject: "a",
        predicate: "located_in",
        object: "b",
        temporal: {
          from: "2020",
          to: "2021",
        },
      },
      {
        subject: "b",
        predicate: "located_in",
        object: "a",
        temporal: {
          from: "2022",
          to: "2023",
        },
      },
    ],
  };

  const result = checkConsistency(extraction);

  expect(result).toHaveLength(0);
});

it("does not report a located_in conflict when locations share a temporally compatible ancestor", () => {
  const extraction: FactExtraction = {
    entities: [
      {
        id: "munich",
        name: "Munich",
        type: "place",
      },
      {
        id: "germany",
        name: "Germany",
        type: "place",
      },
      {
        id: "berlin",
        name: "Berlin",
        type: "place",
      },
      {
        id: "anna",
        name: "Anna",
        type: "person",
      },
    ],
    facts: [
      {
        subject: "Munich",
        predicate: "located_in",
        object: "Germany",
        temporal: {
          from: "2020",
          to: "2030",
        },
      },
      {
        subject: "Berlin",
        predicate: "located_in",
        object: "Germany",
        temporal: {
          from: "2020",
          to: "2030",
        },
      },
      {
        subject: "Anna",
        predicate: "located_in",
        object: "Munich",
        temporal: {
          from: "2022",
          to: "2025",
        },
      },
      {
        subject: "Anna",
        predicate: "located_in",
        object: "Berlin",
        temporal: {
          from: "2022",
          to: "2025",
        },
      },
    ],
  };

  expect(checkConsistency(extraction)).toEqual([]);
});

it("currently treats a shared ancestor as compatible even when temporal ranges do not overlap", () => {
  const extraction: FactExtraction = {
    entities: [
      {
        id: "munich",
        name: "Munich",
        type: "place",
      },
      {
        id: "germany",
        name: "Germany",
        type: "place",
      },
      {
        id: "berlin",
        name: "Berlin",
        type: "place",
      },
      {
        id: "anna",
        name: "Anna",
        type: "person",
      },
    ],
    facts: [
      {
        subject: "Munich",
        predicate: "located_in",
        object: "Germany",
        temporal: {
          from: "2000",
          to: "2010",
        },
      },
      {
        subject: "Berlin",
        predicate: "located_in",
        object: "Germany",
        temporal: {
          from: "2000",
          to: "2010",
        },
      },
      {
        subject: "Anna",
        predicate: "located_in",
        object: "Munich",
        temporal: {
          from: "2020",
          to: "2025",
        },
      },
      {
        subject: "Anna",
        predicate: "located_in",
        object: "Berlin",
        temporal: {
          from: "2020",
          to: "2025",
        },
      },
    ],
  };
  expect(checkConsistency(extraction)).toEqual([
    {
      type: "conflicting_fact",
      category: "exclusive_fact",
      subject: "anna",
      predicate: "located_in",
      facts: [
        extraction.facts[2],
        extraction.facts[3],
      ],
      message:
        "Anna is placed in both Munich and Berlin.",
      severity: "medium",
      impact: "world",
      impactDescription:
        "The story's spatial context is contradictory. Location changes and the logic of the world should be reviewed.",
    },
  ]);
});



it("erkennt mehrere unabhängige Konflikte gleichzeitig", () => {
  const extraction: FactExtraction = {
    entities: [],
    facts: [
      {
        subject: "anna",
        predicate: "lives_in",
        object: "munich",
      },
      {
        subject: "anna",
        predicate: "lives_in",
        object: "berlin",
      },
      {
        subject: "thomas",
        predicate: "works_at",
        object: "company_a",
      },
      {
        subject: "thomas",
        predicate: "works_at",
        object: "company_b",
      },
    ],
  };

  const result = checkConsistency(extraction);

  expect(result).toHaveLength(2);
  expect(
    result.filter(
      (inconsistency) =>
        inconsistency.type === "conflicting_fact"
    )
  ).toHaveLength(2);
});

it("erkennt einen Konflikt zwischen einem zeitlich unbegrenzten und einem zeitlich begrenzten exklusiven Fact", () => {
  const extraction: FactExtraction = {
    entities: [],
    facts: [
      {
        subject: "anna",
        predicate: "lives_in",
        object: "munich",
      },
      {
        subject: "anna",
        predicate: "lives_in",
        object: "berlin",
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
  expect(result[0].type).toBe("conflicting_fact");
});

it("erkennt einen Konflikt zwischen einem zeitlich begrenzten und einem zeitlich unbegrenzten exklusiven Fact", () => {
  const extraction: FactExtraction = {
    entities: [],
    facts: [
      {
        subject: "anna",
        predicate: "lives_in",
        object: "munich",
        temporal: {
          text: "2026",
          from: "2026-01-01",
          to: "2026-12-31",
        },
      },
      {
        subject: "anna",
        predicate: "lives_in",
        object: "berlin",
      },
    ],
  };

  const result = checkConsistency(extraction);

  expect(result).toHaveLength(1);
  expect(result[0].type).toBe("conflicting_fact");
});

it("behandelt Entity-ID und Entity-Name als dieselbe Entity", () => {
  const extraction: FactExtraction = {
    entities: [
      {
        id: "anna",
        name: "Anna",
        type: "person",
      },
    ],
    facts: [
      {
        subject: "anna",
        predicate: "lives_in",
        object: "munich",
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

it("erkennt Entity-ID und Entity-Name bei identischem Fact nicht als Duplikat-Konflikt", () => {
  const extraction: FactExtraction = {
    entities: [
      {
        id: "anna",
        name: "Anna",
        type: "person",
      },
    ],
    facts: [
      {
        subject: "anna",
        predicate: "lives_in",
        object: "munich",
      },
      {
        subject: "Anna",
        predicate: "lives_in",
        object: "munich",
      },
    ],
  };

  const result = checkConsistency(extraction);

  expect(result).toHaveLength(0);
});

it("erkennt einen konsistenten transitiven Graphen mit mehreren Pfaden", () => {
  const extraction: FactExtraction = {
    entities: [],
    facts: [
      {
        subject: "anna",
        predicate: "younger_than",
        object: "ben",
      },
      {
        subject: "anna",
        predicate: "younger_than",
        object: "clara",
      },
      {
        subject: "ben",
        predicate: "younger_than",
        object: "david",
      },
      {
        subject: "clara",
        predicate: "younger_than",
        object: "david",
      },
    ],
  };

  const result = checkConsistency(extraction);

  expect(result).toHaveLength(0);
});

it("erkennt einen Konflikt in einem verzweigten transitiven Graphen", () => {
  const extraction: FactExtraction = {
    entities: [],
    facts: [
      {
        subject: "Alice",
        predicate: "younger_than",
        object: "Bob",
      },
      {
        subject: "Alice",
        predicate: "younger_than",
        object: "Carol",
      },
      {
        subject: "Bob",
        predicate: "younger_than",
        object: "David",
      },
      {
        subject: "Carol",
        predicate: "younger_than",
        object: "David",
      },
      {
        subject: "Alice",
        predicate: "older_than",
        object: "David",
      },
    ],
  };

  const result = checkConsistency(extraction);

  expect(result.length).toBeGreaterThan(0);
  expect(
    result.some(
      (inconsistency) =>
        inconsistency.subject.toLowerCase() === "alice" &&
        inconsistency.predicate === "younger_than"
    )
  ).toBe(true);
});

it("erkennt keinen Konflikt bei mehreren konsistenten transitiven Pfaden", () => {
  const extraction: FactExtraction = {
    entities: [],
    facts: [
      {
        subject: "Alice",
        predicate: "younger_than",
        object: "Bob",
      },
      {
        subject: "Alice",
        predicate: "younger_than",
        object: "Carol",
      },
      {
        subject: "Bob",
        predicate: "younger_than",
        object: "David",
      },
      {
        subject: "Carol",
        predicate: "younger_than",
        object: "David",
      },
    ],
  };

  const result = checkConsistency(extraction);

  expect(result).toHaveLength(0);
});

it("erkennt keinen transitiven Konflikt bei zeitlich getrennten Pfaden", () => {
  const extraction: FactExtraction = {
    entities:[],
    facts: [
      {
        subject: "Alice",
        predicate: "younger_than",
        object: "Bob",
        temporal: {
          from: "2000",
          to: "2010",
        },
      },
      {
        subject: "Bob",
        predicate: "younger_than",
        object: "David",
        temporal: {
          from: "2011",
          to: "2020",
        },
      },
      {
        subject: "Alice",
        predicate: "older_than",
        object: "David",
        temporal: {
          from: "2011",
          to: "2020",
        },
      },
    ],
  };

  const result = checkConsistency(extraction);

  expect(result).toHaveLength(0);
});

it("erkennt einen Konflikt wenn nur einer von mehreren transitiven Pfaden widersprüchlich ist", () => {
  const extraction: FactExtraction = {
    entities: [],
    facts: [
      {
        subject: "Alice",
        predicate: "younger_than",
        object: "Bob",
      },
      {
        subject: "Bob",
        predicate: "younger_than",
        object: "David",
      },

      {
        subject: "Alice",
        predicate: "younger_than",
        object: "Carol",
      },
      {
        subject: "Carol",
        predicate: "younger_than",
        object: "Eve",
      },

      {
        subject: "Alice",
        predicate: "older_than",
        object: "David",
      },
    ],
  };

  const result = checkConsistency(extraction);

  expect(result.length).toBeGreaterThan(0);

  expect(
    result.some(
      (inconsistency) =>
        inconsistency.subject.toLowerCase() === "alice"
    )
  ).toBe(true);
});

it("erkennt einen transitiven Konflikt bei teilweise überlappenden Pfad-Zeiträumen", () => {
  const extraction: FactExtraction = {
    entities: [],
    facts: [
      {
        subject: "anna",
        predicate: "younger_than",
        object: "ben",
        temporal: {
          text: "14.08. bis 16.08.",
          from: "2026-08-14",
          to: "2026-08-16",
        },
      },
      {
        subject: "ben",
        predicate: "younger_than",
        object: "clara",
        temporal: {
          text: "15.08. bis 17.08.",
          from: "2026-08-15",
          to: "2026-08-17",
        },
      },
      {
        subject: "anna",
        predicate: "older_than",
        object: "clara",
        temporal: {
          text: "16.08.",
          from: "2026-08-16",
          to: "2026-08-16",
        },
      },
    ],
  };

  const result = checkConsistency(extraction);

  expect(result).toHaveLength(1);
  expect(result[0].type).toBe("conflicting_fact");
});

it("erkennt keinen transitiven Konflikt wenn die Pfad-Zeiträume keinen gemeinsamen Schnitt haben", () => {
  const extraction: FactExtraction = {
    entities: [],
    facts: [
      {
        subject: "anna",
        predicate: "younger_than",
        object: "ben",
        temporal: {
          text: "14.08. bis 15.08.",
          from: "2026-08-14",
          to: "2026-08-15",
        },
      },
      {
        subject: "ben",
        predicate: "younger_than",
        object: "clara",
        temporal: {
          text: "16.08. bis 17.08.",
          from: "2026-08-16",
          to: "2026-08-17",
        },
      },
      {
        subject: "anna",
        predicate: "older_than",
        object: "clara",
        temporal: {
          text: "16.08.",
          from: "2026-08-16",
          to: "2026-08-16",
        },
      },
    ],
  };

  const result = checkConsistency(extraction);

  expect(result).toHaveLength(0);
});

it("erkennt unterschiedliche located_in Angaben verschiedener Subjects nicht als Konflikt", () => {
  const extraction: FactExtraction = {
    entities: [],
    facts: [
      {
        subject: "munich",
        predicate: "located_in",
        object: "bavaria",
      },
      {
        subject: "berlin",
        predicate: "located_in",
        object: "brandenburg",
      },
    ],
  };

  const result = checkConsistency(extraction);

  expect(result).toHaveLength(0);
});

it("erkennt einen Konflikt bei inkompatiblen alternativen located_in Pfaden", () => {
  const extraction: FactExtraction = {
    entities: [],
    facts: [
      {
        subject: "munich",
        predicate: "located_in",
        object: "bavaria",
      },
      {
        subject: "munich",
        predicate: "located_in",
        object: "southern_germany",
      },
      {
        subject: "southern_germany",
        predicate: "located_in",
        object: "france",
      },
    ],
  };

  const result = checkConsistency(extraction);

  expect(result).toHaveLength(1);
  expect(result[0].type).toBe("conflicting_fact");
});

it("erkennt einen located_in Konflikt trotz gemeinsamem Vorfahren bei nicht überlappenden Vorfahren-Zeiträumen", () => {
  const extraction: FactExtraction = {
    entities: [],
    facts: [
      {
        subject: "munich",
        predicate: "located_in",
        object: "germany",
        temporal: {
          from: "2000",
          to: "2010",
        },
      },
      {
        subject: "berlin",
        predicate: "located_in",
        object: "germany",
        temporal: {
          from: "2000",
          to: "2010",
        },
      },
      {
        subject: "anna",
        predicate: "located_in",
        object: "munich",
        temporal: {
          from: "2020",
          to: "2025",
        },
      },
      {
        subject: "anna",
        predicate: "located_in",
        object: "berlin",
        temporal: {
          from: "2020",
          to: "2025",
        },
      },
    ],
  };

  const result = checkConsistency(extraction);

  expect(result).toHaveLength(1);
  expect(result[0].type).toBe("conflicting_fact");
});

it("meldet mehrere Konflikte trotz Duplikaten jeweils nur einmal", () => {
  const extraction: FactExtraction = {
    entities: [],
    facts: [
      {
        subject: "anna",
        predicate: "lives_in",
        object: "munich",
      },
      {
        subject: "anna",
        predicate: "lives_in",
        object: "munich",
      },
      {
        subject: "anna",
        predicate: "lives_in",
        object: "berlin",
      },
      {
        subject: "thomas",
        predicate: "works_at",
        object: "company_a",
      },
      {
        subject: "thomas",
        predicate: "works_at",
        object: "company_a",
      },
      {
        subject: "thomas",
        predicate: "works_at",
        object: "company_b",
      },
    ],
  };

  const result = checkConsistency(extraction);

  expect(result).toHaveLength(2);

  expect(
    result.filter(
      (inconsistency) =>
        inconsistency.subject === "anna" &&
        inconsistency.predicate === "lives_in"
    )
  ).toHaveLength(1);

  expect(
    result.filter(
      (inconsistency) =>
        inconsistency.subject === "thomas" &&
        inconsistency.predicate === "works_at"
    )
  ).toHaveLength(1);
});

it("erkennt eine chronologische Folge von exklusiven Fakten nicht als Konflikt", () => {
  const extraction: FactExtraction = {
    entities: [],
    facts: [
      {
        subject: "anna",
        predicate: "lives_in",
        object: "munich",
        temporal: {
          from: "2026-08-14",
          to: "2026-08-14",
          source: "implicit",
          anchor: "2026-08-14",
          advancesTimeline: false,
        },
      },
      {
        subject: "anna",
        predicate: "lives_in",
        object: "berlin",
        temporal: {
          text: "Two years later",
          from: "2028-08-14",
          to: "2028-08-14",
          source: "relative",
          anchor: "2026-08-14",
          advancesTimeline: true,
        },
      },
      {
        subject: "anna",
        predicate: "lives_in",
        object: "munich",
        temporal: {
          text: "Two years later",
          from: "2030-08-14",
          to: "2030-08-14",
          source: "relative",
          anchor: "2028-08-14",
          advancesTimeline: true,
        },
      },
    ],
  };

  expect(checkConsistency(extraction)).toEqual([]);
});

it("erkennt gleichzeitig widersprüchliche Wohnorte", () => {
  const extraction: FactExtraction = {
    entities: [],
    facts: [
      {
        subject: "anna",
        predicate: "lives_in",
        object: "munich",
        temporal: {
          from: "2026-08-14",
          to: "2026-08-14",
          source: "implicit",
          anchor: "2026-08-14",
          advancesTimeline: false,
        },
      },
      {
        subject: "anna",
        predicate: "lives_in",
        object: "hamburg",
        temporal: {
          text: "Today",
          from: "2026-08-14",
          to: "2026-08-14",
          source: "anchor",
          anchor: "2026-08-14",
          advancesTimeline: false,
        },
      },
    ],
  };

  expect(checkConsistency(extraction)).toHaveLength(1);
});

it("erkennt younger_than als Widerspruch zu konkreten Altersangaben", () => {
  const extraction: FactExtraction = {
    entities: [],
    facts: [
      {
        subject: "anna",
        predicate: "age",
        value: 27,
        temporal: {
          from: "2028-08-14",
          to: "2028-08-14",
        },
      },
      {
        subject: "thomas",
        predicate: "age",
        value: 30,
        temporal: {
          from: "2028-08-14",
          to: "2028-08-14",
        },
      },
      {
        subject: "thomas",
        predicate: "younger_than",
        object: "anna",
        temporal: {
          from: "2028-08-14",
          to: "2028-08-14",
        },
      },
    ],
  };

  const result = checkConsistency(extraction);

  expect(result).toHaveLength(1);
});

it("erkennt older_than als konsistent mit konkreten Altersangaben", () => {
  const extraction: FactExtraction = {
    entities: [],
    facts: [
      {
        subject: "anna",
        predicate: "age",
        value: 27,
        temporal: {
          from: "2028-08-14",
          to: "2028-08-14",
        },
      },
      {
        subject: "thomas",
        predicate: "age",
        value: 30,
        temporal: {
          from: "2028-08-14",
          to: "2028-08-14",
        },
      },
      {
        subject: "thomas",
        predicate: "older_than",
        object: "anna",
        temporal: {
          from: "2028-08-14",
          to: "2028-08-14",
        },
      },
    ],
  };

  const result = checkConsistency(extraction);

  expect(result).toHaveLength(0);
});

it("vermischt Altersangaben aus unterschiedlichen Zeitpunkten nicht", () => {
  const extraction: FactExtraction = {
    entities: [],
    facts: [
      {
        subject: "anna",
        predicate: "age",
        value: 27,
        temporal: {
          from: "2026-08-14",
          to: "2026-08-14",
        },
      },
      {
        subject: "thomas",
        predicate: "age",
        value: 30,
        temporal: {
          from: "2028-08-14",
          to: "2028-08-14",
        },
      },
      {
        subject: "thomas",
        predicate: "younger_than",
        object: "anna",
        temporal: {
          from: "2028-08-14",
          to: "2028-08-14",
        },
      },
    ],
  };

  const result = checkConsistency(extraction);

  expect(result).toHaveLength(0);
});

it("erkennt younger_than anhand zeitlich früherer age-Facts", () => {
  const extraction: FactExtraction = {
    entities: [],
    facts: [
      {
        subject: "anna",
        predicate: "age",
        value: 27,
        temporal: {
          from: "2026-08-14",
          to: "2026-08-14",
        },
      },
      {
        subject: "thomas",
        predicate: "age",
        value: 30,
        temporal: {
          from: "2026-08-14",
          to: "2026-08-14",
        },
      },
      {
        subject: "thomas",
        predicate: "younger_than",
        object: "anna",
        temporal: {
          from: "2028-08-14",
          to: "2028-08-14",
        },
      },
    ],
  };

  const result = checkConsistency(extraction);

  expect(result).toHaveLength(1);
});

it("erkennt younger_than als konsistent, wenn die Altersdifferenz stimmt", () => {
  const extraction: FactExtraction = {
    entities: [],
    facts: [
      {
        subject: "anna",
        predicate: "age",
        value: 27,
        temporal: {
          from: "2026-08-14",
          to: "2026-08-14",
        },
      },
      {
        subject: "thomas",
        predicate: "age",
        value: 25,
        temporal: {
          from: "2026-08-14",
          to: "2026-08-14",
        },
      },
      {
        subject: "thomas",
        predicate: "younger_than",
        object: "anna",
        temporal: {
          from: "2028-08-14",
          to: "2028-08-14",
        },
      },
    ],
  };

  const result = checkConsistency(extraction);

  expect(result).toHaveLength(0);
});

});
