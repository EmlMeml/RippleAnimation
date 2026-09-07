import type { FactExtraction } from "../../types/facts";

function studyFacts(person: string, firstTown: string, secondTown: string, firstAge: number, secondAge: number): FactExtraction {
  const personId = person.toLowerCase();
  const firstTownId = firstTown.toLowerCase();
  const secondTownId = secondTown.toLowerCase();
  return {
    entities: [
      { id: personId, name: person, type: "person" },
      { id: firstTownId, name: firstTown, type: "place" },
      { id: secondTownId, name: secondTown, type: "place" },
    ],
    facts: [
      { subject: personId, predicate: "age", value: firstAge, source: { paragraphIndex: 1 } },
      { subject: personId, predicate: "born_in", object: firstTownId, source: { paragraphIndex: 3 } },
      { subject: personId, predicate: "age", value: secondAge, source: { paragraphIndex: 6 } },
      { subject: personId, predicate: "born_in", object: secondTownId, source: { paragraphIndex: 9 } },
    ],
  };
}

export const EXAMPLE_FACTS = studyFacts("Alice", "Bellwick", "Marston", 32, 39);
export const SECOND_EXAMPLE_FACTS = studyFacts("Mara", "Harton", "Dunford", 34, 41);
