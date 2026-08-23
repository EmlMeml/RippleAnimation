import type { Entity, Fact, FactExtraction } from "../types/facts";

const pronouns = new Set([
  "er", "sie", "es", "ihn", "ihm", "ihr", "ihre", "ihren",
  "he", "she", "it", "him", "her",
]);

function normalize(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function isPronoun(value: unknown): boolean {
  return pronouns.has(normalize(value));
}

function getEntityId(value: string, entities: Entity[]): string | undefined {
  const normalizedValue = normalize(value);
  return entities.find(
    (entity) =>
      normalize(entity.id) === normalizedValue ||
      normalize(entity.name) === normalizedValue
  )?.id;
}

function getGenderByEntity(facts: Fact[]): Map<string, string> {
  const genders = new Map<string, string>();

  for (const fact of facts) {
    if (fact.predicate === "gender" && fact.value !== undefined) {
      genders.set(normalize(fact.subject), normalize(fact.value));
    }
  }

  return genders;
}

function pronounMatchesGender(pronoun: string, gender?: string): boolean {
  if (!gender) {
    return true;
  }

  const masculine = ["er", "ihn", "ihm", "he", "him"];
  const feminine = ["sie", "ihr", "ihre", "ihren", "she", "her"];

  if (masculine.includes(pronoun)) {
    return ["male", "männlich", "mann", "masculine"].includes(gender);
  }

  if (feminine.includes(pronoun)) {
    return ["female", "weiblich", "frau", "feminine"].includes(gender);
  }

  return true;
}

function resolvePronoun(
  pronoun: string,
  candidates: string[],
  genders: Map<string, string>
): string | undefined {
  const normalizedPronoun = normalize(pronoun);

  for (const candidate of [...candidates].reverse()) {
    if (
      pronounMatchesGender(
        normalizedPronoun,
        genders.get(normalize(candidate))
      )
    ) {
      return candidate;
    }
  }

  return undefined;
}

/**
 * Ersetzt eindeutige Personenpronomen durch die zuletzt erwähnte passende
 * Entität. So werden "Anna lebt in München. Sie lebt in Berlin." als zwei
 * Fakten über dieselbe Figur an den Consistency Checker weitergegeben.
 */
export function resolvePronouns(
  extraction: FactExtraction
): FactExtraction {
  const genders = getGenderByEntity(extraction.facts);
  const candidates: string[] = [];

  const rememberEntity = (
    value: string | null | undefined,
    allowUnknownSubject = false
  ) => {
    if (!value || isPronoun(value)) {
      return;
    }

    const entity = extraction.entities.find(
      (candidate) =>
        normalize(candidate.id) === normalize(value) ||
        normalize(candidate.name) === normalize(value)
    );

    if (entity && entity.type !== "person") {
      return;
    }

    if (!entity && !allowUnknownSubject) {
      return;
    }

    const entityId = entity?.id ?? value;
    const existingIndex = candidates.findIndex(
      (candidate) => normalize(candidate) === normalize(entityId)
    );

    if (existingIndex >= 0) {
      candidates.splice(existingIndex, 1);
    }

    candidates.push(entityId);
  };

  const facts = extraction.facts.map((fact) => {
    const subject = isPronoun(fact.subject)
      ? resolvePronoun(fact.subject, candidates, genders) ?? fact.subject
      : getEntityId(fact.subject, extraction.entities) ?? fact.subject;

    const object =
      fact.object !== undefined &&
      fact.object !== null &&
      isPronoun(fact.object)
        ? resolvePronoun(fact.object, candidates, genders) ?? fact.object
        : fact.object === undefined || fact.object === null
          ? fact.object
          : getEntityId(fact.object, extraction.entities) ?? fact.object;

    rememberEntity(subject, true);
    rememberEntity(object);

    return {
      ...fact,
      subject,
      object,
    };
  });

  return {
    ...extraction,
    facts,
  };
}
