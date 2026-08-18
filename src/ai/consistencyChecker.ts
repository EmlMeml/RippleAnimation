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

/**
 * Liefert den effektiven Zeitraum eines Facts.
 *
 * Der ConsistencyChecker interessiert sich ausschließlich
 * für den normalisierten Zeitraum.
 *
 * source / anchor / advancesTimeline sind für die
 * Konfliktprüfung nicht relevant.
 */
/* function getTemporalRange(
  fact: Fact
): TemporalRange {
  return {
    from: fact.temporal?.from,
    to: fact.temporal?.to,
  };
} */

/**
 * Zwei Facts können nur dann gleichzeitig gültig sein,
 * wenn sich ihre normalisierten Zeiträume überschneiden.
 */
/* function factsOverlapTemporally(
  first: Fact,
  second: Fact
): boolean {
  return temporalRangesOverlap(
    first,
    second
  );
} */

type FactPathQueueItem = {
  entity: string;
  path: Fact[];
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

function getInconsistencyKey(
  inconsistency: Inconsistency
): string {
  const factKeys = inconsistency.facts
    .map(getFactKey)
    .sort();

  return [
    inconsistency.type,
    normalizeValue(inconsistency.subject),
    normalizeValue(inconsistency.predicate),
    ...factKeys,
  ].join("|");
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
  const normalizedFrom =
    normalizeValue(from);

  const normalizedTo =
    normalizeValue(to);

  if (normalizedFrom === normalizedTo) {
    return true;
  }

  const paths =
    findLocatedInPathsFrom(
      facts,
      normalizedFrom
    );

  const matchingPaths =
    paths.filter((path) => {
      if (path.length === 0) {
        return false;
      }

      const lastFact =
        path[path.length - 1];

      return (
        normalizeValue(lastFact.object) ===
        normalizedTo
      );
    });

  return matchingPaths.some((path) =>
    isPathTemporallyCompatible(
      path,
      referenceFacts
    )
  );
}


function findLocatedInPathsFrom(
  facts: Fact[],
  start: string
): Fact[][] {

  const queue: FactPathQueueItem[] = [
    {
      entity: normalizeValue(start),
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
      if (pathContainsFact(path, fact)) {
        continue;
      }

      const nextPath = [
        ...path,
        fact,
      ];

      paths.push(nextPath);

      queue.push({
        entity: normalizeValue(fact.object),
        path: nextPath,
      });
    }
  }

  return paths;
}

function hasCommonLocatedInAncestor(
  facts: Fact[],
  first: string,
  second: string,
  referenceFacts: Fact[]
): boolean {
  const firstPaths = findLocatedInPathsFrom(
    facts,
    first
  );

  const secondPaths = findLocatedInPathsFrom(
    facts,
    second
  );

  const normalizedFirst =
    normalizeValue(first);

  const normalizedSecond =
    normalizeValue(second);

  for (const firstPath of firstPaths) {
    if (firstPath.length === 0) {
      continue;
    }

    const firstAncestor =
      normalizeValue(
        firstPath[firstPath.length - 1].object
      );

    if (
      firstAncestor === normalizedFirst ||
      firstAncestor === normalizedSecond
    ) {
      continue;
    }

    if (
      !isPathTemporallyCompatible(
        firstPath,
        referenceFacts
      )
    ) {
      continue;
    }

    for (const secondPath of secondPaths) {
      if (secondPath.length === 0) {
        continue;
      }

      const secondAncestor =
        normalizeValue(
          secondPath[
            secondPath.length - 1
          ].object
        );

      if (
        secondAncestor !== firstAncestor
      ) {
        continue;
      }

      if (
        secondAncestor === normalizedFirst ||
        secondAncestor === normalizedSecond
      ) {
        continue;
      }

      if (
        !isPathTemporallyCompatible(
          secondPath,
          referenceFacts
        )
      ) {
        continue;
      }

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
    hasCommonLocatedInAncestor(
    facts,
    valueA,
    valueB,
    [factA, factB]
    )
  ) {
    return true;
  }

  return false;
}

/* function isImplicitTemporalFact(fact: Fact): boolean {
  return fact.temporal?.source === "implicit";
}

function isExplicitAnchorTemporalFact(fact: Fact): boolean {
  return (
    fact.temporal?.source === "anchor" &&
    fact.temporal?.text !== undefined
  );
} */

function checkExclusiveFacts(
  extraction: FactExtraction
): Inconsistency[] {
  const inconsistencies: Inconsistency[] = [];

  for (const predicate of exclusivePredicates) {
    const facts = extraction.facts.filter(
      (fact) =>
        fact.predicate === predicate
    );

    /*
     * Identische Facts entfernen.
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
     * Nach Subjekt gruppieren.
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
     * Facts desselben Subjekts miteinander vergleichen.
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
          const factA =
            subjectFacts[i];

          const factB =
            subjectFacts[j];

          /*
           * Gleicher Wert ist niemals ein Konflikt.
           */
          if (
            getFactValue(factA) ===
            getFactValue(factB)
          ) {
            continue;
          }

          /*
           * located_in besitzt zusätzlich
           * hierarchische Kompatibilitätsregeln.
           */
          if (
            predicate === "located_in"
          ) {
            const locatedFacts =
              extraction.facts.filter(
                (fact) =>
                  fact.predicate ===
                  "located_in"
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
          * Ein impliziter Fact beschreibt den aktuellen
          * Story-Zeitpunkt ohne explizite temporale Aussage.
          *
          * Ein expliziter Anchor-Ausdruck wie "Today"
          * bezieht sich dagegen auf den festen Story-Anker.
          *
          * Diese beiden Informationen sollen nicht allein
          * aufgrund desselben Datums als Widerspruch gelten.
          */
          /* if (
            (
              isImplicitTemporalFact(factA) &&
              isExplicitAnchorTemporalFact(factB)
            ) ||
            (
              isImplicitTemporalFact(factB) &&
              isExplicitAnchorTemporalFact(factA)
            )
          ) {
            continue;
          } */

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

function areSameRelationTemporallyCompatible(
  first: Fact,
  second: Fact
): boolean {
  if (
    first.object === undefined ||
    first.object === null ||
    second.object === undefined ||
    second.object === null
  ) {
    return false;
  }

  return (
    normalizeValue(first.subject) ===
      normalizeValue(second.subject) &&
    normalizeValue(first.object) ===
      normalizeValue(second.object) &&
    temporalRangesOverlap(first, second)
  );
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

      const matchingFact = factsB.find((factB) =>
        areSameRelationTemporallyCompatible(
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

function pathContainsFact(
  path: Fact[],
  fact: Fact
): boolean {
  const factKey = getFactKey(fact);

  return path.some(
    (pathFact) =>
      getFactKey(pathFact) === factKey
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

  const queue: FactPathQueueItem[] = [
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
      if (pathContainsFact(path, fact)) {
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
  temporal?: TemporalRange;
};
 const queue: QueueItem[] = [
  {
    entity: normalizedStart,
    depth: 0,
    temporal: referenceFact?.temporal,
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
      temporal,
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
    `${entity}|${depth}|` +
    `${temporal?.from ?? ""}|${temporal?.to ?? ""}`;

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
      intersectTemporalRanges(
        temporal,
        fact.temporal
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
        temporal: temporalIntersection,
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

  inconsistencies.push(
    ...checkExclusiveFacts(extraction)
  );

  inconsistencies.push(
    ...checkOpposingPredicates(extraction)
  );

  inconsistencies.push(
    ...checkContradictoryInverseDirections(extraction)
  );

  inconsistencies.push(
    ...checkSelfRelations(extraction)
  );

  inconsistencies.push(
    ...checkTransitivePredicates(extraction)
  );

  const unique = new Map<
    string,
    Inconsistency
  >();

  for (const inconsistency of inconsistencies) {
    const key =
      getInconsistencyKey(inconsistency);

    if (!unique.has(key)) {
      unique.set(key, inconsistency);
    }
  }

  return Array.from(unique.values());
}