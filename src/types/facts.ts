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

export interface Fact {
  subject: string;
  predicate: Predicate;

  // Used for attributes such as:
  // Anna -> age -> 27
  value?: string | number | boolean | null;

  // Used for relations such as:
  // Thomas -> younger_than -> Anna
  object?: string | null;

  source?: {
    start: number;
    end: number;
  };
}

export interface FactExtraction {
  entities: Entity[];
  facts: Fact[];
}