const ONES = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
  "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
  "seventeen", "eighteen", "nineteen",
] as const;

const TENS = [
  "", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety",
] as const;

function integerToEnglishWords(value: number): string | null {
  if (!Number.isSafeInteger(value) || value < 0 || value > 9999) return null;
  if (value < 20) return ONES[value];
  if (value < 100) {
    const remainder = value % 10;
    return `${TENS[Math.floor(value / 10)]}${remainder ? `-${ONES[remainder]}` : ""}`;
  }
  if (value < 1000) {
    const remainder = value % 100;
    return `${ONES[Math.floor(value / 100)]} hundred${remainder ? ` ${integerToEnglishWords(remainder)}` : ""}`;
  }
  const remainder = value % 1000;
  return `${ONES[Math.floor(value / 1000)]} thousand${remainder ? ` ${integerToEnglishWords(remainder)}` : ""}`;
}

export function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Matches a fact value as written, including English words for numeric values. */
export function getFactValuePattern(value: unknown): RegExp | null {
  if (value === undefined || value === null || value === "") return null;

  const literal = String(value).trim()
    .split(/\s+/)
    .map(escapeForRegExp)
    .join("(?:\\s+|[-–—]\\s*)");
  const alternatives = [literal];

  if (typeof value === "number") {
    const words = integerToEnglishWords(value);
    if (words) {
      alternatives.push(words.split(/[\s-]+/).map(escapeForRegExp).join("(?:\\s+|[-–—]\\s*)"));
    }
  }

  return new RegExp(`\\b(?:${alternatives.join("|")})\\b`, "gi");
}

export function factValueAppearsInText(text: string, value: unknown): boolean {
  const pattern = getFactValuePattern(value);
  return pattern === null || pattern.test(text);
}
