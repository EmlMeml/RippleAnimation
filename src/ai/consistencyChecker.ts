import type { FactExtraction } from "../types/facts";

export interface Inconsistency {
  type: "conflicting_fact";
  subject: string;
  predicate: string;
  facts: FactExtraction["facts"];
  message: string;
}

const exclusivePredicates = [
  "age",
  "gender",
  "born_in",
  "lives_in",
  "works_at",
  "occupation",
];

export function checkConsistency(
  extraction: FactExtraction
): Inconsistency[] {
  const inconsistencies: Inconsistency[] = [];

  for (const predicate of exclusivePredicates) {
    const facts = extraction.facts.filter(
      (fact) => fact.predicate === predicate
    );

    const grouped = new Map<string, typeof facts>();

    for (const fact of facts) {
      const existing = grouped.get(fact.subject) ?? [];

      existing.push(fact);

      grouped.set(fact.subject, existing);
    }

    for (const [subject, subjectFacts] of grouped) {
      const uniqueValues = new Set(
        subjectFacts.map((fact) =>
          fact.object !== undefined
            ? `object:${fact.object}`
            : `value:${String(fact.value)}`
        )
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