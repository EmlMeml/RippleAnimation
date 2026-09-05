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

type AbsoluteClaim = {
  character: string;
  verb: string;
  polarity: "positive" | "negative";
  paragraphIndex: number;
  quote: string;
};

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

const speechVerbs = "said|replied|asked|laughed|insisted|declared|answered|thought|remembered";

function inferParagraphCharacter(paragraph: string): string | null {
  const afterName = paragraph.match(new RegExp(`\\b([A-Z][\\p{L}'’-]+)\\s+(?:${speechVerbs})\\b`, "u"));
  if (afterName) return afterName[1];

  const afterVerb = paragraph.match(new RegExp(`\\b(?:${speechVerbs})\\s+([A-Z][\\p{L}'’-]+)\\b`, "u"));
  if (afterVerb) return afterVerb[1];

  const openingName = paragraph.match(/^\s*([A-Z][\p{L}'’-]+)\b/u)?.[1];
  return openingName && !["The", "At", "Inside", "Beyond", "Far", "By", "After", "Before"]
    .includes(openingName) ? openingName : null;
}

function canonicalVerb(rawVerb: string): string {
  const verb = rawVerb.toLowerCase().replace(/[^a-z]/g, "");
  const knownForms: Record<string, string> = {
    believed: "believe",
    believes: "believe",
    trusted: "trust",
    trusts: "trust",
    cared: "care",
    cares: "care",
  };
  return knownForms[verb] ?? verb.replace(/(?:ing|ed|s)$/, "");
}

function sentenceAt(paragraph: string, index: number): string {
  let start = index;
  let end = index;
  while (start > 0 && !/[.!?]/.test(paragraph[start - 1])) start -= 1;
  while (end < paragraph.length && !/[.!?]/.test(paragraph[end])) end += 1;
  if (end < paragraph.length) end += 1;
  return paragraph.slice(start, end).trim().replace(/^[“”"'\s]+|[“”"'\s]+$/g, "");
}

function extractAbsoluteClaims(text: string): AbsoluteClaim[] {
  const claims: AbsoluteClaim[] = [];
  const paragraphs = text.split(/\r?\n/);

  paragraphs.forEach((paragraph, paragraphIndex) => {
    const character = inferParagraphCharacter(paragraph);
    if (!character) return;

    const patterns: Array<{ pattern: RegExp; polarity: AbsoluteClaim["polarity"]; verbGroup: number }> = [
      { pattern: /\bnever\s+(\p{L}+)/giu, polarity: "negative", verbGroup: 1 },
      { pattern: /\b(?:do|does|did)n['’]?t\s+(\p{L}+)/giu, polarity: "negative", verbGroup: 1 },
      { pattern: /\balways\s+(\p{L}+)/giu, polarity: "positive", verbGroup: 1 },
      { pattern: /\b(\p{L}+)\s+all\s+(?:my|his|her|their)\s+life\b/giu, polarity: "positive", verbGroup: 1 },
    ];

    for (const { pattern, polarity, verbGroup } of patterns) {
      for (const match of paragraph.matchAll(pattern)) {
        if (match.index === undefined || !match[verbGroup]) continue;
        claims.push({
          character,
          verb: canonicalVerb(match[verbGroup]),
          polarity,
          paragraphIndex,
          quote: sentenceAt(paragraph, match.index),
        });
      }
    }
  });

  return claims;
}

/** High-precision fallback for explicit absolute statements such as never/always. */
export function checkExplicitCharacterContradictions(text: string): CharacterInconsistency[] {
  const claims = extractAbsoluteClaims(text);
  const grouped = new Map<string, AbsoluteClaim[]>();

  for (const claim of claims) {
    const key = `${claim.character.toLowerCase()}|${claim.verb}`;
    grouped.set(key, [...(grouped.get(key) ?? []), claim]);
  }

  const results: CharacterInconsistency[] = [];
  for (const group of grouped.values()) {
    const negative = group.find((claim) => claim.polarity === "negative");
    const positive = group.find((claim) => claim.polarity === "positive");
    if (!negative || !positive) continue;

    results.push({
      character: negative.character,
      category: "belief",
      kind: "likely_contradiction",
      confidence: "high",
      message: `${negative.character}'s absolute statements about ${negative.verb} contradict each other.`,
      explanation: "One passage uses an explicit negative absolute while another uses an explicit positive absolute, without a stated transition.",
      evidence: [
        { paragraphIndex: negative.paragraphIndex, quote: negative.quote, interpretation: `Establishes that ${negative.character} never ${negative.verb}s.` },
        { paragraphIndex: positive.paragraphIndex, quote: positive.quote, interpretation: `Establishes that ${negative.character} always ${negative.verb}s.` },
      ],
    });
  }

  return results;
}

export function isSameCharacterIssue(first: CharacterInconsistency, second: CharacterInconsistency): boolean {
  const normalize = (text: string) => text.trim().toLowerCase().replace(/\s+/g, " ");
  if (normalize(first.character) !== normalize(second.character)) return false;
  const matchingEvidence = first.evidence.filter((evidence) => second.evidence.some((other) => {
    if (evidence.paragraphIndex !== other.paragraphIndex) return false;
    const quote = normalize(evidence.quote);
    const otherQuote = normalize(other.quote);
    return Boolean(quote && otherQuote) && (quote.includes(otherQuote) || otherQuote.includes(quote));
  }));
  // Classification and wording can vary between AI runs. Across categories,
  // require both sides of the conflict rather than a single shared passage.
  return matchingEvidence.length >= 2 ||
    (first.category === second.category && matchingEvidence.length > 0);
}

export function deduplicateCharacterInconsistencies(items: CharacterInconsistency[]): CharacterInconsistency[] {
  return items.filter((item, index) => !items.slice(0, index).some((earlier) =>
    isSameCharacterIssue(earlier, item)
  ));
}

export function mergeCharacterInconsistencies(
  deterministic: CharacterInconsistency[],
  aiGenerated: CharacterInconsistency[]
): CharacterInconsistency[] {
  const merged = deduplicateCharacterInconsistencies(deterministic);
  for (const candidate of aiGenerated) {
    const searchableText = [
      candidate.message,
      candidate.explanation,
      ...candidate.evidence.map((item) => `${item.quote} ${item.interpretation}`),
    ].join(" ");
    // Age continuity belongs to the deterministic Story Facts checker, even
    // when a model frames the discrepancy as self-image or memory.
    if (/\bage\b|\byears?\s+old\b|\bturned\s+(?:\d+|[a-z]+(?:[-\s][a-z]+)?)/i.test(searchableText)) {
      continue;
    }

    const duplicate = merged.some((existing) => isSameCharacterIssue(existing, candidate));
    if (!duplicate) merged.push(candidate);
  }
  return merged;
}

export function hasVerifiedCharacterEvidence(issue: CharacterInconsistency, text: string): boolean {
  const paragraphs = text.split(/\r?\n/);
  return issue.evidence.length > 0 && issue.evidence.every((item) =>
    Boolean(item.quote.trim()) && Number.isInteger(item.paragraphIndex) &&
    Boolean(paragraphs[item.paragraphIndex]?.includes(item.quote))
  );
}

export async function checkCharacterConsistency(text: string, target?: CharacterInconsistency): Promise<CharacterInconsistency[]> {
  const startedAt = performance.now();
  const numberedText = text.split(/\r?\n/).map((paragraph, index) =>
    `[Paragraph ${index}] ${paragraph}`
  ).join("\n");

  const prompt = `You are a character-continuity editor for long-form creative writing.
${target ? `TARGETED RECHECK: Reevaluate only the following existing issue and its directly dependent passages. Do not discover unrelated issues. Keep the character, category, and kind of this issue in any updated result. The story is provided for context. Return no issue if it is resolved. Existing issue: ${JSON.stringify(target)}` : ""}
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

  const deterministic = checkExplicitCharacterContradictions(text);
  const attempts = await Promise.allSettled([
    askAIStructured(prompt, isCharacterConsistencyResponse),
    ...(target ? [] : [askAIStructured(prompt, isCharacterConsistencyResponse)]),
  ]);
  const successful = attempts.flatMap((attempt) =>
    attempt.status === "fulfilled" ? attempt.value.inconsistencies : []
  );

  if (attempts.every((attempt) => attempt.status === "rejected") && deterministic.length === 0) {
    throw attempts[0].status === "rejected"
      ? attempts[0].reason
      : new Error("Character consistency analysis failed.");
  }

  const candidates = mergeCharacterInconsistencies(deterministic, successful);
  if (target && candidates.some((issue) =>
    issue.character.trim().toLowerCase() === target.character.trim().toLowerCase() &&
    issue.category === target.category && !hasVerifiedCharacterEvidence(issue, text)
  )) {
    throw new Error("The recheck returned passages that could not be located. Please retry the check.");
  }
  const merged = candidates.filter((issue) => hasVerifiedCharacterEvidence(issue, text));

  console.groupCollapsed(
    `[Character consistency] ${merged.length} issue${merged.length === 1 ? "" : "s"} ` +
    `(${((performance.now() - startedAt) / 1000).toFixed(2)}s)`
  );
  console.log("Deterministic issues:", deterministic);
  attempts.forEach((attempt, index) => {
    if (attempt.status === "fulfilled") {
      console.log(`AI attempt ${index + 1}:`, attempt.value.inconsistencies);
    } else {
      console.warn(`AI attempt ${index + 1} failed:`, attempt.reason);
    }
  });
  console.log("Merged character issues:", merged);
  console.groupEnd();

  return merged;
}
