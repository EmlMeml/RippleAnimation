import type { Fact, FactExtraction } from "../types/facts";
import type { StoryContext } from "../types/story";
import { askAI } from "./../ai/api";
import { normalizeTemporal } from "./temporalNormalizer";
import { resolvePronouns } from "./pronounResolver";

const MAX_CHUNK_WORDS = 1500;
const MAX_CHUNK_RETRIES = 2;

function getWordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Teilt lange Texte bevorzugt an Absatz- und Satzgrenzen. */
export function splitTextIntoChunks(
  text: string,
  maxWords = MAX_CHUNK_WORDS
): string[] {
  const chunks: string[] = [];
  let currentChunk = "";
  let currentWordCount = 0;

  const addUnit = (unit: string) => {
    const trimmedUnit = unit.trim();
    const wordCount = getWordCount(trimmedUnit);

    if (!trimmedUnit) return;

    /* Auch ein außergewöhnlich langer Satz darf das Chunk-Limit nicht sprengen. */
    if (wordCount > maxWords) {
      const words = trimmedUnit.split(/\s+/);

      for (let start = 0; start < words.length; start += maxWords) {
        addUnit(words.slice(start, start + maxWords).join(" "));
      }

      return;
    }

    if (currentWordCount > 0 && currentWordCount + wordCount > maxWords) {
      chunks.push(currentChunk);
      currentChunk = "";
      currentWordCount = 0;
    }

    currentChunk = currentChunk
      ? `${currentChunk}\n\n${trimmedUnit}`
      : trimmedUnit;
    currentWordCount += wordCount;
  };

  for (const paragraph of text.split(/\r?\n\s*\r?\n/)) {
    if (getWordCount(paragraph) <= maxWords) {
      addUnit(paragraph);
      continue;
    }

    for (const sentence of paragraph.split(/(?<=[.!?])\s+/)) {
      addUnit(sentence);
    }
  }

  if (currentChunk) chunks.push(currentChunk);
  return chunks;
}

/**
 * Behält die Slate-Absatzindizes auch dann bei, wenn ein langer Absatz über
 * mehrere KI-Chunks verteilt werden muss.
 */
function createSourceAwareChunks(text: string): string[] {
  const chunks: string[] = [];
  let currentChunk = "";
  let currentWordCount = 0;
  const maxContentWords = Math.max(1, MAX_CHUNK_WORDS - 2);

  const addUnit = (paragraphIndex: number, unit: string) => {
    const trimmedUnit = unit.trim();

    if (!trimmedUnit) return;

    if (getWordCount(trimmedUnit) > maxContentWords) {
      const words = trimmedUnit.split(/\s+/);

      for (
        let start = 0;
        start < words.length;
        start += maxContentWords
      ) {
        addUnit(
          paragraphIndex,
          words.slice(start, start + maxContentWords).join(" ")
        );
      }

      return;
    }

    const labeledUnit = `[Paragraph ${paragraphIndex}]\n${trimmedUnit}`;
    const wordCount = getWordCount(labeledUnit);

    if (currentWordCount > 0 && currentWordCount + wordCount > MAX_CHUNK_WORDS) {
      chunks.push(currentChunk);
      currentChunk = "";
      currentWordCount = 0;
    }

    currentChunk = currentChunk
      ? `${currentChunk}\n\n${labeledUnit}`
      : labeledUnit;
    currentWordCount += wordCount;
  };

  for (const [index, paragraph] of text.split(/\r?\n/).entries()) {
    if (getWordCount(paragraph) <= maxContentWords) {
      addUnit(index, paragraph);
      continue;
    }

    for (const sentence of paragraph.split(/(?<=[.!?])\s+/)) {
      addUnit(index, sentence);
    }
  }

  if (currentChunk) chunks.push(currentChunk);
  return chunks;
}

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

function mergeExtractions(
  extractions: FactExtraction[]
): FactExtraction {
  const entities = new Map<string, FactExtraction["entities"][number]>();

  for (const extraction of extractions) {
    for (const entity of extraction.entities) {
      const key = entity.id.trim().toLowerCase();
      if (!entities.has(key)) entities.set(key, entity);
    }
  }

  return {
    entities: Array.from(entities.values()),
    facts: extractions.flatMap((extraction) => extraction.facts),
  };
}

async function extractChunkWithRetry(
  chunk: string,
  context: StoryContext,
  chunkIndex: number,
  chunkCount: number
): Promise<FactExtraction> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_CHUNK_RETRIES; attempt++) {
    try {
      console.log(
        `Fact extraction: chunk ${chunkIndex + 1}/${chunkCount} ` +
        `(attempt ${attempt + 1}/${MAX_CHUNK_RETRIES + 1})`
      );

      return await askAI(createExtractionPrompt(chunk, context));
    } catch (error) {
      lastError = error;
      console.warn(
        `Fact extraction failed for chunk ${chunkIndex + 1}, ` +
        `attempt ${attempt + 1}:`,
        error
      );
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`Fact extraction failed for chunk ${chunkIndex + 1}.`);
}

function createExtractionPrompt(
  text: string,
  context: StoryContext
): string {
  return `
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
  "predicate": "predicate_name",
  "source": {
    "paragraphIndex": 0
  }
}
Facts may additionally have either:
"value"
OR
"object"
Do not use both unless absolutely necessary.

SOURCE REFERENCE
The input labels every source paragraph as [Paragraph n]. Every fact MUST
include source.paragraphIndex with the number of the paragraph that explicitly
states that fact. Use exactly the number from the label. Do not invent source
positions and do not use character offsets.
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

PRONOUN RESOLUTION
Resolve unambiguous personal pronouns to the stable entity ID of the person
they refer to. Never use a pronoun such as "sie", "er", "she", or "he" as
the subject or object of a fact.
Example:
"Anna lebt in München. Sie lebt in Berlin."
must use "anna" as the subject for both facts.
If the reference is ambiguous, do not invent a fact from the pronoun.

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

CONTAINMENT VS. LANDMARKS AND PROXIMITY
"located_in" means geographic containment: the subject is inside the object
(for example, a town in a country or a building in a city). Do NOT use
"located_in" for a nearby landmark, geographic feature, direction, or relative
position. Expressions such as "at the foot of", "near", "beside", "next to",
"overlooking", "north of", "am Fuße von", "nahe", "neben", and "nördlich von"
do not state containment and must not create a located_in fact.

You may still extract the mentioned landmark as a place entity, but do not
connect it with located_in unless the text separately and explicitly states a
containment relationship.

Example:
"Ort A liegt in Land B am Fuße des Berges C."
Return the place entities Ort A, Land B, and Berg C, but return only this
location fact:
{
  "subject": "ort_a",
  "predicate": "located_in",
  "object": "land_b"
}
Do NOT return ort_a located_in berg_c. "Am Fuße des Berges C" is a landmark
description, not a second container.

Example:
"Village A is in Country B near Mountain C."
Return village_a located_in country_b. Mountain C may be a place entity, but
do NOT return village_a located_in mountain_c.

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
"today" refers to the reference date.
"tomorrow" refers to the day after the reference date.
"yesterday" refers to the day before the reference date.

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

CHUNK EXTRACTION AND OUTPUT LIMITS
This text is one chunk of a larger story. Extract only facts explicitly
stated in this chunk, while keeping stable entity IDs for recurring entities.
Extract each fact at most once. Never output duplicate or near-duplicate
facts. Do not repeatedly encode a character's location during different
moments of one continuous scene; prefer one continuity-relevant scene-level
fact. Do not infer biological or legal relationships unless the text states
them explicitly. Do not create entities for ordinary attributes such as scars,
bruises, hair color, or clothing.

Return at most 50 entities and at most 100 facts. If more facts are possible,
prioritize facts that matter for future story continuity.

TEXT:

${text}
`;

}

export async function extractFacts(
  text: string,
  context: StoryContext
): Promise<FactExtraction> {
  const chunks = createSourceAwareChunks(text);
  const chunkExtractions: FactExtraction[] = [];

  for (const [index, chunk] of chunks.entries()) {
    chunkExtractions.push(await extractChunkWithRetry(
      chunk,
      context,
      index,
      chunks.length
    ));
  }

  const extraction = resolvePronouns(
    mergeExtractions(chunkExtractions)
  );
  console.log("nach askAI | vor orderFacts");
  const orderedFacts = [...extraction.facts].sort(
    (a, b) =>
      (a.source?.start ?? Number.MAX_SAFE_INTEGER) -
      (b.source?.start ?? Number.MAX_SAFE_INTEGER)
  );
  console.log("nach orderFacts");
  let currentDate = context.referenceDate;

  const normalizedFacts: Fact[] = [];

  let activeTemporalText: string | undefined;
  let activeTemporalDate: string | undefined;
  console.log("vor for: orderfacts");
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
  console.log("nach for - orderFacts");
  const deduplicatedFacts = deduplicateFacts(normalizedFacts);
  console.log("nach dedeuplicate");
  return {
  ...extraction,
  facts: deduplicatedFacts,
};
}
