import { extractFacts } from "../analysis/extractesFacts";
import { checkConsistency, type Inconsistency } from "./consistencyChecker";
import type { Entity } from "../types/facts";
import type { StoryContext } from "../types/story";

export type ReviewParagraph = { paragraphIndex: number; text: string };

/** One compact extraction of the edited issue's passages and their counterparts. */
export async function recheckStoryPassages(
  paragraphs: ReviewParagraph[], target: Inconsistency, entities: Entity[], context: StoryContext,
): Promise<Inconsistency | null> {
  if (!paragraphs.some((paragraph) => paragraph.text.trim())) return null;
  const result = await extractFacts(paragraphs.map((paragraph) => paragraph.text).join("\n"), context);
  if (!result.facts.length) throw new Error("No facts could be extracted from these passages. Please retry Reanalyze.");
  const normalize = (value: string) => value.toLowerCase().replace(/[\s_-]+/g, " ").trim();
  const canonicalIds = new Map(result.entities.map((entity) => [entity.id,
    entities.find((known) => known.type === entity.type && normalize(known.name) === normalize(entity.name))?.id ?? entity.id,
  ]));
  const facts = result.facts.map((fact) => ({
    ...fact,
    subject: canonicalIds.get(fact.subject) ?? fact.subject,
    object: fact.object ? canonicalIds.get(fact.object) ?? fact.object : fact.object,
    // Extraction offsets belong to the compact request, not to the full document.
    source: { paragraphIndex: paragraphs[fact.source?.paragraphIndex ?? 0]?.paragraphIndex },
  }));
  const relevantPredicates = new Set(target.facts.map((fact) => fact.predicate));
  if (!facts.some((fact) => normalize(fact.subject) === normalize(target.subject) && relevantPredicates.has(fact.predicate))) {
    throw new Error("The relevant statements could not be verified. Please retry Reanalyze.");
  }
  const checked = checkConsistency({ entities: [...entities, ...result.entities], facts });
  return checked.find((issue) => normalize(issue.subject) === normalize(target.subject) && issue.predicate === target.predicate) ?? null;
}
