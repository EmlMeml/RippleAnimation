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
  "located_in",
  "works_at",
  "occupation",
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

type TemporalRange = {
  from?: string;
  to?: string;
};

function intersectTemporalRanges(
  first?: TemporalRange,
  second?: TemporalRange
): TemporalRange | null {
  if (!first && !second) {
    return {};
  }

  if (!first) {
    return {
      from: second?.from,
      to: second?.to,
    };
  }

  if (!second) {
    return {
      from: first.from,
      to: first.to,
    };
  }

  const from =
    first.from === undefined
      ? second.from
      : second.from === undefined
        ? first.from
        : first.from > second.from
          ? first.from
          : second.from;

  const to =
    first.to === undefined
      ? second.to
      : second.to === undefined
        ? first.to
        : first.to < second.to
          ? first.to
          : second.to;

  if (
    from !== undefined &&
    to !== undefined &&
    from > to
  ) {
    return null;
  }

  return {
    from,
    to,
  };
}

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
  "located_in",
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

function getReachableEntities(
  facts: Fact[],
  start: string,
  predicate: Predicate
): Set<string> {
  const reachable = new Set<string>();
  const queue = [normalizeValue(start)];

  while (queue.length > 0) {
    const current = queue.shift()!;

    if (reachable.has(current)) {
      continue;
    }

    reachable.add(current);

    for (const fact of getOutgoingFacts(
      facts,
      predicate,
      current
    )) {
      queue.push(
        normalizeValue(fact.object)
      );
    }
  }

  return reachable;
}


function getOutgoingFacts(
  facts: Fact[],
  predicate: Predicate,
  subject: string
): Fact[] {
  const normalizedSubject =
    normalizeValue(subject);

  return facts.filter(
    (fact) =>
      fact.predicate === predicate &&
      fact.object !== undefined &&
      fact.object !== null &&
      normalizeValue(fact.subject) ===
        normalizedSubject
  );
}

function findLocatedInPaths(
  facts: Fact[],
  start: string,
  target: string
): Fact[][] {
  const normalizedStart = normalizeValue(start);
  const normalizedTarget = normalizeValue(target);

  type QueueItem = {
    entity: string;
    path: Fact[];
  };

  const queue: QueueItem[] = [
    {
      entity: normalizedStart,
      path: [],
    },
  ];

  const paths: Fact[][] = [];

  const visited = new Set<string>();

  while (queue.length > 0) {
    const current = queue.shift();

    if (!current) {
      continue;
    }

    const {
      entity,
      path,
    } = current;

    if (entity === normalizedTarget) {
      paths.push(path);
      continue;
    }

    const visitKey = [
      entity,
      ...path.map(getFactKey),
    ].join("|");

    if (visited.has(visitKey)) {
      continue;
    }

    visited.add(visitKey);

    for (const fact of getOutgoingFacts(
        facts,
        "located_in",
        entity
      )) {
        if (
          path.some(
            (pathFact) =>
              getFactKey(pathFact) ===
              getFactKey(fact)
          )
        ) {
          continue;
        }

        queue.push({
          entity: normalizeValue(fact.object),
          path: [
            ...path,
            fact,
          ],
        });
      }
  }

  return paths;
}

function isPathTemporallyCompatible(
  path: Fact[],
  referenceFacts: Fact[]
): boolean {
  return referenceFacts.every(
    (referenceFact) =>
      path.every((pathFact) =>
        temporalRangesOverlap(
          pathFact,
          referenceFact
        )
      )
  );
}

function isHierarchicalLocatedIn(
  facts: Fact[],
  from: string,
  to: string,
  referenceFacts: Fact[]
): boolean {
  const normalizedFrom = normalizeValue(from);
  const normalizedTo = normalizeValue(to);

  if (normalizedFrom === normalizedTo) {
    return true;
  }

  const paths = findLocatedInPaths(
    facts,
    normalizedFrom,
    normalizedTo
  );

  return paths.some((path) =>
    isPathTemporallyCompatible(
      path,
      referenceFacts
    )
  );
}


function hasCommonDescendant(
  facts: Fact[],
  first: string,
  second: string
): boolean {
  const firstReachable =
    getReachableEntities(
      facts,
      first,
      "located_in"
    );

  const secondReachable =
    getReachableEntities(
      facts,
      second,
      "located_in"
    );

  for (const entity of firstReachable) {
    if (secondReachable.has(entity)) {
      return true;
    }
  }

  return false;
}


function areLocatedInValuesCompatible(
  facts: Fact[],
  factA: Fact,
  factB: Fact
): boolean {
  const valueA = getFactValue(factA);
  const valueB = getFactValue(factB);

  if (valueA === valueB) {
    return true;
  }

  if (
    isHierarchicalLocatedIn(
      facts,
      valueA,
      valueB,
      [factA, factB]
    )
  ) {
    return true;
  }

  if (
    isHierarchicalLocatedIn(
      facts,
      valueB,
      valueA,
      [factA, factB]
    )
  ) {
    return true;
  }

  if (
    hasCommonDescendant(
      facts,
      valueA,
      valueB
    )
  ) {
    return true;
  }

  return false;
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

          if (predicate === "located_in") {
            const locatedFacts =
              extraction.facts.filter(
                (fact) =>
                  fact.predicate === "located_in"
              );

            if (
              areLocatedInValuesCompatible(
                locatedFacts,
                factA,
                factB
              )
            ) {
              continue;
            }
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

  for (const [predicateA, predicateB] of opposingPredicates) {
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

      const matchingFact = factsB.find((factB) => {
        if (
          factB.object === undefined ||
          factB.object === null
        ) {
          return false;
        }

        const sameSubject =
          normalizeValue(factA.subject) ===
          normalizeValue(factB.subject);

        const sameObject =
          normalizeValue(factA.object) ===
          normalizeValue(factB.object);

        const sameTime =
          temporalRangesOverlap(
            factA,
            factB
          );

        return (
          sameSubject &&
          sameObject &&
          sameTime
        );
      });

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

  for (const [predicateA, predicateB] of Object.entries(
    inversePredicates
  ) as Array<[Predicate, Predicate]>) {
    /*
     * Jede inverse Beziehung wird nur einmal geprüft.
     *
     * Beispiel:
     * parent_of -> child_of
     *
     * child_of -> parent_of
     *
     * Die zweite Variante wäre dieselbe Prüfung
     * in umgekehrter Richtung.
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

      const matchingFact = factsB.find((factB) => {
        if (
          factB.object === undefined ||
          factB.object === null
        ) {
          return false;
        }

        const sameSubject =
          normalizeValue(factA.subject) ===
          normalizeValue(factB.subject);

        const sameObject =
          normalizeValue(factA.object) ===
          normalizeValue(factB.object);

        const sameTime =
          temporalRangesOverlap(
            factA,
            factB
          );

        return (
          sameSubject &&
          sameObject &&
          sameTime
        );
      });

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

function getTemporalIntersection(
  currentFrom: string | undefined,
  currentTo: string | undefined,
  fact: Fact
): TemporalRange | null {
  return intersectTemporalRanges(
    {
      from: currentFrom,
      to: currentTo,
    },
    fact.temporal
  );
}

function hasTransitiveRelation(
  facts: Fact[],
  predicate: Predicate,
  start: string,
  target: string,
  referenceFact: Fact
): boolean {
  const normalizedStart =
    normalizeValue(start);

  const normalizedTarget =
    normalizeValue(target);

  const queue: Array<{
    entity: string;
    path: Fact[];
  }> = [
    {
      entity: normalizedStart,
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
      path,
    } = current;

    /*
     * Mindestens zwei Kanten sind notwendig,
     * damit es sich um eine indirekte
     * transitive Beziehung handelt.
     */
    if (
      entity === normalizedTarget &&
      path.length >= 2
    ) {
      if (
        isPathTemporallyCompatible(
          path,
          [referenceFact]
        )
      ) {
        return true;
      }
    }

    const visitKey = [
      entity,
      ...path.map(getFactKey),
    ].join("|");

    if (visited.has(visitKey)) {
      continue;
    }

    visited.add(visitKey);

    for (const fact of getOutgoingFacts(
      facts,
      predicate,
      entity
    )) {
      /*
       * Derselbe Fact darf innerhalb
       * eines Pfades nicht erneut verwendet werden.
       */
      if (
        path.some(
          (pathFact) =>
            getFactKey(pathFact) ===
            getFactKey(fact)
        )
      ) {
        continue;
      }

      queue.push({
        entity:
          normalizeValue(fact.object),
        path: [
          ...path,
          fact,
        ],
      });
    }
  }

  return false;
}

function getTemporalOverlap(
  first: Fact,
  second: Fact
): TemporalRange | null {
  return intersectTemporalRanges(
    first.temporal,
    second.temporal
  );
}

function hasTransitiveCycle(
  facts: Fact[],
  predicate: Predicate,
  start: string,
  referenceFact?: Fact
): boolean {
  const normalizedStart =
    normalizeValue(start);

  type QueueItem = {
    entity: string;
    depth: number;
    from?: string;
    to?: string;
  };

  const queue: QueueItem[] = [
    {
      entity: normalizedStart,
      depth: 0,
      from: referenceFact?.temporal?.from,
      to: referenceFact?.temporal?.to,
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
      from,
      to,
    } = current;

    /*
     * Wir suchen einen Weg zurück zum
     * Ausgangspunkt.
     *
     * Mindestens zwei Kanten sind notwendig.
     */
    if (
      entity === normalizedStart &&
      depth >= 2
    ) {
      return true;
    }

    const visitKey =
      `${entity}|${depth}|${from ?? ""}|${to ?? ""}`;

    if (visited.has(visitKey)) {
      continue;
    }

    visited.add(visitKey);

    for (const fact of getOutgoingFacts(
      facts,
      predicate,
      entity
    )) {
      const temporalIntersection =
        getTemporalIntersection(
          from,
          to,
          fact
        );

      /*
       * Keine gemeinsame Zeit mehr.
       */
      if (temporalIntersection === null) {
        continue;
      }

      queue.push({
        entity: normalizeValue(fact.object),
        depth: depth + 1,
        from: temporalIntersection.from,
        to: temporalIntersection.to,
      });
    }
  }

  return false;
}

function isAgePredicate(
  predicate: Predicate
): boolean {
  return (
    predicate === "younger_than" ||
    predicate === "older_than"
  );
}

function getOppositeAgePredicate(
  predicate: Predicate
): Predicate {
  return predicate === "younger_than"
    ? "older_than"
    : "younger_than";
}

function checkIndirectAgeConflicts(
  extraction: FactExtraction,
  predicate: Predicate
): Inconsistency[] {
  const inconsistencies: Inconsistency[] = [];

  if (!isAgePredicate(predicate)) {
    return inconsistencies;
  }

  const facts = extraction.facts.filter(
    (fact) => fact.predicate === predicate
  );

  const oppositePredicate =
    getOppositeAgePredicate(predicate);

  const oppositeFacts =
    extraction.facts.filter(
      (fact) =>
        fact.predicate === oppositePredicate
    );

  for (const fact of facts) {
    if (
      fact.object === undefined ||
      fact.object === null
    ) {
      continue;
    }

    for (const oppositeFact of oppositeFacts) {
      if (
        oppositeFact.object === undefined ||
        oppositeFact.object === null
      ) {
        continue;
      }

      const sameSubject =
        normalizeValue(fact.subject) ===
        normalizeValue(oppositeFact.subject);

      if (!sameSubject) {
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

  return inconsistencies;
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

      const normalizedSubject =
        normalizeValue(fact.subject);

      const normalizedObject =
        normalizeValue(fact.object);

      if (
        normalizedSubject === normalizedObject
      ) {
        continue;
      }

      if (
        hasTransitiveCycle(
          facts,
          predicate,
          fact.subject,
          fact
        )
      ) {
        inconsistencies.push({
          type: "conflicting_fact",
          subject: fact.subject,
          predicate,
          facts: [fact],
          message:
            `${fact.subject} ist in einem ` +
            `transitiven Zyklus für "${predicate}".`,
        });

        /*
         * Ein Zyklus pro Prädikat reicht.
         */
        break;
      }
    }

    /*
     * younger_than und older_than benötigen
     * zusätzlich die Prüfung indirekter
     * Alterskonflikte.
     */
    inconsistencies.push(
      ...checkIndirectAgeConflicts(
        extraction,
        predicate
      )
    );
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
/*   inconsistencies.push(
    ...checkSymmetricPredicates(extraction)
  ); */

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