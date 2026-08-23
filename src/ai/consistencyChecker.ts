import type {
  Fact,
  FactExtraction,
  Predicate,
} from "../types/facts";
import { temporalRangesOverlap } from "./temporalOverlap";


export type InconsistencySeverity =
  | "low"
  | "medium"
  | "high"
  | "critical";

/** Der Bereich der Geschichte, den die Inkonsistenz betrifft. */
export type InconsistencyImpact =
  | "local"
  | "character"
  | "relationship"
  | "world";

export type InconsistencyCategory =
  | "exclusive_fact"
  | "opposing_relation"
  | "inverse_relation"
  | "self_relation"
  | "transitive_cycle"
  | "indirect_age_conflict"
  | "age_value_conflict";

export interface Inconsistency {
  type: "conflicting_fact";
  category: InconsistencyCategory;
  subject: string;
  predicate: string;
  facts: FactExtraction["facts"];
  message: string;
  /** Wie schwer der logische Widerspruch ist. */
  severity?: InconsistencySeverity;
  /** Welcher Erzählbereich von dem Widerspruch betroffen ist. */
  impact?: InconsistencyImpact;
  /** Lesbare Erklärung der möglichen Auswirkung auf die Geschichte. */
  impactDescription?: string;
}

/** Eine vom Consistency-Checker vollständig bewertete Inkonsistenz. */
export interface AssessedInconsistency extends Inconsistency {
  severity: InconsistencySeverity;
  impact: InconsistencyImpact;
  impactDescription: string;
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

/**
 * Ordnet einer Inkonsistenz eine konsistente, erklärbare Bewertung zu.
 * Die Bewertung ist bewusst heuristisch: Sie bewertet die potenzielle
 * Auswirkung auf die Erzählung, nicht die Wichtigkeit einer Figur.
 */
function assessInconsistency(
  inconsistency: Omit<
    Inconsistency,
    "severity" | "impact" | "impactDescription"
  >
): AssessedInconsistency {
  const predicate = inconsistency.predicate as Predicate;

  if (
    predicate === "age" ||
    predicate === "gender" ||
    predicate === "born_in"
  ) {
    return {
      ...inconsistency,
      severity: "critical",
      impact: "character",
      impactDescription:
        "The character's core information is contradictory. This may make their identity and every scene based on it unclear.",
    };
  }

  if (
    predicate === "parent_of" ||
    predicate === "child_of" ||
    predicate === "married_to" ||
    predicate === "younger_than" ||
    predicate === "older_than"
  ) {
    return {
      ...inconsistency,
      severity: "high",
      impact: "relationship",
      impactDescription:
        "A central relationship between characters is contradictory. This may make motivations, conflicts, or family relationships difficult to understand.",
    };
  }

  if (predicate === "located_in") {
    return {
      ...inconsistency,
      severity: "medium",
      impact: "world",
      impactDescription:
        "The story's spatial context is contradictory. Location changes and the logic of the world should be reviewed.",
    };
  }

  if (
    predicate === "lives_in" ||
    predicate === "works_at" ||
    predicate === "occupation"
  ) {
    return {
      ...inconsistency,
      severity: "high",
      impact: "character",
      impactDescription:
        "The character's current circumstances are contradictory. This may affect scenes, actions, and the character's credibility.",
    };
  }

  return {
    ...inconsistency,
    severity: "low",
    impact: "local",
    impactDescription:
      "The inconsistency concerns a local detail. It is relevant to continuity but is unlikely to affect the plot directly.",
  };
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
            category: "exclusive_fact",
            subject,
            predicate,
            facts: [
              factA,
              factB,
            ],
            message:
              `${subject} has conflicting information for ` +
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
        category: "opposing_relation",
        subject: factA.subject,
        predicate: predicateA,
        facts: [
          factA,
          matchingFact,
        ],
        message:
          `${factA.subject} has conflicting relationships: ` +
          `"${predicateA}" and "${predicateB}".`,
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
        category: "inverse_relation",
        subject: factA.subject,
        predicate: factA.predicate,
        facts: [
          factA,
          matchingFact,
        ],
        message:
          `${factA.subject} cannot simultaneously be ` +
          `"${predicateA}" and "${predicateB}" ` +
          `in relation to ${factA.object}.`,
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
      category: "self_relation",
      subject: fact.subject,
      predicate: fact.predicate,
      facts: [fact],
      message:
        `${fact.subject} cannot have a ` +
        `"${fact.predicate}" relationship with itself.`,
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
        category: "indirect_age_conflict",
        subject: fact.subject,
        predicate,
        facts: [
          fact,
          oppositeFact,
        ],
        message:
          `${fact.subject} has conflicting age relationships: ` +
          `"${predicate}" and "${oppositePredicate}".`,
      });
    }
  }

  return inconsistencies;
}

function checkAgeAgainstAgeRelations(
  extraction: FactExtraction
): Inconsistency[] {
  const inconsistencies: Inconsistency[] = [];

  const ageFacts = extraction.facts.filter(
    (fact) =>
      fact.predicate === "age" &&
      fact.value !== undefined &&
      typeof fact.value === "number"
  );

  const relationFacts = extraction.facts.filter(
    (fact) =>
      fact.predicate === "younger_than" ||
      fact.predicate === "older_than"
  );

  for (const relation of relationFacts) {
    if (
      relation.object === undefined ||
      relation.object === null
    ) {
      continue;
    }

    const subjectAge = ageFacts.find(
      (fact) =>
        normalizeValue(fact.subject) ===
          normalizeValue(relation.subject) &&
        temporalRangesOverlap(fact, relation)
    );

    const objectAge = ageFacts.find(
      (fact) =>
        normalizeValue(fact.subject) ===
          normalizeValue(relation.object) &&
        temporalRangesOverlap(fact, relation)
    );

    if (!subjectAge || !objectAge) {
      continue;
    }

    const subjectValue =
      Number(subjectAge.value);

    const objectValue =
      Number(objectAge.value);

    let contradiction = false;

    if (
      relation.predicate === "younger_than" &&
      subjectValue >= objectValue
    ) {
      contradiction = true;
    }

    if (
      relation.predicate === "older_than" &&
      subjectValue <= objectValue
    ) {
      contradiction = true;
    }

    if (!contradiction) {
      continue;
    }

    inconsistencies.push({
      type: "conflicting_fact",
      category: "age_value_conflict",
      subject: relation.subject,
      predicate: relation.predicate,
      facts: [
        subjectAge,
        objectAge,
        relation,
      ],
      message:
        `According to the stated ages, ${relation.subject} is not ` +
        `"${relation.predicate}" ${relation.object}.`,
    });
  }

  return inconsistencies;
}

function ageFactCanInformRelation(
  ageFact: Fact,
  relationFact: Fact
): boolean {
  const ageFrom = ageFact.temporal?.from;
  const relationTo = relationFact.temporal?.to;

  /*
   * Ohne zeitliche Information gehen wir davon aus,
   * dass der Age-Fact verwendet werden darf.
   */
  if (!ageFrom || !relationTo) {
    return true;
  }

  /*
   * Eine Altersangabe aus der Zukunft darf
   * keine frühere Altersrelation erklären/widerlegen.
   */
  return ageFrom <= relationTo;
}

function checkAgeRelationsAgainstAgeFacts(
  extraction: FactExtraction
): Inconsistency[] {
  const inconsistencies: Inconsistency[] = [];

  const ageFacts = extraction.facts.filter(
    (fact) =>
      fact.predicate === "age" &&
      typeof fact.value === "number"
  );

  const relationFacts = extraction.facts.filter(
    (fact) =>
      isAgePredicate(fact.predicate) &&
      fact.object !== undefined &&
      fact.object !== null
  );

  for (const relationFact of relationFacts) {
    const subject = normalizeValue(
      relationFact.subject
    );

    const object = normalizeValue(
      relationFact.object
    );

    const subjectAgeFacts = ageFacts.filter(
      (fact) =>
        normalizeValue(fact.subject) === subject
    );

    const objectAgeFacts = ageFacts.filter(
      (fact) =>
        normalizeValue(fact.subject) === object
    );

    for (const subjectAgeFact of subjectAgeFacts) {
      for (const objectAgeFact of objectAgeFacts) {

        /*
         * WICHTIG:
         *
         * Die beiden Altersangaben müssen aus
         * demselben zeitlichen Snapshot stammen.
         *
         * Dadurch verhindern wir z.B.:
         *
         * Anna:   27 Jahre in 2026
         * Thomas: 30 Jahre in 2028
         *
         * miteinander zu vergleichen.
         */
        if (
          !temporalRangesOverlap(
            subjectAgeFact,
            objectAgeFact
          )
        ) {
          continue;
        }

        /*
         * Ein Alters-Fact darf vor der Relation liegen.
         *
         * Beispiel:
         *
         * Anna:   27 in 2026
         * Thomas: 30 in 2026
         * Relation: Thomas younger_than Anna in 2028
         *
         * Die Altersangaben von 2026 dürfen die Relation
         * von 2028 trotzdem widerlegen.
         */
        if (
          !ageFactCanInformRelation(
            subjectAgeFact,
            relationFact
          )
        ) {
          continue;
        }

        if (
          !ageFactCanInformRelation(
            objectAgeFact,
            relationFact
          )
        ) {
          continue;
        }

        const subjectAge =
          Number(subjectAgeFact.value);

        const objectAge =
          Number(objectAgeFact.value);

        const relationIsWrong =
          relationFact.predicate ===
            "younger_than"
            ? subjectAge >= objectAge
            : subjectAge <= objectAge;

        if (!relationIsWrong) {
          continue;
        }

        inconsistencies.push({
          type: "conflicting_fact",
          category: "age_value_conflict",
          subject: relationFact.subject,
          predicate: relationFact.predicate,
          facts: [
            subjectAgeFact,
            objectAgeFact,
            relationFact,
          ],
          message:
            `${relationFact.subject} cannot be ` +
            `"${relationFact.predicate}" ${relationFact.object}, ` +
            `because their ages are ${subjectAge} and ${objectAge}.`,
        });
      }
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
          category: "transitive_cycle",
          subject: fact.subject,
          predicate,
          facts: [fact],
          message:
            `${fact.subject} is part of a ` +
            `transitive cycle for "${predicate}".`,
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
): AssessedInconsistency[] {
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

  inconsistencies.push(
    ...checkAgeAgainstAgeRelations(extraction)
  );

  inconsistencies.push(
    ...checkAgeRelationsAgainstAgeFacts(extraction)
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

  return Array.from(unique.values()).map(
    assessInconsistency
  );
}
