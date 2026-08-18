import type { Fact, FactExtraction } from "../types/facts";
import type { StoryContext } from "../types/story";
import { askAI } from "./../ai/api";
import { normalizeTemporal } from "./temporalNormalizer";

function getFactKey(fact: Fact): string {
  return [
    fact.subject.trim().toLowerCase(),
    fact.predicate,
    fact.value !== undefined
      ? String(fact.value).trim().toLowerCase()
      : "",
    fact.object !== undefined && fact.object !== null
      ? String(fact.object).trim().toLowerCase()
      : "",
    fact.temporal?.text?.trim().toLowerCase() ?? "",
    fact.temporal?.from ?? "",
    fact.temporal?.to ?? "",
  ].join("|");
}

function deduplicateFacts(
  facts: Fact[]
): Fact[] {
  const unique = new Map<string, Fact>();

  for (const fact of facts) {
    const key = getFactKey(fact);

    if (!unique.has(key)) {
      unique.set(key, fact);
    }
  }

  return Array.from(unique.values());
}

export async function extractFacts(
  text: string,
  context: StoryContext
): Promise<FactExtraction> {
  const prompt = `
You extract explicit facts from the text.

Return ONLY valid JSON.

The output MUST have exactly this structure:

{
  "entities": [],
  "facts": []
}

ENTITIES

Extract all relevant people, places, organizations, objects,
and events explicitly mentioned in the text.

Each entity must have:

{
  "id": "stable_id",
  "name": "original name",
  "type": "person"
}

Allowed entity types:

- person
- place
- organization
- object
- event

Use stable IDs.
Use lowercase IDs when possible.

FACTS

Each fact must have:

{
  "subject": "entity_id",
  "predicate": "predicate_name"
}

Facts may additionally have either:

"value"

OR

"object"

Do not use both unless absolutely necessary.

Allowed predicates:

- age
- gender
- born_in
- lives_in
- works_at
- occupation
- sibling_of
- parent_of
- child_of
- married_to
- friend_of
- owns
- has
- located_in
- participates_in
- younger_than
- older_than

PREDICATE SELECTION

Use predicates according to the exact meaning of the text.

LIVING LOCATION:

If the text says that a person lives in a place, always use:

"lives_in"

Examples:

"Anna lebt in München."
→
{
  "subject": "anna",
  "predicate": "lives_in",
  "object": "munich"
}

"Anna wohnt in Berlin."
→
{
  "subject": "anna",
  "predicate": "lives_in",
  "object": "berlin"
}

Do NOT use "located_in" for a person's residence.

Use "located_in" only when the text explicitly describes the
physical/location relationship of an entity, for example:

"Das Krankenhaus befindet sich in München."
→
{
  "subject": "hospital",
  "predicate": "located_in",
  "object": "munich"
}

PREDICATE RULE FOR RESIDENCE

If a person lives, resides, or lives at a place,
always use "lives_in".

Examples:

"Anna lebt in München."
→ lives_in

"Anna wohnt in Berlin."
→ lives_in

"Anna resides in Hamburg."
→ lives_in

Never use "located_in" for a person's residence.

"located_in" should only be used for explicit location
relationships of entities such as buildings, objects,
organizations, or places.

TEMPORAL FACTS

If a temporal expression modifies a fact, attach it to that fact.

Example:

"Anna lebt in München. Two years later lebt Anna in Berlin."

Return:

{
  "subject": "anna",
  "predicate": "lives_in",
  "object": "munich"
}

{
  "subject": "anna",
  "predicate": "lives_in",
  "object": "berlin",
  "temporal": {
    "text": "Two years later"
  }
}

TEMPORAL EXPRESSIONS

If a fact is explicitly introduced by a temporal expression,
attach that temporal expression to the fact.

Example:

"Anna lebt in München. Two years later lebt Anna in Berlin."

Return:

{
  "subject": "anna",
  "predicate": "lives_in",
  "object": "munich"
}

and:

{
  "subject": "anna",
  "predicate": "lives_in",
  "object": "berlin",
  "temporal": {
    "text": "Two years later"
  }
}

Do not replace "lives_in" with "located_in".
Do not omit the temporal expression.

AGE

If the text says:

"Anna is 27 years old."

return:

{
  "subject": "anna",
  "predicate": "age",
  "value": 27
}

The value MUST be a number.

Do not add "years".
Do not add "years old".
Do not use the object field.

RELATIONSHIPS

If the text says:

"Thomas is Anna's brother."

return:

{
  "subject": "thomas",
  "predicate": "sibling_of",
  "object": "anna"
}

RELATIVE AGE

If the text says:

"Thomas is Anna's younger brother."

return TWO facts:

{
  "subject": "thomas",
  "predicate": "sibling_of",
  "object": "anna"
}

and:

{
  "subject": "thomas",
  "predicate": "younger_than",
  "object": "anna"
}

If the text says someone is older than another person,
use "older_than".

TEMPORAL CONTEXT

Facts may optionally include temporal information.

Use:

{
  "text": "original temporal expression"
}

to preserve explicit temporal expressions from the text.

Examples:

"Anna lebt heute in München."

{
  "subject": "anna",
  "predicate": "lives_in",
  "object": "munich",
  "temporal": {
    "text": "heute"
  }
}

"Anna lebte früher in Berlin."

{
  "subject": "anna",
  "predicate": "lives_in",
  "object": "berlin",
  "temporal": {
    "text": "früher"
  }
}

"Anna wird morgen nach Berlin fahren."

{
  "subject": "anna",
  "predicate": "located_in",
  "object": "berlin",
  "temporal": {
    "text": "morgen"
  }
}

"Anna lebt seit 2020 in München."

{
  "subject": "anna",
  "predicate": "lives_in",
  "object": "munich",
  "temporal": {
    "text": "seit 2020"
  }
}

STORY TIME CONTEXT

The reference date for this story is:

${context.referenceDate}

Interpret relative temporal expressions relative to this date.

For example:

"heute" refers to the reference date.
"morgen" refers to the day after the reference date.
"gestern" refers to the day before the reference date.

IMPORTANT:

Do not use the real current date.

Use ONLY the provided story reference date.

Do not calculate or output normalized dates.

Preserve the original temporal expression exactly as written
in the text.

Only add temporal information when the text explicitly contains
a temporal expression.

Do not invent dates or time periods.

Do not try to determine whether two temporal expressions overlap.

The consistency checker will handle temporal consistency later.

IMPORTANT

Never use:

"<="
">="
"<"
">"

as values.

Never invent information.

Never infer facts that are not explicitly stated.

Do not determine contradictions.

Do not explain your reasoning.

Do not summarize.

Do not return Markdown.

Return ONLY JSON.

COMPLETENESS

Extract EVERY explicitly stated fact from the text.

Do not omit facts.

Do not merge facts.

Do not overwrite facts.

Do not deduplicate facts merely because they have the same
subject and predicate.

Multiple facts with the same subject and predicate are allowed
and MUST be preserved.

For example:

"Anna lebt in München. Später lebt Anna in Berlin."

MUST produce TWO separate facts:

{
  "subject": "anna",
  "predicate": "lives_in",
  "object": "munich"
}

and:

{
  "subject": "anna",
  "predicate": "lives_in",
  "object": "berlin"
}

If one sentence explicitly expresses multiple facts,
create one fact for EACH explicitly stated fact.

For example:

"Thomas ist Annas Bruder und jünger als Anna."

MUST produce TWO separate facts:

{
  "subject": "thomas",
  "predicate": "sibling_of",
  "object": "anna"
}

and:

{
  "subject": "thomas",
  "predicate": "younger_than",
  "object": "anna"
}

Never remove a fact because another fact about the same
subject already exists.

RELATIVE TIME EXPRESSIONS

Extract relative temporal expressions exactly as written.

Examples:

"Two years later Anna moved to Berlin."

The fact must contain:

"temporal": {
  "text": "Two years later"
}

Other examples include:

"one year later"
"two years later"
"three months later"
"two weeks later"
"five days later"

Preserve the original temporal expression exactly as written.
Do not calculate the date yourself.

TEXT:

${text}
`;

  const extraction = await askAI(prompt);

  const orderedFacts = [...extraction.facts].sort(
    (a, b) =>
      (a.source?.start ?? Number.MAX_SAFE_INTEGER) -
      (b.source?.start ?? Number.MAX_SAFE_INTEGER)
  );
  let currentDate = context.referenceDate;

  const normalizedFacts: Fact[] = [];

  let activeTemporalText: string | undefined;
  let activeTemporalDate: string | undefined;

  for (let i = 0; i < orderedFacts.length; i++) {
    const fact = orderedFacts[i];

    const temporalText =
      fact.temporal?.text?.trim().toLowerCase();

    const previousFact =
      i > 0
        ? orderedFacts[i - 1]
        : undefined;

    const previousTemporalText =
      previousFact?.temporal?.text
        ?.trim()
        .toLowerCase();

    /*
    * Derselbe temporale Ausdruck direkt hintereinander
    * bedeutet zunächst dieselbe temporale Gruppe.
    */
    const isSameTemporalGroup =
      temporalText !== undefined &&
      temporalText === previousTemporalText &&
      temporalText === activeTemporalText &&
      activeTemporalDate !== undefined;

    let temporal;

    if (isSameTemporalGroup) {
      temporal = {
        ...fact.temporal,
        from: activeTemporalDate,
        to: activeTemporalDate,
        source: "relative" as const,
        anchor: currentDate,
        advancesTimeline: false,
      };
    } else {
      temporal = normalizeTemporal(
        fact.temporal,
        context,
        currentDate
      );
    }

    normalizedFacts.push({
      ...fact,
      temporal,
    });

    if (
      !isSameTemporalGroup &&
      temporal?.advancesTimeline &&
      temporal.from
    ) {
      currentDate = temporal.from;

      activeTemporalText = temporalText;
      activeTemporalDate = temporal.from;
    } else if (!isSameTemporalGroup) {
      activeTemporalText = temporalText;
      activeTemporalDate = temporal?.from;
    }
  }
  const deduplicatedFacts = deduplicateFacts(normalizedFacts);

  return {
  ...extraction,
  facts: deduplicatedFacts,
};
}