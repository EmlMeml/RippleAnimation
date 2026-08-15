import type {
  Fact,
  FactExtraction,
  Predicate,
} from "../types/facts";
import { temporalRangesOverlap } from "./temporalOverlap";


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

function getFactKey(fact: Fact): string {
  const value = getFactValue(fact);

  const from = fact.temporal?.from ?? "";
  const to = fact.temporal?.to ?? "";

  return [
    normalizeValue(fact.subject),
    fact.predicate,
    value,
    from,
    to,
  ].join("|");
}

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

function checkExclusiveFacts(
  extraction: FactExtraction
): Inconsistency[] {
  const inconsistencies: Inconsistency[] = [];

  for (const predicate of exclusivePredicates) {
    /*
     * Alle Facts für das aktuell exklusive Prädikat.
     */
    const facts = extraction.facts.filter(
      (fact) => fact.predicate === predicate
    );

    /*
     * Identische Facts entfernen.
     *
     * Beispiel:
     *
     * Anna lives_in Munich
     * Anna lives_in Munich
     * Anna lives_in Berlin
     *
     * Die beiden Munich-Facts werden zu einem Fact.
     */
    const uniqueFacts = Array.from(
      new Map(
        facts.map((fact) => [
          getFactKey(fact),
          fact,
        ])
      ).values()
    );

    /*
     * Facts nach Subjekt gruppieren.
     *
     * Nur Facts desselben Subjekts können
     * miteinander in Konflikt stehen.
     */
    const grouped = new Map<
      string,
      Fact[]
    >();

    for (const fact of uniqueFacts) {
      const subject =
        normalizeValue(fact.subject);

      const existing =
        grouped.get(subject) ?? [];

      existing.push(fact);

      grouped.set(
        subject,
        existing
      );
    }

    /*
     * Innerhalb jeder Subjektgruppe werden
     * jeweils zwei Facts miteinander verglichen.
     */
    for (const [
      subject,
      subjectFacts,
    ] of grouped) {
      for (
        let i = 0;
        i < subjectFacts.length;
        i++
      ) {
        for (
          let j = i + 1;
          j < subjectFacts.length;
          j++
        ) {
          const factA = subjectFacts[i];
          const factB = subjectFacts[j];

          /*
           * Gleicher Wert ist kein Widerspruch.
           *
           * Beispiel:
           * Anna lebt in München.
           * Anna lebt heute in München.
           */
          if (
            getFactValue(factA) ===
            getFactValue(factB)
          ) {
            continue;
          }

          /*
           * Unterschiedliche Werte sind nur dann
           * widersprüchlich, wenn sich die zeitlichen
           * Gültigkeitsbereiche überschneiden.
           */
          if (
            !temporalRangesOverlap(
              factA,
              factB
            )
          ) {
            continue;
          }

          inconsistencies.push({
            type: "conflicting_fact",
            subject,
            predicate,
            facts: [
              factA,
              factB,
            ],
            message:
              `${subject} hat widersprüchliche Angaben für ` +
              `"${predicate}".`,
          });
        }
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
            normalizeValue(factA.object) &&
          temporalRangesOverlap(
            factA,
            factB
          )
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

function checkContradictoryInverseDirections(
  extraction: FactExtraction
): Inconsistency[] {
  const inconsistencies: Inconsistency[] = [];

  for (const [
    predicateA,
    predicateB,
  ] of Object.entries(inversePredicates) as Array<
    [Predicate, Predicate]
  >) {
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
            normalizeValue(factA.object) &&
          temporalRangesOverlap(
            factA,
            factB
          )
      );

      if (!matchingFact) {
        continue;
      }

      inconsistencies.push({
        type: "conflicting_fact",
        subject: factA.subject,
        predicate: factA.predicate,
        facts: [
          factA,
          matchingFact,
        ],
        message:
          `${factA.subject} kann nicht gleichzeitig ` +
          `"${predicateA}" und "${predicateB}" ` +
          `zu ${factA.object} sein.`,
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
  target: string,
  referenceFact: Fact
): boolean {
  const normalizedStart = normalizeValue(start);
  const normalizedTarget = normalizeValue(target);

  const queue: Array<{
    entity: string;
    depth: number;
    path: Fact[];
  }> = [
    {
      entity: normalizedStart,
      depth: 0,
      path: [],
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
      path,
    } = current;

    if (
      entity === normalizedTarget &&
      depth >= 2
    ) {
      /*
       * Der gesamte transitive Pfad muss zeitlich
       * mit dem Referenz-Fact überlappen.
       */
      const pathIsRelevant = path.every((fact) =>
        temporalRangesOverlap(
          fact,
          referenceFact
        )
      );

      if (pathIsRelevant) {
        return true;
      }
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

      /*
       * Eine Kante, die zeitlich nicht mit dem
       * Referenz-Fact zusammenfällt, kann nicht
       * Teil dieses Konfliktpfades sein.
       */
      if (
        !temporalRangesOverlap(
          fact,
          referenceFact
        )
      ) {
        continue;
      }

      const next = normalizeValue(fact.object);

      queue.push({
        entity: next,
        depth: depth + 1,
        path: [
          ...path,
          fact,
        ],
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
          oppositeFact.object,
          oppositeFact
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
  * 3 Widersprüchliche inverse Richtung
  */
  inconsistencies.push(
    ...checkContradictoryInverseDirections(extraction)
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