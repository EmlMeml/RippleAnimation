import type { Entity, Fact } from "../types/facts";

const SMALL: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
  fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19,
};
const TENS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};

export function parseEnglishCardinal(raw: string): number | null {
  const normalized = raw.toLowerCase().trim();
  if (/^\d{1,3}$/.test(normalized)) return Number(normalized);

  const words = normalized.split(/[\s-]+/).filter((word) => word !== "and");
  let total = 0;
  let current = 0;
  for (const word of words) {
    if (word in SMALL) current += SMALL[word];
    else if (word in TENS) current += TENS[word];
    else if (word === "hundred" && current > 0) current *= 100;
    else return null;
  }
  total += current;
  return total >= 0 && total <= 150 ? total : null;
}

function mentionedPeople(paragraph: string, people: Entity[]): Entity[] {
  const lower = paragraph.toLowerCase();
  return people.filter((person) =>
    new RegExp(`\\b${person.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(lower)
  );
}

function attributedSpeaker(paragraph: string, people: Entity[]): Entity | null {
  const speechVerb = "said|replied|asked|answered|laughed|insisted|declared";
  return people.find((person) => {
    const name = person.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`\\b${name}\\s+(?:${speechVerb})\\b|\\b(?:${speechVerb})\\s+${name}\\b`, "i")
      .test(paragraph);
  }) ?? null;
}

/** Adds only high-confidence, explicitly stated ages that the general extractor omitted. */
export function extractExplicitAgeFacts(text: string, entities: Entity[]): Fact[] {
  const people = entities.filter((entity) => entity.type === "person");
  const facts: Fact[] = [];
  const recentPeople: Entity[] = [];
  let previousSpeaker: Entity | null = null;

  text.split(/\r?\n/).forEach((paragraph, paragraphIndex) => {
    const mentioned = mentionedPeople(paragraph, people);
    for (const person of mentioned) {
      const previousIndex = recentPeople.findIndex((item) => item.id === person.id);
      if (previousIndex >= 0) recentPeople.splice(previousIndex, 1);
      recentPeople.push(person);
    }

    const speaker = attributedSpeaker(paragraph, people);
    const firstPersonAge = /\bI\s+(?:am|was|turned)\s+([\p{L}\d]+(?:[-\s][\p{L}]+)?)/iu.exec(paragraph);
    const contextualAge = /\b(?:at|aged)\s+([\p{L}\d]+(?:[-\s][\p{L}]+)?)(?=\s*[,.;])/iu.exec(paragraph);
    const namedAge = /\b([A-Z][\p{L}'’-]+)\s+(?:is|was|turned)\s+([\p{L}\d]+(?:[-\s][\p{L}]+)?)(?:\s+years?\s+old)?/u.exec(paragraph);

    let subject: Entity | null = null;
    let rawAge: string | null = null;
    let matchIndex = 0;

    if (namedAge) {
      subject = people.find((person) => person.name.toLowerCase() === namedAge[1].toLowerCase()) ?? null;
      rawAge = namedAge[2];
      matchIndex = namedAge.index;
    } else if (firstPersonAge) {
      subject = speaker ?? [...recentPeople].reverse().find((person) => person.id !== previousSpeaker?.id) ?? null;
      rawAge = firstPersonAge[1];
      matchIndex = firstPersonAge.index;
    } else if (contextualAge) {
      subject = mentioned[0] ?? recentPeople.at(-1) ?? null;
      rawAge = contextualAge[1];
      matchIndex = contextualAge.index;
    }

    const age = rawAge ? parseEnglishCardinal(rawAge) : null;
    if (subject && age !== null) {
      const trailingText = paragraph.slice(matchIndex + (rawAge?.length ?? 0));
      const temporalText = trailingText.match(/\b(?:last|next|this)\s+(?:month|year|week)\b/i)?.[0];
      facts.push({
        subject: subject.id,
        predicate: "age",
        value: age,
        ...(temporalText ? { temporal: { text: temporalText } } : {}),
        source: { paragraphIndex },
      });
    }

    if (speaker) previousSpeaker = speaker;
  });

  return facts;
}

export function addMissingExplicitAgeFacts(text: string, entities: Entity[], facts: Fact[]): Fact[] {
  const additions = extractExplicitAgeFacts(text, entities).filter((candidate) =>
    !facts.some((existing) =>
      existing.predicate === "age" &&
      existing.subject.toLowerCase() === candidate.subject.toLowerCase() &&
      existing.value === candidate.value &&
      existing.source?.paragraphIndex === candidate.source?.paragraphIndex
    )
  );
  return [...facts, ...additions];
}
