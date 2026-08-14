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

});