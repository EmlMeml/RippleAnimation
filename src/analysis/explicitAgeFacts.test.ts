import { describe, expect, it } from "vitest";
import { extractExplicitAgeFacts, parseEnglishCardinal } from "./explicitAgeFacts";

const people = [
  { id: "alice", name: "Alice", type: "person" as const },
  { id: "eve", name: "Eve", type: "person" as const },
];

describe("explicit age extraction", () => {
  it("parses English number words", () => {
    expect(parseEnglishCardinal("thirty-two")).toBe(32);
    expect(parseEnglishCardinal("twenty nine")).toBe(29);
  });

  it("extracts both ages from the Greyhaven dialogue", () => {
    const text = [
      "Alice arrived in Greyhaven. At thirty-two, she felt too old to return.",
      "Eve opened the door.",
      "“You look exactly the same,” Eve said.",
      "“That’s generous. I turned twenty-nine last month.”",
    ].join("\n");

    expect(extractExplicitAgeFacts(text, people)).toEqual([
      expect.objectContaining({ subject: "alice", predicate: "age", value: 32, source: { paragraphIndex: 0 } }),
      expect.objectContaining({ subject: "alice", predicate: "age", value: 29, temporal: { text: "last month" }, source: { paragraphIndex: 3 } }),
    ]);
  });
});
