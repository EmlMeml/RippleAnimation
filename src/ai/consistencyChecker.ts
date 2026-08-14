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
 * Beispiel:
 *
 * Anna -> lives_in -> Munich
 * Anna -> lives_in -> Berlin
 *
 * => Konflikt
 */
const exclusivePredicates: Predicate[] = [
  "age",
  "gender",
  "born_in",
  "lives_in",
  "works_at",
  "occupation",
];

/*
 * Diese Prädikate stehen logisch im direkten Gegensatz zueinander.
 *
 * Beispiel:
 *
 * Anna -> younger_than -> Thomas
 * Anna -> older_than -> Thomas
 *
 * => Konflikt
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
 * Beispiel:
 *
 * Anna -> parent_of -> Thomas
 * Thomas -> child_of -> Anna
 *
 * => konsistent
 *
 * Dagegen:
 *
 * Anna -> parent_of -> Thomas
 * Anna -> child_of -> Thomas
 *
 * => Konflikt
 */
const inversePredicates: Partial<
  Record<Predicate, Predicate>
> = {
  parent_of: "child_of",
  child_of: "parent_of",
};

/*
 * Symmetrische Beziehungen müssen nicht doppelt
 * angegeben werden, sind aber auch nicht widersprüchlich.
 *
 * Beispiel:
 *
 * Anna -> sibling_of -> Thomas
 * Thomas -> sibling_of -> Anna
 *
 * => konsistent
 *
 * Dasselbe gilt für friend_of.
 */
const symmetricPredicates: Predicate[] = [
  "sibling_of",
  "friend_of",
];

/*
 * Normalisiert Werte für Vergleiche.
 *
 * Dadurch gelten beispielsweise:
 *
 * "Munich"
 * "munich"
 * " Munich "
 *
 * als derselbe Wert.
 */
function normalizeValue(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

/*
 * Liefert den Vergleichswert eines Facts.
 *
 * Attribute:
 *   Anna -> age -> 27
 *
 * Beziehungen:
 *   Anna -> lives_in -> Munich
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
 * Dadurch werden beispielsweise:
 *
 * Anna -> sibling_of -> Thomas
 *
 * und
 *
 * Thomas -> sibling_of -> Anna
 *
 * als dieselbe Beziehung betrachtet.
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
 * Beispiel:
 *
 * Anna -> parent_of -> Thomas
 *
 * und
 *
 * Thomas -> child_of -> Anna
 *
 * bekommen denselben kanonischen Schlüssel.
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
   * Beispiel:
   *
   * Anna -> parent_of -> Thomas
   * Anna -> child_of -> Thomas
   *
   * Das ist widersprüchlich.
   */
  for (const [
    predicateA,
    predicateB,
  ] of Object.entries(inversePredicates) as Array<
    [Predicate, Predicate]
  >) {
    /*
     * Damit wir nicht denselben Paarvergleich zweimal
     * durchführen:
     *
     * parent_of -> child_of
     *
     * aber nicht anschließend noch einmal:
     *
     * child_of -> parent_of
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

  return inconsistencies;
}