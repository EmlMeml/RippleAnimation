import { describe, expect, it, vi } from "vitest";
import { extractFacts } from "./../analysis/extractesFacts";
import { checkConsistency } from "../ai/consistencyChecker";
import { askAI } from "../ai/api";

vi.mock("../ai/api", () => ({
  askAI: vi.fn(),
}));

describe("Integration – Fact Extraction + Consistency Check", () => {
  const context = {
    referenceDate: "2026-08-14",
  };

  it("weist Landmarken am Fuß eines Berges nicht als zweiten Standort aus", async () => {
    vi.mocked(askAI).mockResolvedValue({
      entities: [
        { id: "ort_a", name: "Ort A", type: "place" },
        { id: "land_b", name: "Land B", type: "place" },
        { id: "berg_c", name: "Berg C", type: "place" },
      ],
      facts: [
        { subject: "ort_a", predicate: "located_in", object: "land_b" },
      ],
    });

    const extraction = await extractFacts(
      "Ort A liegt in Land B am Fuße des Berges C.",
      context
    );
    const prompt = String(vi.mocked(askAI).mock.calls.at(-1)?.[0] ?? "");

    expect(prompt).toContain("CONTAINMENT VS. LANDMARKS AND PROXIMITY");
    expect(prompt).toContain("Do NOT return ort_a located_in berg_c");
    expect(extraction.entities).toHaveLength(3);
    expect(extraction.facts).toEqual([
      expect.objectContaining({
        subject: "ort_a",
        predicate: "located_in",
        object: "land_b",
      }),
    ]);
    expect(checkConsistency(extraction)).toEqual([]);
  });

  it("erkennt einen zeitlichen Widerspruch nach der Fact-Extraktion", async () => {
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
        {
          id: "hamburg",
          name: "Hamburg",
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
        {
          subject: "anna",
          predicate: "lives_in",
          object: "hamburg",
          temporal: {
            text: "heute",
          },
        },
      ],
    });

    const extraction = await extractFacts(
      "Anna lebt heute in München, aber heute lebt sie in Hamburg.",
      context
    );

    const inconsistencies =
      checkConsistency(extraction);

    expect(extraction.facts).toHaveLength(2);

    expect(inconsistencies).toHaveLength(1);

    expect(inconsistencies[0]).toMatchObject({
      type: "conflicting_fact",
      subject: "anna",
      predicate: "lives_in",
    });
  });

  it("akzeptiert widersprüchliche Aussagen, wenn sie zeitlich getrennt sind", async () => {
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
        {
          id: "hamburg",
          name: "Hamburg",
          type: "place",
        },
      ],
      facts: [
        {
          subject: "anna",
          predicate: "lives_in",
          object: "munich",
          temporal: {
            text: "gestern",
          },
        },
        {
          subject: "anna",
          predicate: "lives_in",
          object: "hamburg",
          temporal: {
            text: "heute",
          },
        },
      ],
    });

    const extraction = await extractFacts(
      "Anna lebte gestern in München. Heute lebt sie in Hamburg.",
      context
    );

    const inconsistencies =
      checkConsistency(extraction);

    expect(extraction.facts).toHaveLength(2);

    expect(inconsistencies).toHaveLength(0);
  });

  it("normalisiert Zeitangaben und verwendet sie anschließend im Consistency Check", async () => {
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

    const extraction = await extractFacts(
      "Anna ist heute in München und morgen in Berlin.",
      context
    );

    expect(extraction.facts[0].temporal).toMatchObject({
      text: "heute",
      from: "2026-08-14",
      to: "2026-08-14",
      source: "anchor",
      anchor: "2026-08-14",
      advancesTimeline: false,
    });

    expect(extraction.facts[1].temporal).toMatchObject({
      text: "morgen",
      from: "2026-08-15",
      to: "2026-08-15",
      source: "anchor",
      anchor: "2026-08-14",
      advancesTimeline: false,
    });

    const inconsistencies =
      checkConsistency(extraction);

    expect(inconsistencies).toHaveLength(0);
  });

  it("erkennt einen echten Widerspruch trotz unterschiedlicher sprachlicher Zeitangaben", async () => {
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
        {
          id: "hamburg",
          name: "Hamburg",
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
        {
          subject: "anna",
          predicate: "lives_in",
          object: "hamburg",
          temporal: {
            text: "Today",
          },
        },
      ],
    });

    const extraction = await extractFacts(
      "Anna lebt heute in München. Today lebt sie in Hamburg.",
      context
    );

    const inconsistencies =
      checkConsistency(extraction);

    expect(extraction.facts).toHaveLength(2);

    expect(
      extraction.facts[0].temporal?.from
    ).toBe("2026-08-14");

    expect(
      extraction.facts[1].temporal?.from
    ).toBe("2026-08-14");

    expect(inconsistencies).toHaveLength(1);
  });

  it("erkennt keinen Konflikt bei hierarchisch kompatiblen Orten", async () => {
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
        {
          id: "bavaria",
          name: "Bavaria",
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
          subject: "munich",
          predicate: "located_in",
          object: "bavaria",
          temporal: {
            text: "heute",
          },
        },
        {
          subject: "anna",
          predicate: "located_in",
          object: "bavaria",
          temporal: {
            text: "heute",
          },
        },
      ],
    });

    const extraction = await extractFacts(
      "Anna ist heute in München und München liegt heute in Bayern. Anna ist heute in Bayern.",
      context
    );

    const inconsistencies =
      checkConsistency(extraction);

    expect(inconsistencies).toHaveLength(0);
  });

  it("akzeptiert einen normalen konsistenten Story-Abschnitt", async () => {
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
          predicate: "occupation",
          value: "writer",
        },
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

    const extraction = await extractFacts(
      "Anna ist Schriftstellerin und lebt heute in München.",
      context
    );

    const inconsistencies =
      checkConsistency(extraction);

    expect(extraction.facts).toHaveLength(2);
    expect(inconsistencies).toHaveLength(0);
  });
});
