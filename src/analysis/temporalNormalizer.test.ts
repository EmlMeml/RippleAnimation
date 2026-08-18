import { describe, expect, it } from "vitest";
import {
  normalizeTemporal,
} from "./temporalNormalizer";

describe("normalizeTemporal", () => {
  const context = {
    referenceDate: "2026-08-14",
  };

  let currentDate = context.referenceDate;

  it("normalisiert heute", () => {
    const result = normalizeTemporal(
      { text: "heute" },
      context,
      currentDate
    );

    expect(result).toEqual({
      text: "heute",
      from: "2026-08-14",
      to: "2026-08-14",
      source: "anchor",
      anchor: "2026-08-14",
      advancesTimeline: false,
    });
  });

  it("normalisiert morgen", () => {
    const result = normalizeTemporal(
      { text: "morgen" },
      context,
      currentDate
    );

    expect(result).toEqual({
      text: "morgen",
      from: "2026-08-15",
      to: "2026-08-15",
      source: "anchor",
      anchor: "2026-08-14",
      advancesTimeline: false,
    });
  });

  it("normalisiert gestern", () => {
    const result = normalizeTemporal(
      { text: "gestern" },
      context,
      currentDate
    );

    expect(result).toEqual({
      text: "gestern",
      from: "2026-08-13",
      to: "2026-08-13",
      source: "anchor",
      anchor: "2026-08-14",
      advancesTimeline: false,
    });
  });

  it("markiert unbekannte Zeitangaben als unknown", () => {
    const result = normalizeTemporal(
      { text: "früher" },
      context,
      currentDate
    );

    expect(result).toEqual({
      text: "früher",
      source: "unknown",
      anchor: "2026-08-14",
      advancesTimeline: false,
    });
  });

  it("normalisiert fehlenden zeitlichen Kontext als implicit", () => {
    const result = normalizeTemporal(
      undefined,
      context,
      currentDate
    );

    expect(result).toEqual({
      from: "2026-08-14",
      to: "2026-08-14",
      source: "implicit",
      anchor: "2026-08-14",
      advancesTimeline: false,
    });
  });
});