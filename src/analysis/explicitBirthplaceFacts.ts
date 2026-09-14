import type { FactExtraction } from "../types/facts";

const escapePattern = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const placeName = "[A-ZÀ-ÖØ-Þ][\\p{L}'’-]*(?: [A-ZÀ-ÖØ-Þ][\\p{L}'’-]*)*";
const nonPlaces = /^(?:January|February|March|April|May|June|July|August|September|October|November|December|Spring|Summer|Autumn|Winter)$/i;

/** Narrow fallback for direct narrative birthplace claims, never reported beliefs. */
export function explicitBirthplaceClaims(text: string, person: string) {
  const pattern = new RegExp(`(?:^|[.!?]\\s+)(${escapePattern(person)}\\s+was born in\\s+(${placeName}))(?=[,.;!?]|$)`, "gu");
  return [...text.matchAll(pattern)].flatMap((match) => {
    const place = match[2];
    if (nonPlaces.test(place)) return [];
    const start = match.index! + match[0].indexOf(match[1]);
    return [{ place, start, end: start + match[1].length }];
  });
}

export function addMissingExplicitBirthplaceFacts(text: string, extraction: FactExtraction): FactExtraction {
  const entities = [...extraction.entities];
  const facts = [...extraction.facts];
  let paragraphOffset = 0;
  text.split(/\r?\n/).forEach((paragraph, paragraphIndex) => {
    for (const person of entities.filter((entity) => entity.type === "person")) {
      for (const claim of explicitBirthplaceClaims(paragraph, person.name)) {
        let place = entities.find((entity) => entity.type === "place" && entity.name.toLowerCase() === claim.place.toLowerCase());
        if (!place) {
          const baseId = claim.place.toLowerCase().replace(/\s+/g, "_");
          let id = baseId;
          let suffix = 1;
          while (entities.some((entity) => entity.id === id)) id = `${baseId}_${suffix++}`;
          place = { id, name: claim.place, type: "place" };
          entities.push(place);
        }
        if (facts.some((fact) => fact.subject === person.id && fact.predicate === "born_in" &&
          (fact.object === place.id || String(fact.object ?? fact.value).toLowerCase() === claim.place.toLowerCase()) &&
          fact.source?.paragraphIndex === paragraphIndex)) continue;
        facts.push({ subject: person.id, predicate: "born_in", object: place.id,
          source: { paragraphIndex, start: paragraphOffset + claim.start, end: paragraphOffset + claim.end } });
      }
    }
    paragraphOffset += paragraph.length + (text.slice(paragraphOffset + paragraph.length).startsWith("\r\n") ? 2 : 1);
  });
  return { entities, facts };
}
