import { describe, expect, it } from "vitest";
import type { Fact } from "../types/facts";
import { temporalRangesOverlap } from "./temporalOverlap";

describe("temporalRangesOverlap", () => {
  it("erkennt denselben Zeitpunkt als Überschneidung", () => {
    const a: Fact = {
      subject: "anna",
      predicate: "located_in",
      object: "munich",
      temporal: {
        text: "heute",
        from: "2026-08-14",
        to: "2026-08-14",
      },
    };

    const b: Fact = {
      subject: "anna",
      predicate: "located_in",
      object: "berlin",
      temporal: {
        text: "heute",
        from: "2026-08-14",
        to: "2026-08-14",
      },
    };

    expect(temporalRangesOverlap(a, b)).toBe(true);
  });

  it("erkennt unterschiedliche Zeitpunkte als nicht überlappend", () => {
    const a: Fact = {
      subject: "anna",
      predicate: "located_in",
      object: "munich",
      temporal: {
        text: "heute",
        from: "2026-08-14",
        to: "2026-08-14",
      },
    };

    const b: Fact = {
      subject: "anna",
      predicate: "located_in",
      object: "berlin",
      temporal: {
        text: "morgen",
        from: "2026-08-15",
        to: "2026-08-15",
      },
    };

    expect(temporalRangesOverlap(a, b)).toBe(false);
  });

  it("erkennt überlappende Zeiträume", () => {
    const a: Fact = {
      subject: "anna",
      predicate: "works_at",
      object: "firma_a",
      temporal: {
        text: "14. bis 20. August",
        from: "2026-08-14",
        to: "2026-08-20",
      },
    };

    const b: Fact = {
      subject: "anna",
      predicate: "works_at",
      object: "firma_b",
      temporal: {
        text: "18. bis 25. August",
        from: "2026-08-18",
        to: "2026-08-25",
      },
    };

    expect(temporalRangesOverlap(a, b)).toBe(true);
  });

  it("erkennt direkt angrenzende Zeiträume als nicht überlappend", () => {
    const a: Fact = {
      subject: "anna",
      predicate: "works_at",
      object: "firma_a",
      temporal: {
        text: "14. bis 20. August",
        from: "2026-08-14",
        to: "2026-08-20",
      },
    };

    const b: Fact = {
      subject: "anna",
      predicate: "works_at",
      object: "firma_b",
      temporal: {
        text: "21. bis 25. August",
        from: "2026-08-21",
        to: "2026-08-25",
      },
    };

    expect(temporalRangesOverlap(a, b)).toBe(false);
  });

  it("behandelt fehlenden zeitlichen Kontext als überschneidend", () => {
    const a: Fact = {
      subject: "anna",
      predicate: "lives_in",
      object: "munich",
    };

    const b: Fact = {
      subject: "anna",
      predicate: "lives_in",
      object: "berlin",
      temporal: {
        text: "morgen",
        from: "2026-08-15",
        to: "2026-08-15",
      },
    };

    expect(temporalRangesOverlap(a, b)).toBe(true);
  });

  it("behandelt zwei Fakten ohne zeitlichen Kontext als überschneidend", () => {
    const a: Fact = {
      subject: "anna",
      predicate: "lives_in",
      object: "munich",
    };

    const b: Fact = {
      subject: "anna",
      predicate: "lives_in",
      object: "berlin",
    };

    expect(temporalRangesOverlap(a, b)).toBe(true);
  });
});