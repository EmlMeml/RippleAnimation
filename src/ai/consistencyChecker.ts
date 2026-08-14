import type {
  Fact,
  FactExtraction,
  Predicate,
} from "../types/facts";

export interface Inconsistency {
  type: "conflicting_fact";
  subject: string;
  predicate: string;
  facts: FactExtraction["facts"];
  message: string;
}

/*
 * Diese Prädikate dürfen für ein Subjekt
 * normalerweise nur einen unterschiedlichen Wert haben.
 *
 */
const exclusivePredicates: Predicate[] = [
  "age",
  "gender",
  "born_in",
  "lives_in",
  "works_at",
  "occupation",
  "located_in",
];

/*
 * Diese Prädikate stehen logisch im direkten Gegensatz zueinander.
 *
 */
const opposingPredicates: Array<
  [Predicate, Predicate]
> = [
  ["younger_than", "older_than"],
];

/*
 * Inverse Beziehungen beschreiben dieselbe Beziehung
 * aus unterschiedlichen Perspektiven.
 *
 */
const inversePredicates: Partial<
  Record<Predicate, Predicate>
> = {
  parent_of: "child_of",
  child_of: "parent_of",

  owns:"has",
  has: "owns",
};

/*
 * Symmetrische Beziehungen müssen nicht doppelt
 * angegeben werden, sind aber auch nicht widersprüchlich.
 *
 */
const symmetricPredicates: Predicate[] = [
  "sibling_of",
  "friend_of",
  "married_to",
];

/*
* Selbstbeziehungen
*/

const irreflexivePredicates: Predicate[] = [
  "sibling_of",
  "friend_of",
  "married_to",
  "younger_than",
  "older_than",
  "parent_of",
  "child_of",
];

/*
 * Transitive Beziehungen/ transitive relationships 
*/
const transitivePredicates: Predicate[] = [
  "younger_than",
  "older_than",
];

/*
 * Normalisiert Werte für Vergleiche.
 *
 */
function normalizeValue(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

/*
 * Liefert den Vergleichswert eines Facts.
 *
 */
function getFactValue(fact: Fact): string {
  if (fact.object !== undefined) {
    return normalizeValue(fact.object);
  }

  return normalizeValue(fact.value);
}

/*
 * Erstellt einen eindeutigen Schlüssel für eine Beziehung.
 *
 * Wichtig:
 * Subject und Object werden getrennt normalisiert.
 */
/* function getRelationKey(fact: Fact): string | null {
  if (fact.object === undefined || fact.object === null) {
    return null;
  }

  return [
    normalizeValue(fact.subject),
    fact.predicate,
    normalizeValue(fact.object),
  ].join("|");
}
 */

/*
 * Erstellt einen Schlüssel für eine symmetrische Beziehung.
 *
 */
function getSymmetricRelationKey(fact: Fact): string | null {
  if (fact.object === undefined || fact.object === null) {
    return null;
  }

  const subject = normalizeValue(fact.subject);
  const object = normalizeValue(fact.object);

  const entities = [subject, object].sort();

  return [
    fact.predicate,
    entities[0],
    entities[1],
  ].join("|");
}

/*
 * Erstellt einen Schlüssel für eine inverse Beziehung.
 *
 */
/* function getInverseRelationKey(fact: Fact): string | null {
  if (fact.object === undefined || fact.object === null) {
    return null;
  }

  const inversePredicate =
    inversePredicates[fact.predicate];

  if (!inversePredicate) {
    return null;
  }

  const subject = normalizeValue(fact.subject);
  const object = normalizeValue(fact.object);*/

  /*
   * Wir bringen beide Richtungen auf dieselbe Form.
   */
  /*const predicatePair = [
    fact.predicate,
    inversePredicate,
  ].sort();

  const entityPair = [
    subject,
    object,
  ].sort();

  return [
    predicatePair[0],
    predicatePair[1],
    entityPair[0],
    entityPair[1],
  ].join("|");
} */

function checkExclusiveFacts(
  extraction: FactExtraction
): Inconsistency[] {
  const inconsistencies: Inconsistency[] = [];

  for (const predicate of exclusivePredicates) {
    const facts = extraction.facts.filter(
      (fact) => fact.predicate === predicate
    );

    const grouped = new Map<
      string,
      Fact[]
    >();

    for (const fact of facts) {
      const subject = normalizeValue(fact.subject);

      const existing =
        grouped.get(subject) ?? [];

      existing.push(fact);

      grouped.set(subject, existing);
    }

    for (const [
      subject,
      subjectFacts,
    ] of grouped) {
      const uniqueValues = new Set(
        subjectFacts.map(getFactValue)
      );

      if (uniqueValues.size > 1) {
        inconsistencies.push({
          type: "conflicting_fact",
          subject,
          predicate,
          facts: subjectFacts,
          message:
            `${subject} hat widersprüchliche Angaben für ` +
            `"${predicate}".`,
        });
      }
    }
  }

  return inconsistencies;
}

function checkOpposingPredicates(
  extraction: FactExtraction
): Inconsistency[] {
  const inconsistencies: Inconsistency[] = [];

  for (const [
    predicateA,
    predicateB,
  ] of opposingPredicates) {

    const factsA = extraction.facts.filter(
      (fact) => fact.predicate === predicateA
    );

    const factsB = extraction.facts.filter(
      (fact) => fact.predicate === predicateB
    );

    for (const factA of factsA) {
      if (
        factA.object === undefined ||
        factA.object === null
      ) {
        continue;
      }

      const matchingFact = factsB.find(
        (factB) =>
          normalizeValue(factB.subject) ===
            normalizeValue(factA.subject) &&
          normalizeValue(factB.object) ===
            normalizeValue(factA.object)
      );

      if (!matchingFact) {
        continue;
      }

      inconsistencies.push({
        type: "conflicting_fact",
        subject: factA.subject,
        predicate: predicateA,
        facts: [
          factA,
          matchingFact,
        ],
        message:
          `${factA.subject} hat widersprüchliche ` +
          `Angaben: "${predicateA}" und ` +
          `"${predicateB}".`,
      });
    }
  }

  return inconsistencies;
}

function checkInversePredicates(
  extraction: FactExtraction
): Inconsistency[] {
  const inconsistencies: Inconsistency[] = [];

  /*
   * Wir prüfen nur Fälle, bei denen dasselbe Subjekt
   * mit demselben Objekt beide Richtungen verwendet.
   *
   */
  for (const [
    predicateA,
    predicateB,
  ] of Object.entries(inversePredicates) as Array<
    [Predicate, Predicate]
  >) {
    /*
     * Damit wir nicht denselben Paarvergleich zweimal
     * durchführen
     *
     */
    if (predicateA > predicateB) {
      continue;
    }

    const factsA = extraction.facts.filter(
      (fact) => fact.predicate === predicateA
    );

    const factsB = extraction.facts.filter(
      (fact) => fact.predicate === predicateB
    );

    for (const factA of factsA) {
      if (
        factA.object === undefined ||
        factA.object === null
      ) {
        continue;
      }

      const matchingFact = factsB.find(
        (factB) =>
          normalizeValue(factB.subject) ===
            normalizeValue(factA.subject) &&
          normalizeValue(factB.object) ===
            normalizeValue(factA.object)
      );

      if (!matchingFact) {
        continue;
      }

      inconsistencies.push({
        type: "conflicting_fact",
        subject: factA.subject,
        predicate: predicateA,
        facts: [
          factA,
          matchingFact,
        ],
        message:
          `${factA.subject} hat widersprüchliche ` +
          `Beziehungen: "${predicateA}" und ` +
          `"${predicateB}".`,
      });
    }
  }

  return inconsistencies;
}

function checkSymmetricPredicates(
  extraction: FactExtraction
): Inconsistency[] {
  /*
   * Symmetrische Beziehungen erzeugen grundsätzlich
   * keine Inkonsistenz.
   *
   * Wir normalisieren sie hier lediglich, damit wir
   * später problemlos Duplikate erkennen können.
   *
   * Aktuell gibt diese Funktion deshalb noch keine
   * Inkonsistenzen zurück.
   */
  const seen = new Set<string>();

  for (const fact of extraction.facts) {
    if (
      !symmetricPredicates.includes(
        fact.predicate
      )
    ) {
      continue;
    }

    const key =
      getSymmetricRelationKey(fact);

    if (!key) {
      continue;
    }

    seen.add(key);
  }

  return [];
}

function checkSelfRelations(
  extraction: FactExtraction
): Inconsistency[] {
  const inconsistencies: Inconsistency[] = [];

  for (const fact of extraction.facts) {
    if (!irreflexivePredicates.includes(fact.predicate)) {
      continue;
    }

    if (
      fact.object === undefined ||
      fact.object === null
    ) {
      continue;
    }

    if (
      normalizeValue(fact.subject) !==
      normalizeValue(fact.object)
    ) {
      continue;
    }

    inconsistencies.push({
      type: "conflicting_fact",
      subject: fact.subject,
      predicate: fact.predicate,
      facts: [fact],
      message:
        `${fact.subject} kann nicht über ` +
        `"${fact.predicate}" mit sich selbst ` +
        `in Beziehung stehen.`,
    });
  }

  return inconsistencies;
}

function hasTransitiveRelation(
  facts: Fact[],
  predicate: Predicate,
  start: string,
  target: string
): boolean {
  const normalizedStart = normalizeValue(start);
  const normalizedTarget = normalizeValue(target);

  const queue: Array<{
    entity: string;
    depth: number;
  }> = [
    {
      entity: normalizedStart,
      depth: 0,
    },
  ];

  const visited = new Set<string>();

  while (queue.length > 0) {
    const current = queue.shift();

    if (!current) {
      continue;
    }

    const {
      entity,
      depth,
    } = current;

    /*
     * Eine transitive Beziehung braucht
     * mindestens zwei Kanten.
     */
    if (
      entity === normalizedTarget &&
      depth >= 2
    ) {
      return true;
    }

    const visitKey = `${entity}|${depth}`;

    if (visited.has(visitKey)) {
      continue;
    }

    visited.add(visitKey);

    for (const fact of facts) {
      if (fact.predicate !== predicate) {
        continue;
      }

      if (
        fact.object === undefined ||
        fact.object === null
      ) {
        continue;
      }

      if (
        normalizeValue(fact.subject) !== entity
      ) {
        continue;
      }

      const next = normalizeValue(fact.object);

      queue.push({
        entity: next,
        depth: depth + 1,
      });
    }
  }

  return false;
}

function checkTransitivePredicates(
  extraction: FactExtraction
): Inconsistency[] {
  const inconsistencies: Inconsistency[] = [];

  for (const predicate of transitivePredicates) {
    const facts = extraction.facts.filter(
      (fact) => fact.predicate === predicate
    );

    for (const fact of facts) {
      if (
        fact.object === undefined ||
        fact.object === null
      ) {
        continue;
      }

      const oppositePredicate =
        predicate === "younger_than"
          ? "older_than"
          : "younger_than";

      const oppositeFacts =
        extraction.facts.filter(
          (candidate) =>
            candidate.predicate ===
            oppositePredicate
        );

      for (const oppositeFact of oppositeFacts) {
        if (
          oppositeFact.object === undefined ||
          oppositeFact.object === null
        ) {
          continue;
        }

        if (
          normalizeValue(
            oppositeFact.subject
          ) !== normalizeValue(fact.subject)
        ) {
          continue;
        }

        const hasIndirectRelation =
          hasTransitiveRelation(
            facts,
            predicate,
            fact.subject,
            oppositeFact.object
          );

        if (!hasIndirectRelation) {
          continue;
        }

        inconsistencies.push({
          type: "conflicting_fact",
          subject: fact.subject,
          predicate,
          facts: [
            fact,
            oppositeFact,
          ],
          message:
            `${fact.subject} hat widersprüchliche ` +
            `Altersbeziehungen: "${predicate}" ` +
            `und "${oppositePredicate}".`,
        });
      }
    }
  }

  return inconsistencies;
}

export function checkConsistency(
  extraction: FactExtraction
): Inconsistency[] {
  const inconsistencies: Inconsistency[] = [];

  /*
   * 1. Exklusive Fakten
   */
  inconsistencies.push(
    ...checkExclusiveFacts(extraction)
  );

  /*
   * 2. Gegensätzliche Prädikate
   */
  inconsistencies.push(
    ...checkOpposingPredicates(extraction)
  );

  /*
   * 3. Inverse Beziehungen
   */
  inconsistencies.push(
    ...checkInversePredicates(extraction)
  );

  /*
   * 4. Symmetrische Beziehungen
   */
  inconsistencies.push(
    ...checkSymmetricPredicates(extraction)
  );

  /*
  * 5. Selbstbeziehungen
  */
  inconsistencies.push(
    ...checkSelfRelations(extraction)
  );


  /* 
  * 6. Transistive Beziehungen
   */
  inconsistencies.push(
    ...checkTransitivePredicates(extraction)
  );

  return inconsistencies;
}