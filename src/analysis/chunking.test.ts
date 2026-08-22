import { describe, expect, it } from "vitest";
import { splitTextIntoChunks } from "./extractesFacts";

describe("splitTextIntoChunks", () => {
  it("behält kurze Texte in einem Chunk", () => {
    expect(splitTextIntoChunks("Anna lebt in München.", 10)).toEqual([
      "Anna lebt in München.",
    ]);
  });

  it("teilt lange Texte an Satzgrenzen", () => {
    const text = [
      "Anna lebt in München.",
      "Thomas lebt in Berlin.",
      "Clara lebt in Hamburg.",
    ].join(" ");

    expect(splitTextIntoChunks(text, 5)).toEqual([
      "Anna lebt in München.",
      "Thomas lebt in Berlin.",
      "Clara lebt in Hamburg.",
    ]);
  });

  it("begrenzt auch einen einzelnen sehr langen Satz", () => {
    expect(splitTextIntoChunks("eins zwei drei vier fünf sechs", 3)).toEqual([
      "eins zwei drei",
      "vier fünf sechs",
    ]);
  });
});
