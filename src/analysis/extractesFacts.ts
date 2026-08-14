import type { FactExtraction } from "../types/facts";
import type { StoryContext } from "../types/story";
import { askAI } from "./../ai/api";

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

TEXT:

${text}
`;

  return await askAI(prompt);
}