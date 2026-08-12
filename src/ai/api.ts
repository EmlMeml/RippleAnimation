import type { FactExtraction } from "../types/facts";

const AI_ENDPOINT =
  "https://small-hill-7bd7.ripple-ai.workers.dev/api/chat";

interface AIResponse {
  response: FactExtraction;
}

export async function askAI(
  prompt: string
): Promise<FactExtraction> {
  const response = await fetch(AI_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();

    throw new Error(
      `AI request failed: ${response.status} ${errorText}`
    );
  }

  const data = await response.json() as AIResponse;

  return data.response;
}

export async function extractFacts(
  text: string
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