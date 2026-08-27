import type { FactExtraction } from "../../types/facts";

/**
 * Deterministic extraction result for the bundled fantasy story.
 * This mirrors the result normally returned by the AI extraction step.
 */
export const EXAMPLE_FACTS: FactExtraction = {
  entities: [
    { id: "alice", name: "Alice", type: "person" },
    { id: "bob", name: "Bob", type: "person" },
    { id: "eve", name: "Eve", type: "person" },
    { id: "glassmere", name: "Glassmere", type: "place" },
    { id: "frostvale", name: "Frostvale", type: "place" },
    { id: "sunreach", name: "Sunreach", type: "place" },
  ],
  facts: [
    {
      subject: "alice",
      predicate: "age",
      value: 28,
      source: { paragraphIndex: 0 },
    },
    {
      subject: "glassmere",
      predicate: "located_in",
      object: "frostvale",
      source: { paragraphIndex: 2 },
    },
    {
      subject: "bob",
      predicate: "sibling_of",
      object: "bob",
      source: { paragraphIndex: 3 },
    },
    {
      subject: "glassmere",
      predicate: "located_in",
      object: "sunreach",
      source: { paragraphIndex: 6 },
    },
    {
      subject: "alice",
      predicate: "age",
      value: 35,
      source: { paragraphIndex: 7 },
    },
  ],
};
