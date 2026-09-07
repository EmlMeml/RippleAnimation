import type { CharacterInconsistency } from "../../ai/characterConsistencyChecker";

function studyCharacterInconsistencies(character: "Ben" | "Ivo", report: string): CharacterInconsistency[] {
  const historian = character === "Ben" ? "Eve" : "Sela";
  return [
    {
      character,
      category: "belief",
      kind: "unexplained_shift",
      confidence: "high",
      message: `${character} reverses a stated professional belief without explanation.`,
      explanation: `${character} first says eyewitness memories are never more trustworthy than written records, then states the exact opposite as the same professional principle.`,
      evidence: [
        { paragraphIndex: 2, quote: `${character} insisted that he never trusted eyewitness memories more than written records.`, interpretation: "Establishes an absolute preference for written records." },
        { paragraphIndex: 8, quote: `${character} declared that he always trusted eyewitness memories more than written records.`, interpretation: "States the opposite belief without a transition." },
      ],
    },
    {
      character: historian,
      category: "memory",
      kind: "likely_contradiction",
      confidence: "high",
      message: `${historian} both denies knowing and remembers writing the ${report}.`,
      explanation: "An explicit denial of seeing or knowing the report conflicts with a detailed memory of writing and signing it, without an explanation for the change.",
      evidence: [
        { paragraphIndex: 4, quote: `${historian} explained that she had never seen the ${report} and knew nothing about its contents.`, interpretation: "Explicitly denies having seen or known the report." },
        { paragraphIndex: 11, quote: `${historian} clearly remembered writing and signing the ${report} herself the previous winter.`, interpretation: "Provides a specific memory of authoring the report." },
      ],
    },
  ];
}

export const EXAMPLE_CHARACTER_INCONSISTENCIES = studyCharacterInconsistencies("Ben", "Bellwick drainage report");
export const SECOND_EXAMPLE_CHARACTER_INCONSISTENCIES = studyCharacterInconsistencies("Ivo", "Harton equipment report");
