import type {
  TemporalContext,
} from "../types/facts";

import type {
  StoryContext,
} from "../types/story";

export function normalizeTemporal(
  temporal: TemporalContext | undefined,
  context: StoryContext,
  currentDate: string
): TemporalContext | undefined {

  /*
   * --------------------------------
   * Kein temporaler Ausdruck
   * --------------------------------
   *
   * Der Fact gehört zum aktuellen
   * Story-Zeitpunkt.
   *
   * Dieser Fall verschiebt die Timeline NICHT.
   */
  if (!temporal?.text) {
    return {
      ...temporal,
      from: currentDate,
      to: currentDate,
      source: "implicit",
      anchor: currentDate,
      advancesTimeline: false,
    };
  }

  const text = temporal.text
    .trim()
    .toLowerCase();

  /*
   * --------------------------------
   * Fester Story-Anker
   * --------------------------------
   *
   * Beispiel:
   *
   * context.referenceDate
   * = 2026-08-14
   */
  const referenceDate = new Date(
    `${context.referenceDate}T00:00:00Z`
  );

  /*
   * --------------------------------
   * Aktueller Story-Zeitpunkt
   * --------------------------------
   *
   * Dieser kann sich durch relative
   * Ausdrücke wie "two years later"
   * verändern.
   */
  const currentStoryDate = new Date(
    `${currentDate}T00:00:00Z`
  );

  function formatDate(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  /*
   * --------------------------------
   * Berechnung relativ zum aktuellen
   * Story-Zeitpunkt
   * --------------------------------
   */

  function addDaysFromCurrent(
    days: number
  ): string {
    const date = new Date(
      currentStoryDate
    );

    date.setUTCDate(
      date.getUTCDate() + days
    );

    return formatDate(date);
  }

  function addMonthsFromCurrent(
    months: number
  ): string {
    const date = new Date(
      currentStoryDate
    );

    date.setUTCMonth(
      date.getUTCMonth() + months
    );

    return formatDate(date);
  }

  function addYearsFromCurrent(
    years: number
  ): string {
    const date = new Date(
      currentStoryDate
    );

    date.setUTCFullYear(
      date.getUTCFullYear() + years
    );

    return formatDate(date);
  }

  /*
   * --------------------------------
   * Berechnung relativ zum festen
   * Story-Anker
   * --------------------------------
   */

  function addDaysFromAnchor(
    days: number
  ): string {
    const date = new Date(
      referenceDate
    );

    date.setUTCDate(
      date.getUTCDate() + days
    );

    return formatDate(date);
  }

  /*
   * --------------------------------
   * TODAY / HEUTE
   * --------------------------------
   *
   * Bezieht sich IMMER auf den festen
   * Story-Anker.
   *
   * Beispiel:
   *
   * currentDate = 2028-08-14
   * "Today"
   *
   * => 2026-08-14
   *
   * Wichtig:
   * Die Timeline wird NICHT zurückgesetzt.
   */
  if (
    text === "heute" ||
    text === "today"
  ) {
    return {
      ...temporal,
      from: context.referenceDate,
      to: context.referenceDate,
      source: "anchor",
      anchor: context.referenceDate,
      advancesTimeline: false,
    };
  }

  /*
   * --------------------------------
   * TOMORROW / MORGEN
   * --------------------------------
   *
   * Ebenfalls relativ zum festen
   * Story-Anker.
   *
   * NICHT zum currentDate.
   */
  if (
    text === "morgen" ||
    text === "tomorrow"
  ) {
    const date =
      addDaysFromAnchor(1);

    return {
      ...temporal,
      from: date,
      to: date,
      source: "anchor",
      anchor: context.referenceDate,
      advancesTimeline: false,
    };
  }

  /*
   * --------------------------------
   * YESTERDAY / GESTERN
   * --------------------------------
   */
  if (
    text === "gestern" ||
    text === "yesterday"
  ) {
    const date =
      addDaysFromAnchor(-1);

    return {
      ...temporal,
      from: date,
      to: date,
      source: "anchor",
      anchor: context.referenceDate,
      advancesTimeline: false,
    };
  }

  /*
   * --------------------------------
   * X DAYS LATER
   * --------------------------------
   *
   * Diese Ausdrücke beziehen sich
   * auf currentDate.
   *
   * Sie verschieben die Timeline.
   */
  const daysLaterMatch = text.match(
    /^(\d+)\s+days?\s+later$/
  );

  if (daysLaterMatch) {
    const days = Number(
      daysLaterMatch[1]
    );

    const date =
      addDaysFromCurrent(days);

    return {
      ...temporal,
      from: date,
      to: date,
      source: "relative",
      anchor: currentDate,
      advancesTimeline: true,
    };
  }

  /*
   * --------------------------------
   * X WEEKS LATER
   * --------------------------------
   */
  const weeksLaterMatch = text.match(
    /^(\d+)\s+weeks?\s+later$/
  );

  if (weeksLaterMatch) {
    const weeks = Number(
      weeksLaterMatch[1]
    );

    const date =
      addDaysFromCurrent(
        weeks * 7
      );

    return {
      ...temporal,
      from: date,
      to: date,
      source: "relative",
      anchor: currentDate,
      advancesTimeline: true,
    };
  }

  /*
   * --------------------------------
   * X MONTHS LATER
   * --------------------------------
   */
  const monthsLaterMatch = text.match(
    /^(\d+)\s+months?\s+later$/
  );

  if (monthsLaterMatch) {
    const months = Number(
      monthsLaterMatch[1]
    );

    const date =
      addMonthsFromCurrent(months);

    return {
      ...temporal,
      from: date,
      to: date,
      source: "relative",
      anchor: currentDate,
      advancesTimeline: true,
    };
  }

  /*
   * --------------------------------
   * X YEARS LATER
   * --------------------------------
   */

  const numberWords: Record<
    string,
    number
  > = {
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
    const rawNumber =
      yearsLaterMatch[1];

    const years =
      numberWords[rawNumber] ??
      Number(rawNumber);

    const date =
      addYearsFromCurrent(years);

    return {
      ...temporal,
      from: date,
      to: date,
      source: "relative",
      anchor: currentDate,
      advancesTimeline: true,
    };
  }

  /*
   * --------------------------------
   * UNBEKANNTER TEMPORALER AUSDRUCK
   * --------------------------------
   *
   * Wir kennen die Semantik noch nicht.
   *
   * Deshalb:
   *
   * - nichts berechnen
   * - currentDate NICHT verändern
   * - nicht fälschlicherweise als
   *   Timeline-Anker behandeln
   */
  return {
    ...temporal,
    source: "unknown",
    anchor: currentDate,
    advancesTimeline: false,
  };
}