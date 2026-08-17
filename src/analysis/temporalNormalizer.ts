import type { StoryContext } from "../types/story";

export interface TemporalContext {
  text?: string;
  from?: string;
  to?: string;
}

export function normalizeTemporal(
  temporal: TemporalContext | undefined,
  context: StoryContext,
  baseDate: string
): TemporalContext | undefined {
  if (!temporal?.text) {
    return {
      from: baseDate,
      to: baseDate,
    };
  }

  const text = temporal.text.trim().toLowerCase();

  const referenceDate = new Date(
    `${baseDate}T00:00:00Z`
  );

  function formatDate(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  function addDays(days: number): string {
    const date = new Date(referenceDate);
    date.setUTCDate(date.getUTCDate() + days);
    return formatDate(date);
  }

  function addMonths(months: number): string {
    const date = new Date(referenceDate);
    date.setUTCMonth(date.getUTCMonth() + months);
    return formatDate(date);
  }

  function addYears(years: number): string {
    const date = new Date(referenceDate);
    date.setUTCFullYear(date.getUTCFullYear() + years);
    return formatDate(date);
  }

  // --------------------------------
  // Einzelne relative Tage
  // --------------------------------

  if (text === "heute" || text === "today") {
    return {
      ...temporal,
      from: baseDate,
      to: baseDate,
    };
  }

  if (text === "morgen" || text === "tomorrow") {
    const date = addDays(1);

    return {
      ...temporal,
      from: date,
      to: date,
    };
  }

  if (text === "gestern" || text === "yesterday") {
    const date = addDays(-1);

    return {
      ...temporal,
      from: date,
      to: date,
    };
  }

  // --------------------------------
  // X days later
  // --------------------------------

  const daysLaterMatch = text.match(
    /^(\d+)\s+days?\s+later$/
  );

  if (daysLaterMatch) {
    const days = Number(daysLaterMatch[1]);
    const date = addDays(days);

    return {
      ...temporal,
      from: date,
      to: date,
    };
  }

  // --------------------------------
  // X weeks later
  // --------------------------------

  const weeksLaterMatch = text.match(
    /^(\d+)\s+weeks?\s+later$/
  );

  if (weeksLaterMatch) {
    const weeks = Number(weeksLaterMatch[1]);
    const date = addDays(weeks * 7);

    return {
      ...temporal,
      from: date,
      to: date,
    };
  }

  // --------------------------------
  // X months later
  // --------------------------------

  const monthsLaterMatch = text.match(
    /^(\d+)\s+months?\s+later$/
  );

  if (monthsLaterMatch) {
    const months = Number(monthsLaterMatch[1]);
    const date = addMonths(months);

    return {
      ...temporal,
      from: date,
      to: date,
    };
  }

  // --------------------------------
  // X years later
  // --------------------------------

    const numberWords: Record<string, number> = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
  };

  const yearsLaterMatch = text.match(
    /^(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+years?\s+later$/
  );

  if (yearsLaterMatch) {
    const rawNumber = yearsLaterMatch[1];

    const years =
      numberWords[rawNumber] ??
      Number(rawNumber);

    const date = addYears(years);

    return {
      ...temporal,
      from: date,
      to: date,
    };
}

  // --------------------------------
  // Unbekannter Ausdruck
  // --------------------------------

  return temporal;
}