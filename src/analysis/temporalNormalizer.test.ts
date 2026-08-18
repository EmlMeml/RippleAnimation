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
    });
  });

  it("lässt unbekannte Zeitangaben unverändert", () => {
    const result = normalizeTemporal(
      { text: "früher" },
      context,
      currentDate
    );

    expect(result).toEqual({
      text: "früher",
    });
  });

  it("lässt fehlenden zeitlichen Kontext unverändert", () => {
    const result = normalizeTemporal(
      undefined,
      context,
      currentDate
    );

    expect(result).toBeUndefined();
  });
});