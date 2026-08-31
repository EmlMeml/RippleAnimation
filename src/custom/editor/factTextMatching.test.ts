import { describe, expect, it } from "vitest";
import { factValueAppearsInText, getFactValuePattern } from "./factTextMatching";

describe("fact text matching", () => {
  it("matches a numeric age written with digits", () => {
    expect("Alice is 32 years old.".match(getFactValuePattern(32)!)).toEqual(["32"]);
  });

  it("matches a numeric age written as hyphenated English words", () => {
    expect("At thirty-two, Alice returned.".match(getFactValuePattern(32)!)).toEqual(["thirty-two"]);
  });

  it("matches the same number written with a space", () => {
    expect(factValueAppearsInText("Alice was thirty two.", 32)).toBe(true);
  });

  it("does not confuse a numeric value with another number", () => {
    expect(factValueAppearsInText("Alice was twenty-nine.", 32)).toBe(false);
  });
});
