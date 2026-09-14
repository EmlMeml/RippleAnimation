import { beforeEach, describe, expect, it, vi } from "vitest";
import { askAIStructured } from "./api";
import { reconcileConsistencyCategories } from "./reconcileConsistencyCategories";
import type { CharacterInconsistency } from "./characterConsistencyChecker";
import type { Inconsistency } from "./consistencyChecker";
import type { Predicate } from "../types/facts";

vi.mock("./api", () => ({ askAIStructured: vi.fn() }));
const entities = [{ id: "alice", name: "Alice", type: "person" as const }];
const candidate: CharacterInconsistency = {
  character: "Alice", category: "memory", kind: "likely_contradiction", confidence: "high",
  message: "Alice's information contradicts itself.", explanation: "The two statements disagree.",
  evidence: [
    { paragraphIndex: 0, quote: "Alice was born in Bellwick.", interpretation: "First statement." },
    { paragraphIndex: 1, quote: "Alice was born in Marston.", interpretation: "Second statement." },
  ],
};
const text = candidate.evidence.map((entry) => entry.quote).join("\n");
const story: Inconsistency = {
  type: "conflicting_fact", category: "exclusive_fact", subject: "alice", predicate: "born_in",
  message: "Alice's birthplaces disagree.", facts: [
    { subject: "alice", predicate: "born_in", object: "bellwick", source: { paragraphIndex: 0 } },
    { subject: "alice", predicate: "born_in", object: "marston", source: { paragraphIndex: 1 } },
  ],
};

beforeEach(() => vi.clearAllMocks());

describe("shared consistency categories", () => {
  it("removes only the confirmed duplicate, preserves a new independent issue and the story result", async () => {
    const independent = { ...candidate, category: "belief" as const, message: "Alice now contradicts her stated belief." };
    vi.mocked(askAIStructured).mockResolvedValue({ inconsistencies: [candidate] });
    const originalStory = structuredClone(story);
    const result = await reconcileConsistencyCategories(text, [story], [candidate, independent], entities);
    expect(result.characters).toEqual([independent]);
    expect(result.characters[0]).toBe(independent);
    expect(story).toEqual(originalStory);
  });

  it("keeps an independent character issue even when it shares all source paragraphs", async () => {
    vi.mocked(askAIStructured).mockResolvedValue({ inconsistencies: [] });
    expect((await reconcileConsistencyCategories(text, [story], [candidate], entities)).characters).toEqual([candidate]);
  });

  it.each<Predicate>([
    "age", "gender", "born_in", "lives_in", "located_in", "works_at", "occupation",
    "parent_of", "child_of", "sibling_of", "married_to", "friend_of", "owns", "has",
    "younger_than", "older_than", "participates_in",
  ])("supports the same duplicate decision for predicate %s without a category-specific filter", async (predicate) => {
    vi.mocked(askAIStructured).mockResolvedValue({ inconsistencies: [candidate] });
    const issue = { ...story, predicate, facts: story.facts.map((fact) => ({ ...fact, predicate })) };
    expect((await reconcileConsistencyCategories(text, [issue], [candidate], entities)).characters).toEqual([]);
  });

  it("does not discard character findings when the fact checker has no matching findings", async () => {
    expect((await reconcileConsistencyCategories(text, [], [candidate], entities)).characters).toEqual([candidate]);
    expect(askAIStructured).not.toHaveBeenCalled();
  });

  it("does not call AI for an empty character result", async () => {
    expect((await reconcileConsistencyCategories(text, [story], [], entities)).characters).toEqual([]);
    expect(askAIStructured).not.toHaveBeenCalled();
  });

  it("retains all results with an explicit warning if reconciliation fails", async () => {
    vi.mocked(askAIStructured).mockRejectedValue(new Error("timeout"));
    const result = await reconcileConsistencyCategories(text, [story], [candidate], entities);
    expect(result.characters).toEqual([candidate]);
    expect(result.warning).toContain("duplicates may remain");
  });

  it("rejects rewritten or invented entries instead of deleting a real card", async () => {
    vi.mocked(askAIStructured).mockResolvedValue({ inconsistencies: [{ ...candidate, message: "Invented" }] });
    const result = await reconcileConsistencyCategories(text, [story], [candidate], entities);
    expect(result.characters).toEqual([candidate]);
    expect(result.warning).toBeDefined();
    const validate = vi.mocked(askAIStructured).mock.calls[0][1];
    expect(validate({ inconsistencies: [structuredClone(candidate)] })).toBe(true);
    expect(validate({ inconsistencies: [{ ...candidate, evidence: [] }] })).toBe(false);
  });

  it("recompares current results after text edits without reusing an earlier duplicate decision", async () => {
    vi.mocked(askAIStructured)
      .mockResolvedValueOnce({ inconsistencies: [candidate] })
      .mockResolvedValueOnce({ inconsistencies: [] });
    expect((await reconcileConsistencyCategories(text, [story], [candidate], entities)).characters).toEqual([]);
    const updatedText = `${text}\nAlice remembered something she had denied knowing.`;
    const updated = { ...candidate, evidence: [...candidate.evidence, {
      paragraphIndex: 2, quote: "Alice remembered something she had denied knowing.", interpretation: "New memory claim.",
    }] };
    expect((await reconcileConsistencyCategories(updatedText, [story], [updated], entities)).characters).toEqual([updated]);
    expect(vi.mocked(askAIStructured).mock.calls[1][0]).toContain("New memory claim.");
  });
});
