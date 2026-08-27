import type { CharacterInconsistency } from "../../ai/characterConsistencyChecker";

/** Deterministic character-continuity result for the bundled example story. */
export const EXAMPLE_CHARACTER_INCONSISTENCIES: CharacterInconsistency[] = [
  {
    character: "Alice",
    category: "emotion",
    kind: "unexplained_shift",
    confidence: "high",
    message: "Alice's severe fear of heights disappears without a transition.",
    explanation: "The story establishes a physically paralysing fear, but days later Alice calmly approaches and crosses a bottomless gorge without reflection, distress, or a motivating event.",
    evidence: [
      { paragraphIndex: 0, quote: "Alice was terrified of heights; even stepping onto its lowest balcony made her dizzy and unable to move.", interpretation: "Establishes an intense and disabling fear of heights." },
      { paragraphIndex: 4, quote: "Without hesitation, Alice walked to its crumbling edge, looked calmly into the abyss, and crossed first with an easy stride.", interpretation: "Shows the opposite emotional and physical response without development." },
    ],
  },
  {
    character: "Eve",
    category: "memory",
    kind: "likely_contradiction",
    confidence: "high",
    message: "Eve both denies and remembers visiting the Ashen Chapel.",
    explanation: "No memory recovery, deception, or supernatural influence explains why Eve's explicit statement is replaced by a detailed childhood memory later the same day.",
    evidence: [
      { paragraphIndex: 5, quote: "Eve told her companions that she had never visited the chapel and knew nothing about what lay inside it.", interpretation: "Explicitly denies any previous visit or knowledge." },
      { paragraphIndex: 6, quote: "Eve casually remembered hiding the bronze key beneath it during a childhood visit to the chapel.", interpretation: "Provides a specific memory of having visited the chapel." },
    ],
  },
  {
    character: "Alice",
    category: "belief",
    kind: "unexplained_shift",
    confidence: "high",
    message: "Alice reverses her belief about carved stone without explanation.",
    explanation: "Her categorical professional principle changes to its exact opposite, but the intervening events do not show her reconsidering it or discovering that the milestone was false.",
    evidence: [
      { paragraphIndex: 2, quote: "She insisted that carved stone never lied and that she would always trust it over maps, memories, or rumor.", interpretation: "Establishes an absolute belief in carved evidence." },
      { paragraphIndex: 6, quote: "Alice dismissed the carved mosaic at once, declaring that marks cut into stone were less trustworthy than rumor", interpretation: "States the opposite belief without a transition." },
    ],
  },
];
