import { describe, expect, it, vi } from "vitest";
import { extractFacts } from "./extractesFacts";
import { askAI } from "./../ai/api";
import type { FactExtraction } from "../types/facts";

vi.mock("./../ai/api", () => ({
  askAI: vi.fn(),
}));

describe("extractFacts", () => {
  const context = {
    referenceDate: "2026-08-14",
  };

  it("wiederholt nur einen fehlgeschlagenen Chunk", async () => {
    const extraction: FactExtraction = {
      entities: [],
      facts: [],
    };
    const text = Array.from(
      { length: 1501 },
      (_, index) => `wort${index}`
    ).join(" ");

    vi.mocked(askAI)
      .mockRejectedValueOnce(new Error("empty response"))
      .mockResolvedValue(extraction);

    await expect(extractFacts(text, context)).resolves.toEqual(extraction);
    expect(askAI).toHaveBeenCalledTimes(3);
  });

  it("übernimmt zeitlichen Kontext aus der AI-Antwort", async () => {
    vi.mocked(askAI).mockResolvedValue({
      entities: [
        {
          id: "anna",
          name: "Anna",
          type: "person",
        },
        {
          id: "munich",
          name: "Munich",
          type: "place",
        },
      ],
      facts: [
        {
          subject: "anna",
          predicate: "lives_in",
          object: "munich",
          temporal: {
            text: "heute",
          },
        },
      ],
    });

    const result = await extractFacts(
      "Anna lebt heute in München.",
      context
    );

    expect(result.facts).toContainEqual({
      subject: "anna",
      predicate: "lives_in",
      object: "munich",
      temporal: {
        text: "heute",
        from: "2026-08-14",
        to: "2026-08-14",
        source: "anchor",
        anchor: "2026-08-14",
        advancesTimeline: false,
      },
    });

    expect(askAI).toHaveBeenCalledWith(
        expect.stringContaining(
            "Anna lebt heute in München."
        )
    );
  });

  it("übernimmt unterschiedliche zeitliche Angaben", async () => {
  const mockedAskAI = vi.mocked(askAI);

  mockedAskAI.mockResolvedValue({
    entities: [
      {
        id: "anna",
        name: "Anna",
        type: "person",
      },
      {
        id: "munich",
        name: "Munich",
        type: "place",
      },
      {
        id: "berlin",
        name: "Berlin",
        type: "place",
      },
    ],
    facts: [
      {
        subject: "anna",
        predicate: "located_in",
        object: "munich",
        temporal: {
          text: "heute",
        },
      },
      {
        subject: "anna",
        predicate: "located_in",
        object: "berlin",
        temporal: {
          text: "morgen",
        },
      },
    ],
  });

  const result = await extractFacts(
    "Anna ist heute in München und morgen in Berlin.",
    context
  );

  expect(result.facts).toHaveLength(2);

  expect(result.facts).toContainEqual({
    subject: "anna",
    predicate: "located_in",
    object: "munich",
    temporal: {
      text: "heute",
      from: "2026-08-14",
      to: "2026-08-14",
      source: "anchor",
      anchor: "2026-08-14",
      advancesTimeline: false,
    },
  });

  expect(result.facts).toContainEqual({
    subject: "anna",
    predicate: "located_in",
    object: "berlin",
    temporal: {
      text: "morgen",
      from: "2026-08-15",
      to: "2026-08-15",
      source: "anchor",
      anchor: "2026-08-14",
      advancesTimeline: false,
    },
  });
  
  });

  it("akzeptiert Facts ohne zeitlichen Kontext", async () => {
  const mockedAskAI = vi.mocked(askAI);

  mockedAskAI.mockResolvedValue({
    entities: [
      {
        id: "anna",
        name: "Anna",
        type: "person",
      },
    ],
    facts: [
      {
        subject: "anna",
        predicate: "occupation",
        value: "writer",
      },
    ],
  });

  const result = await extractFacts(
    "Anna ist Schriftstellerin.",
    context
  );

  expect(result.facts).toContainEqual({
    subject: "anna",
    predicate: "occupation",
    value: "writer",
    temporal: {
      from: "2026-08-14",
      to: "2026-08-14",
      source: "implicit",
      anchor: "2026-08-14",
      advancesTimeline: false,
    },
  });
  });

  it("normalisiert zeitlichen Kontext anhand des StoryContext", async () => {
  vi.mocked(askAI).mockResolvedValue({
    entities: [
      {
        id: "anna",
        name: "Anna",
        type: "person",
      },
      {
        id: "berlin",
        name: "Berlin",
        type: "place",
      },
    ],
    facts: [
      {
        subject: "anna",
        predicate: "located_in",
        object: "berlin",
        temporal: {
          text: "morgen",
        },
      },
    ],
  });

  const result = await extractFacts(
    "Anna wird morgen nach Berlin fahren.",
    {
      referenceDate: "2026-08-14",
    }
  );

  expect(result.facts[0].temporal).toEqual({
    text: "morgen",
    from: "2026-08-15",
    to: "2026-08-15",
    source: "anchor",
    anchor: "2026-08-14",
    advancesTimeline: false,
  });
  });

  it("normalisiert heute anhand des StoryContext", async () => {
  vi.mocked(askAI).mockResolvedValue({
    entities: [
      {
        id: "anna",
        name: "Anna",
        type: "person",
      },
      {
        id: "munich",
        name: "Munich",
        type: "place",
      },
    ],
    facts: [
      {
        subject: "anna",
        predicate: "located_in",
        object: "munich",
        temporal: {
          text: "heute",
        },
      },
    ],
  });

  const result = await extractFacts(
    "Anna ist heute in München.",
    {
      referenceDate: "2026-08-14",
    }
  );

  expect(result.facts).toContainEqual({
    subject: "anna",
    predicate: "located_in",
    object: "munich",
    temporal: {
      text: "heute",
      from: "2026-08-14",
      to: "2026-08-14",
      source: "anchor",
      anchor: "2026-08-14",
      advancesTimeline: false,
    },
  });
  });

});
