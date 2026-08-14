import { describe, expect, it, vi } from "vitest";
import { extractFacts } from "./extractesFacts";
import { askAI } from "./../ai/api";

vi.mock("./../ai/api", () => ({
  askAI: vi.fn(),
}));

describe("extractFacts", () => {
  const context = {
    referenceDate: "2026-08-14",
  };
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

  expect(result.facts).toContainEqual(
    expect.objectContaining({
      subject: "anna",
      predicate: "located_in",
      object: "munich",
      temporal: {
        text: "heute",
      },
    })
  );

  expect(result.facts).toContainEqual(
    expect.objectContaining({
      subject: "anna",
      predicate: "located_in",
      object: "berlin",
      temporal: {
        text: "morgen",
      },
    })
  );
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
  });
  });

});