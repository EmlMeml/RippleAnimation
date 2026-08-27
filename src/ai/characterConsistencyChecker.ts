import { askAIStructured } from "./api";

export type CharacterConsistencyCategory =
  | "knowledge"
  | "belief"
  | "emotion"
  | "goal"
  | "motivation"
  | "memory"
  | "relationship"
  | "values_and_self_image"
  | "fear_and_need"
  | "development"
  | "thought_action_gap"
  | "point_of_view";

export type CharacterConsistencyKind =
  | "likely_contradiction"
  | "unexplained_shift"
  | "possible_ambiguity"
  | "knowledge_continuity"
  | "point_of_view_issue";

export interface CharacterEvidence {
  paragraphIndex: number;
  quote: string;
  interpretation: string;
}

export interface CharacterInconsistency {
  character: string;
  category: CharacterConsistencyCategory;
  kind: CharacterConsistencyKind;
  confidence: "low" | "medium" | "high";
  message: string;
  explanation: string;
  evidence: CharacterEvidence[];
}

interface CharacterConsistencyResponse {
  inconsistencies: CharacterInconsistency[];
}

const categories = new Set<CharacterConsistencyCategory>([
  "knowledge", "belief", "emotion", "goal", "motivation", "memory",
  "relationship", "values_and_self_image", "fear_and_need", "development",
  "thought_action_gap", "point_of_view",
]);
const kinds = new Set<CharacterConsistencyKind>([
  "likely_contradiction", "unexplained_shift", "possible_ambiguity",
  "knowledge_continuity", "point_of_view_issue",
]);

export function isCharacterConsistencyResponse(value: unknown): value is CharacterConsistencyResponse {
  if (!value || typeof value !== "object") return false;
  const items = (value as { inconsistencies?: unknown }).inconsistencies;
  return Array.isArray(items) && items.every((item) => {
    if (!item || typeof item !== "object") return false;
    const entry = item as Partial<CharacterInconsistency>;
    return typeof entry.character === "string" &&
      categories.has(entry.category as CharacterConsistencyCategory) &&
      kinds.has(entry.kind as CharacterConsistencyKind) &&
      ["low", "medium", "high"].includes(entry.confidence ?? "") &&
      typeof entry.message === "string" &&
      typeof entry.explanation === "string" &&
      Array.isArray(entry.evidence) && entry.evidence.length >= 1 &&
      entry.evidence.every((e) => Number.isInteger(e.paragraphIndex) &&
        typeof e.quote === "string" && typeof e.interpretation === "string");
  });
}

export async function checkCharacterConsistency(text: string): Promise<CharacterInconsistency[]> {
  const numberedText = text.split(/\r?\n/).map((paragraph, index) =>
    `[Paragraph ${index}] ${paragraph}`
  ).join("\n");

  const prompt = `You are a character-continuity editor for long-form creative writing.
Analyze the story in any language for psychologically or perspectivally inconsistent character writing.

Check: knowledge/information access, beliefs, emotions, goals, motivations, memories,
relationships, values/self-image, fears/needs, character development, thought-versus-action,
and point-of-view access.

Important rules:
- A change is not automatically an inconsistency. Look for a missing or implausible transition.
- Allow character development, mixed feelings, lies, denial, unreliable narration, trauma,
  deliberate secrecy, and self-deception when the text supports them.
- Do not report ordinary mood changes or merely complex behavior.
- This is NOT a factual continuity check. Do not report contradictions in age, occupation,
  appearance, location, possessions, or family structure merely because two facts disagree.
- Report a factual disagreement only when it demonstrates the character's knowledge,
  memory, belief, self-perception, deception, or a point-of-view access problem. Explain
  that psychological dimension explicitly; otherwise omit it for the separate fact checker.
- Report only issues supported by exact passages. Never invent a quote.
- Use zero-based paragraphIndex values from the labels.
- Prefer precision over quantity. Return no issue when evidence is insufficient.

Return ONLY JSON in this exact shape:
{"inconsistencies":[{"character":"name","category":"knowledge|belief|emotion|goal|motivation|memory|relationship|values_and_self_image|fear_and_need|development|thought_action_gap|point_of_view","kind":"likely_contradiction|unexplained_shift|possible_ambiguity|knowledge_continuity|point_of_view_issue","confidence":"low|medium|high","message":"brief reader-facing message","explanation":"why this may be inconsistent and what could explain it","evidence":[{"paragraphIndex":0,"quote":"exact short quote","interpretation":"what it establishes"}]}]}

STORY:
${numberedText}`;

  const response = await askAIStructured(prompt, isCharacterConsistencyResponse);
  return response.inconsistencies;
}
