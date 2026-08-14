import type { StoryContext } from "./../types/story";

export interface TemporalContext {
  text?: string;
  from?: string;
  to?: string;
}

export function normalizeTemporal(
  temporal: TemporalContext | undefined,
  context: StoryContext
): TemporalContext | undefined {
  if (!temporal?.text) {
    return temporal;
  }

  const text = temporal.text.trim().toLowerCase();

  const referenceDate = new Date(
    `${context.referenceDate}T00:00:00Z`
  );

  if (text === "heute") {
    return {
      ...temporal,
      from: context.referenceDate,
      to: context.referenceDate,
    };
  }

  if (text === "morgen") {
    const date = new Date(referenceDate);
    date.setUTCDate(date.getUTCDate() + 1);

    const normalizedDate = date
      .toISOString()
      .slice(0, 10);

    return {
      ...temporal,
      from: normalizedDate,
      to: normalizedDate,
    };
  }

  if (text === "gestern") {
    const date = new Date(referenceDate);
    date.setUTCDate(date.getUTCDate() - 1);

    const normalizedDate = date
      .toISOString()
      .slice(0, 10);

    return {
      ...temporal,
      from: normalizedDate,
      to: normalizedDate,
    };
  }

  return temporal;
}