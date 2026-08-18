import { describe, expect, it } from "vitest";
import type { Fact, FactExtraction,Predicate } from "../types/facts";
import { checkConsistency } from "./../ai/consistencyChecker";

describe("checkConsistency – Creative Writing Edge Cases", () => {
  const anchor = "2026-08-14";

  const temporal = (
    from: string,
    to: string = from,
    source: "anchor" | "implicit" = "anchor",
    text?: string
  ) => ({
    ...(text ? { text } : {}),
    from,
    to,
    source,
    anchor,
    advancesTimeline: false,
  });

  const fact = (
    subject: string,
    predicate: Predicate,
    object: string,
    time?: ReturnType<typeof temporal>
  ): Fact => ({
    subject,
    predicate,
    object,
    ...(time ? { temporal: time } : {}),
  });

  const extraction = (...facts: Fact[]): FactExtraction => ({
    entities: [],
    facts,
  });

  // ---------------------------------------------------------
  // 1. Echte zeitgleiche Widersprüche
  // ---------------------------------------------------------

  it("erkennt zwei widersprüchliche Werte am selben Tag", () => {
    const result = checkConsistency(
      extraction(
        fact(
          "anna",
          "lives_in",
          "munich",
          temporal("2026-08-14")
        ),
        fact(
          "anna",
          "lives_in",
          "hamburg",
          temporal("2026-08-14")
        )
      )
    );

    expect(result).toHaveLength(1);
  });

  it("erkennt widersprüchliche Werte bei überlappenden Zeiträumen", () => {
    const result = checkConsistency(
      extraction(
        fact(
          "anna",
          "lives_in",
          "munich",
          temporal("2026-08-10", "2026-08-20")
        ),
        fact(
          "anna",
          "lives_in",
          "hamburg",
          temporal("2026-08-15", "2026-08-25")
        )
      )
    );

    expect(result).toHaveLength(1);
  });

  // ---------------------------------------------------------
  // 2. Zeitlich getrennte Aussagen sind kein Widerspruch
  // ---------------------------------------------------------

  it("akzeptiert unterschiedliche Werte in vollständig getrennten Zeiträumen", () => {
    const result = checkConsistency(
      extraction(
        fact(
          "anna",
          "lives_in",
          "munich",
          temporal("2026-01-01", "2026-06-30")
        ),
        fact(
          "anna",
          "lives_in",
          "hamburg",
          temporal("2026-07-01", "2026-12-31")
        )
      )
    );

    expect(result).toHaveLength(0);
  });

  it("akzeptiert einen Umzug ohne zeitliche Überschneidung", () => {
    const result = checkConsistency(
      extraction(
        fact(
          "anna",
          "lives_in",
          "munich",
          temporal("2026-01-01", "2026-08-14")
        ),
        fact(
          "anna",
          "lives_in",
          "hamburg",
          temporal("2026-08-15", "2026-12-31")
        )
      )
    );

    expect(result).toHaveLength(0);
  });

  // ---------------------------------------------------------
  // 3. Identische Facts
  // ---------------------------------------------------------

  it("ignoriert identische Facts", () => {
    const result = checkConsistency(
      extraction(
        fact(
          "anna",
          "lives_in",
          "munich",
          temporal("2026-08-14")
        ),
        fact(
          "anna",
          "lives_in",
          "munich",
          temporal("2026-08-14")
        )
      )
    );

    expect(result).toHaveLength(0);
  });

  it("ignoriert mehrfach wiederholte identische Facts", () => {
    const result = checkConsistency(
      extraction(
        fact(
          "anna",
          "occupation",
          "writer",
          temporal("2026-08-14")
        ),
        fact(
          "anna",
          "occupation",
          "writer",
          temporal("2026-08-14")
        ),
        fact(
          "anna",
          "occupation",
          "writer",
          temporal("2026-08-14")
        )
      )
    );

    expect(result).toHaveLength(0);
  });

  // ---------------------------------------------------------
  // 4. Fehlender zeitlicher Kontext
  // ---------------------------------------------------------

  it("behandelt einen Fact ohne Zeitbereich als potenziell überlappend", () => {
    const result = checkConsistency(
      extraction(
        fact(
          "anna",
          "lives_in",
          "munich"
        ),
        fact(
          "anna",
          "lives_in",
          "hamburg",
          temporal("2026-08-14")
        )
      )
    );

    expect(result).toHaveLength(1);
  });

  it("behandelt zwei zeitlose widersprüchliche Facts als Konflikt", () => {
    const result = checkConsistency(
      extraction(
        fact("anna", "lives_in", "munich"),
        fact("anna", "lives_in", "hamburg")
      )
    );

    expect(result).toHaveLength(1);
  });

  // ---------------------------------------------------------
  // 5. Implizite Zeit vs. expliziter Anchor
  // ---------------------------------------------------------

it("erkennt Widerspruch zwischen impliziter Gegenwart und explizitem Anchor", () => {
  const result = checkConsistency(
    extraction(
      fact(
        "anna",
        "lives_in",
        "munich",
        temporal(
          "2026-08-14",
          "2026-08-14",
          "implicit"
        )
      ),
      fact(
        "anna",
        "lives_in",
        "hamburg",
        temporal(
          "2026-08-14",
          "2026-08-14",
          "anchor",
          "Today"
        )
      )
    )
  );

  expect(result).toHaveLength(1);
});
  // ---------------------------------------------------------
  // 6. Explizite zeitgleiche Aussagen bleiben Konflikte
  // ---------------------------------------------------------

  it("erkennt zwei explizite Anchor-Aussagen als Konflikt", () => {
    const result = checkConsistency(
      extraction(
        fact(
          "anna",
          "lives_in",
          "munich",
          temporal(
            "2026-08-14",
            "2026-08-14",
            "anchor",
            "Today"
          )
        ),
        fact(
          "anna",
          "lives_in",
          "hamburg",
          temporal(
            "2026-08-14",
            "2026-08-14",
            "anchor",
            "Today"
          )
        )
      )
    );

    expect(result).toHaveLength(1);
  });

  // ---------------------------------------------------------
  // 7. Teilweise überlappende Zeiträume
  // ---------------------------------------------------------

  it("erkennt einen Konflikt bei teilweise überlappenden Zeiträumen", () => {
    const result = checkConsistency(
      extraction(
        fact(
          "anna",
          "lives_in",
          "munich",
          temporal("2026-08-01", "2026-08-20")
        ),
        fact(
          "anna",
          "lives_in",
          "hamburg",
          temporal("2026-08-20", "2026-09-01")
        )
      )
    );

    expect(result).toHaveLength(1);
  });

  it("akzeptiert direkt angrenzende Zeiträume ohne Überschneidung", () => {
    const result = checkConsistency(
      extraction(
        fact(
          "anna",
          "lives_in",
          "munich",
          temporal("2026-01-01", "2026-08-14")
        ),
        fact(
          "anna",
          "lives_in",
          "hamburg",
          temporal("2026-08-15", "2026-12-31")
        )
      )
    );

    expect(result).toHaveLength(0);
  });

  // ---------------------------------------------------------
  // 8. Andere exklusive Eigenschaften
  // ---------------------------------------------------------

  it("erkennt widersprüchliche Berufe", () => {
    const result = checkConsistency(
      extraction(
        fact(
          "anna",
          "occupation",
          "writer",
          temporal("2026-08-14")
        ),
        fact(
          "anna",
          "occupation",
          "doctor",
          temporal("2026-08-14")
        )
      )
    );

    expect(result).toHaveLength(1);
  });

  it("erkennt widersprüchliche Eigenschaften nicht über verschiedene Subjekte hinweg", () => {
    const result = checkConsistency(
      extraction(
        fact(
          "anna",
          "occupation",
          "writer",
          temporal("2026-08-14")
        ),
        fact(
          "bob",
          "occupation",
          "doctor",
          temporal("2026-08-14")
        )
      )
    );

    expect(result).toHaveLength(0);
  });

  // ---------------------------------------------------------
  // 9. Nicht-exklusive Fakten
  // ---------------------------------------------------------

  it("behandelt mehrere kompatible nicht-exklusive Aussagen nicht als Konflikt", () => {
    const result = checkConsistency(
      extraction(
        fact(
          "anna",
          "friend_of",
          "Max",
          temporal("2026-08-14")
        ),
        fact(
          "anna",
          "friend_of",
          "Lisa",
          temporal("2026-08-14")
        )
      )
    );

    expect(result).toHaveLength(0);
  });

  // ---------------------------------------------------------
  // 10. Mehrere Konflikte
  // ---------------------------------------------------------

  it("erkennt mehrere unabhängige Konflikte", () => {
    const result = checkConsistency(
      extraction(
        fact(
          "anna",
          "lives_in",
          "munich",
          temporal("2026-08-14")
        ),
        fact(
          "anna",
          "lives_in",
          "hamburg",
          temporal("2026-08-14")
        ),
        fact(
          "anna",
          "occupation",
          "writer",
          temporal("2026-08-14")
        ),
        fact(
          "anna",
          "occupation",
          "doctor",
          temporal("2026-08-14")
        )
      )
    );

    expect(result).toHaveLength(2);
  });

  // ---------------------------------------------------------
  // 11. Unterschiedliche Zeitpunkte desselben exklusiven Werts
  // ---------------------------------------------------------

  it("erlaubt denselben exklusiven Wert zu unterschiedlichen Zeitpunkten", () => {
    const result = checkConsistency(
      extraction(
        fact(
          "anna",
          "occupation",
          "writer",
          temporal("2026-01-01")
        ),
        fact(
          "anna",
          "occupation",
          "doctor",
          temporal("2026-02-01")
        ),
        fact(
          "anna",
          "occupation",
          "writer",
          temporal("2026-03-01")
        )
      )
    );

    expect(result).toHaveLength(0);
  });

  // ---------------------------------------------------------
  // 12. Hierarchische Orte
  // ---------------------------------------------------------

  it("behandelt hierarchisch kompatible Orte nicht als Widerspruch", () => {
    const result = checkConsistency(
      extraction(
        fact(
          "anna",
          "located_in",
          "munich",
          temporal("2026-08-14")
        ),
        fact(
          "anna",
          "located_in",
          "bavaria",
          temporal("2026-08-14")
        ),
         // Hierarchische Beziehung:
        // München liegt in Bayern.
        fact(
            "munich",
            "located_in",
            "bavaria",
            temporal("2026-08-14")
        )
      )
    );

    expect(result).toHaveLength(0);
  });

  it("erkennt unterschiedliche inkompatible Orte als Konflikt", () => {
    const result = checkConsistency(
      extraction(
        fact(
          "anna",
          "located_in",
          "munich",
          temporal("2026-08-14")
        ),
        fact(
          "anna",
          "located_in",
          "hamburg",
          temporal("2026-08-14")
        )
      )
    );

    expect(result).toHaveLength(1);
  });

  // ---------------------------------------------------------
  // 13. Leere Extraction
  // ---------------------------------------------------------

  it("liefert bei keinen Facts keine Inkonsistenzen", () => {
    const result = checkConsistency({
      entities: [],
      facts: [],
    });

    expect(result).toEqual([]);
  });

  // ---------------------------------------------------------
  // 14. Realistischer Creative-Writing-Fall:
  //     Person zieht um
  // ---------------------------------------------------------

  it("erkennt einen plausiblen Umzug als konsistent", () => {
    const result = checkConsistency(
      extraction(
        fact(
          "anna",
          "lives_in",
          "munich",
          temporal("2025-01-01", "2026-08-14")
        ),
        fact(
          "anna",
          "lives_in",
          "hamburg",
          temporal("2026-08-15", "2027-01-01")
        )
      )
    );

    expect(result).toHaveLength(0);
  });

  // ---------------------------------------------------------
  // 15. Realistischer Creative-Writing-Fall:
  //     versehentliche Kontinuitätsverletzung
  // ---------------------------------------------------------

  it("erkennt einen unmöglichen gleichzeitigen Wohnortwechsel", () => {
    const result = checkConsistency(
      extraction(
        fact(
          "anna",
          "lives_in",
          "munich",
          temporal("2026-08-01", "2026-08-31")
        ),
        fact(
          "anna",
          "lives_in",
          "hamburg",
          temporal("2026-08-15", "2026-09-15")
        )
      )
    );

    expect(result).toHaveLength(1);
  });
});