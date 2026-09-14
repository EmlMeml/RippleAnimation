import { beforeEach, describe, expect, it, vi } from "vitest";
import { extractFacts } from "../analysis/extractesFacts";
import { recheckStoryPassages } from "./recheckStoryPassages";
import type { Inconsistency } from "./consistencyChecker";

vi.mock("../analysis/extractesFacts", () => ({ extractFacts: vi.fn() }));
const entities = [{ id: "person-1", name: "Alice", type: "person" as const }];
const target: Inconsistency = {
  type: "conflicting_fact", category: "exclusive_fact", subject: "person-1", predicate: "age",
  message: "Alice's age changes from 20 to 39.",
  facts: [20, 39].map((value, paragraphIndex) => ({ subject: "person-1", predicate: "age", value, source: { paragraphIndex } })),
};
const context = { referenceDate: "2026-08-14" };
function extraction(ages: number[]) {
  return { entities: [{ id: "alice", name: "Alice", type: "person" as const }],
    facts: ages.map((value, paragraphIndex) => ({ subject: "alice", predicate: "age" as const, value, source: { paragraphIndex } })) };
}
beforeEach(() => vi.clearAllMocks());

describe("targeted story passage recheck", () => {
  it("uses one compact extraction for the changed passage and its counterpart", async () => {
    vi.mocked(extractFacts).mockResolvedValue(extraction([21, 39]));
    const paragraphs = [
      { paragraphIndex: 3, text: "Alice was 21 years old." },
      { paragraphIndex: 9, text: "Alice was 39 years old." },
    ];
    const result = await recheckStoryPassages(paragraphs, target, entities, context);
    expect(extractFacts).toHaveBeenCalledExactlyOnceWith("Alice was 21 years old.\nAlice was 39 years old.", context);
    expect(result?.subject).toBe("person-1");
    expect(result?.facts.map((fact) => fact.source?.paragraphIndex)).toEqual([3, 9]);
    expect(result?.facts.map((fact) => fact.value)).toEqual([21, 39]);
  });

  it("resolves the original mismatch when the replacement is actually 39", async () => {
    vi.mocked(extractFacts).mockResolvedValue(extraction([39, 39]));
    expect(await recheckStoryPassages([
      { paragraphIndex: 3, text: "Alice was 39 years old." },
      { paragraphIndex: 9, text: "Alice was 39 years old." },
    ], target, entities, context)).toBeNull();
  });

  it("does not treat an empty AI extraction as a resolved inconsistency", async () => {
    vi.mocked(extractFacts).mockResolvedValue({ entities: [], facts: [] });
    await expect(recheckStoryPassages([{ paragraphIndex: 3, text: "Alice was 20 years old." }], target, entities, context)).rejects.toThrow("No facts");
  });

  it("does not resolve when the AI only returns unrelated facts", async () => {
    vi.mocked(extractFacts).mockResolvedValue({ entities, facts: [{ subject: "bob", predicate: "occupation", value: "teacher" }] });
    await expect(recheckStoryPassages([{ paragraphIndex: 3, text: "Alice was 20 years old." }], target, entities, context)).rejects.toThrow("could not be verified");
  });

  it("does not send a request when all associated text has been deleted", async () => {
    expect(await recheckStoryPassages([], target, entities, context)).toBeNull();
    expect(extractFacts).not.toHaveBeenCalled();
  });

  it("propagates request errors so the card can retain its changed status and retry", async () => {
    vi.mocked(extractFacts).mockRejectedValue(new Error("timeout"));
    await expect(recheckStoryPassages([{ paragraphIndex: 3, text: "Alice was 21 years old." }], target, entities, context)).rejects.toThrow("timeout");
  });
});
