export type EntityType =
  | "person"
  | "place"
  | "organization"
  | "object"
  | "event";

export type Predicate =
  | "age"
  | "gender"
  | "born_in"
  | "lives_in"
  | "works_at"
  | "occupation"
  | "sibling_of"
  | "younger_than"
  | "older_than"
  | "parent_of"
  | "child_of"
  | "married_to"
  | "friend_of"
  | "owns"
  | "has"
  | "located_in"
  | "participates_in";

export interface Entity {
  id: string;
  name: string;
  type: EntityType;
}

export type TemporalSource =
  | "anchor"
  | "relative"
  | "explicit"
  | "implicit"
  | "unknown";

export interface TemporalContext {
  /**
   * Originaler zeitlicher Ausdruck aus dem Text.
   *
   * Beispiele:
   * "today"
   * "Two years later"
   * "on August 14, 2026"
   */
  text?: string;

  /**
   * Normalisierter Beginn des Zeitraums.
   *
   * ISO-Format:
   * YYYY-MM-DD
   */
  from?: string;

  /**
   * Normalisiertes Ende des Zeitraums.
   *
   * ISO-Format:
   * YYYY-MM-DD
   */
  to?: string;

  /**
   * Herkunft der zeitlichen Information.
   *
   * explicit:
   *   Eine konkrete Zeit wurde explizit genannt.
   *
   * relative:
   *   Die Zeit bezieht sich auf den aktuellen
   *   Story-Zeitpunkt, z.B. "two years later".
   *
   * anchor:
   *   Die Zeit bezieht sich direkt auf den
   *   Story-Referenzpunkt, z.B. "today".
   */
  source?: TemporalSource;

  /**
   * Datum, von dem diese temporale Angabe
   * berechnet wurde.
   *
   * Beispiel:
   *
   * Story-Anker:
   * 2026-08-14
   *
   * "Two years later":
   * 2028-08-14
   *
   * Dann:
   *
   * anchor: "2026-08-14"
   */
  anchor?: string;
  /*
   * Gibt an, ob dieser temporale Ausdruck
   * den Story-Zeitpunkt für nachfolgende
   * relative Angaben fortschreibt.
   */
  advancesTimeline?: boolean;
}

export interface Fact {
  subject: string;
  predicate: Predicate;

  /**
   * Used for attributes such as:
   *
   * Anna -> age -> 27
   */
  value?: string | number | boolean | null;

  /**
   * Used for relations such as:
   *
   * Thomas -> younger_than -> Anna
   */
  object?: string | null;

  /**
   * Temporal validity of the fact.
   */
  temporal?: TemporalContext;

  /**
   * Position of the fact in the source text.
   *
   * Used to reconstruct the order in which
   * facts appear in the story.
   */
  source?: {
    /** Index des Slate-Absatzes, aus dem der Fact extrahiert wurde. */
    paragraphIndex?: number;
    start?: number;
    end?: number;
  };
}

export interface FactExtraction {
  entities: Entity[];
  facts: Fact[];
}
