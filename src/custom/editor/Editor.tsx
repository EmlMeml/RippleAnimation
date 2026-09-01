import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createEditor,
  type BaseRange,
  type DecoratedRange,
  type Descendant,
  Editor,
  Node as SlateNode,
  type NodeEntry,
  Path,
  Range,
  type RangeRef,
  Text,
  Element as SlateElement,
  Transforms,
} from "slate";
import {
  Slate,
  Editable,
  withReact,
  useSlate,
  ReactEditor
} from "slate-react";
import { withHistory } from "slate-history";
import FileUploader from "./FileUploader";
import './../../assets/css/editor.css';
import { extractFacts } from "./../../analysis/extractesFacts";
import type { Fact, FactExtraction, Predicate } from "./../../types/facts";
import { factValueAppearsInText, getFactValuePattern } from "./factTextMatching";
import { getEditorText } from "./getEditorText";
import {
  checkConsistency,
  type Inconsistency,
  type InconsistencyCategory,
  type InconsistencySeverity,
} from './../../ai/consistencyChecker';
import {
  checkCharacterConsistency,
  type CharacterConsistencyCategory,
  type CharacterInconsistency,
} from "../../ai/characterConsistencyChecker";
import EditorNavigation, { type InconsistentPath, type NavigationTextHighlight } from "./EditorNavigation";
import { EXAMPLE_TEXT } from "./exampleText";
import { EXAMPLE_FACTS } from "./exampleFacts";
import { EXAMPLE_CHARACTER_INCONSISTENCIES } from "./exampleCharacterInconsistencies";

import type { StoryContext } from "../../types/story";
import {
  finishInconsistencyWork,
  logStudyEvent,
  startInconsistencyWork,
} from "../../study/logger";

type CustomText = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  inconsistent?: boolean;
  changeId?: string;
  changeType?: "insertion" | "deletion";
  changeAccepted?: boolean;
  confirmedCorrect?: boolean;
};

type TrackedChange = {
  id: string;
  inconsistency: Inconsistency;
  source?: "direct" | "free" | "confirmed";
  confirmedPositionKey?: string;
  replacement: string;
  replacedValues: string[];
  occurrenceCount: number;
  paragraphIndices: number[];
  affectedRangeRefs: RangeRef[];
  accepted?: boolean;
  contexts: Array<{
    before: string;
    original: string;
    replacement: string;
    after: string;
    changed: boolean;
  }>;
};

type SuggestionMode = "replace" | "free";

type CharacterDecision = {
  id: string;
  inconsistency: CharacterInconsistency;
  source: "free" | "confirmed";
  evidenceIndices: number[];
  contexts: Array<{ before: string; original: string; replacement: string; after: string }>;
  beforeBlocks: Array<{ paragraphIndex: number; block: Descendant }>;
};

type LinkElement = {
  type: "link";
  url: string;
  children: CustomText[];
};

type ParagraphElement = {
  type: "paragraph";
  children: Array<CustomText | LinkElement>;
};

type HeadingElement = {
  type: "heading-one";
  children: CustomText[];
};

type MarkFormat = Exclude<keyof CustomText, "text" | "inconsistent">;
type InconsistentTextRange = BaseRange & {
  inconsistent: true;
  freeEditInsertion?: boolean;
  inconsistencyRole: "conflict" | "context" | "sentence";
  inconsistencySeverity?: InconsistencySeverity;
  inconsistencyIds: string[];
  conflictInconsistencyIds: string[];
  previewInconsistencyIds?: string[];
  sentenceInconsistencyIds?: string[];
  replayVersion?: number;
};

type OffscreenInconsistency = {
  index: number;
  severity: InconsistencySeverity;
  emoji: string;
  label: string;
  detail: string;
  edgeOffset: number;
  opacity: number;
  occurrenceCount: number;
  successful: boolean;
};

type OffscreenFactPreview = {
  key: string;
  targetIndex: number;
  direction: "above" | "below";
  emoji: string;
  before: string;
  fact: string;
  after: string;
  distance: number;
};

type FactPreviewConnection = {
  key: string;
  path: string;
};

type AffectedFactPosition = {
  fact: Fact;
  range: BaseRange;
  previewText?: string;
};

type DependentPassage = {
  inconsistencyId: string;
  fact: Fact;
  rangeRef: RangeRef;
  text: string;
};

const stableInconsistencyIds = new WeakMap<Inconsistency, string>();
const stableCharacterInconsistencyIds = new WeakMap<CharacterInconsistency, string>();
let nextStableInconsistencyId = 0;
let nextStableCharacterInconsistencyId = 0;

/*
 * Temporärer Testschalter: Die vollständige KI-Extraktion und der erneute
 * Consistency-Check bleiben implementiert, werden beim Akzeptieren einer
 * Änderung derzeit aber übersprungen. Zum Reaktivieren auf `true` setzen.
 */
const ENABLE_AI_CHANGE_ACCEPT_CHECK = false;
const MIN_STUDY_HOVER_DURATION_MS = 300;

function getStableInconsistencyId(inconsistency: Inconsistency): string {
  const existingId = stableInconsistencyIds.get(inconsistency);
  if (existingId) {
    return existingId;
  }

  const id = `inconsistency-${nextStableInconsistencyId++}`;
  stableInconsistencyIds.set(inconsistency, id);
  return id;
}

function getStableCharacterInconsistencyId(inconsistency: CharacterInconsistency): string {
  const existingId = stableCharacterInconsistencyIds.get(inconsistency);
  if (existingId) return existingId;
  const id = `character-inconsistency-${nextStableCharacterInconsistencyId++}`;
  stableCharacterInconsistencyIds.set(inconsistency, id);
  return id;
}

function characterSeverity(
  confidence: CharacterInconsistency["confidence"]
): InconsistencySeverity {
  return confidence;
}

const INCONSISTENCY_CATEGORY_PRESENTATION: Record<
  InconsistencyCategory,
  { emoji: string; label: string }
> = {
  exclusive_fact: { emoji: "⚡", label: "Conflicting facts" },
  opposing_relation: { emoji: "↔️", label: "Opposing relationship" },
  inverse_relation: { emoji: "🔄", label: "Conflicting inverse relationship" },
  self_relation: { emoji: "🪞", label: "Invalid self-relationship" },
  transitive_cycle: { emoji: "🔁", label: "Transitive cycle" },
  indirect_age_conflict: { emoji: "🕸️", label: "Indirect age conflict" },
  age_value_conflict: { emoji: "🎂", label: "Conflicting age information" },
};

const CHARACTER_CATEGORY_PRESENTATION: Record<CharacterConsistencyCategory, string> = {
  knowledge: "Knowledge",
  belief: "Belief",
  emotion: "Emotion",
  goal: "Goal",
  motivation: "Motivation",
  memory: "Memory",
  relationship: "Relationship",
  values_and_self_image: "Values & self-image",
  fear_and_need: "Fears & needs",
  development: "Character development",
  thought_action_gap: "Thought vs. action",
  point_of_view: "Point of view",
};

const CHARACTER_CATEGORY_EMOJI: Record<CharacterConsistencyCategory, string> = {
  knowledge: "💡",
  belief: "🧭",
  emotion: "❤️",
  goal: "🎯",
  motivation: "🔥",
  memory: "🧠",
  relationship: "🤝",
  values_and_self_image: "🪞",
  fear_and_need: "🛡️",
  development: "🌱",
  thought_action_gap: "⚖️",
  point_of_view: "👁️",
};

const FACT_THEME_PRESENTATION: Record<Predicate, { emoji: string; label: string }> = {
  age: { emoji: "🎂", label: "Age" },
  younger_than: { emoji: "🎂", label: "Age" },
  older_than: { emoji: "🎂", label: "Age" },
  born_in: { emoji: "📍", label: "Location" },
  lives_in: { emoji: "📍", label: "Location" },
  located_in: { emoji: "📍", label: "Location" },
  works_at: { emoji: "💼", label: "Work" },
  occupation: { emoji: "💼", label: "Occupation" },
  gender: { emoji: "👤", label: "Identity" },
  parent_of: { emoji: "👪", label: "Family" },
  child_of: { emoji: "👪", label: "Family" },
  sibling_of: { emoji: "👪", label: "Family" },
  married_to: { emoji: "💍", label: "Partnership" },
  friend_of: { emoji: "🤝", label: "Friendship" },
  owns: { emoji: "📦", label: "Possession" },
  has: { emoji: "📦", label: "Possession" },
  participates_in: { emoji: "🎭", label: "Event" },
};

function getFactThemePresentation(predicate: string) {
  return FACT_THEME_PRESENTATION[predicate as Predicate] ?? {
    emoji: "⚠️",
    label: "General fact",
  };
}

function displayFactValue(value: unknown): string {
  const text = String(value ?? "").replaceAll("_", " ").trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "Unknown";
}

function formatFactStatement(fact: Fact): string {
  const subject = displayFactValue(fact.subject);
  const value = displayFactValue(fact.object ?? fact.value);

  switch (fact.predicate) {
    case "age": return `${subject} is ${value} years old.`;
    case "occupation": return `${subject} is described as ${value}.`;
    case "works_at": return `${subject} works at ${value}.`;
    case "lives_in": return `${subject} lives in ${value}.`;
    case "born_in": return `${subject} was born in ${value}.`;
    case "located_in": return `${subject} is located in ${value}.`;
    case "younger_than": return `${subject} is younger than ${value}.`;
    case "older_than": return `${subject} is older than ${value}.`;
    case "sibling_of": return `${subject} is a sibling of ${value}.`;
    case "parent_of": return `${subject} is a parent of ${value}.`;
    case "child_of": return `${subject} is a child of ${value}.`;
    case "married_to": return `${subject} is married to ${value}.`;
    case "friend_of": return `${subject} is a friend of ${value}.`;
    case "owns": return `${subject} owns ${value}.`;
    case "has": return `${subject} has ${value}.`;
    default: return `${subject}: ${displayFactValue(fact.predicate)} — ${value}.`;
  }
}

type CustomElement =
  | ParagraphElement
  | HeadingElement
  | LinkElement;

declare module "slate" {
  interface CustomTypes {
    TextEditor: Editor;
    Element: CustomElement;
    Text: CustomText;
    Range: BaseRange & {
      inconsistent?: boolean;
      inconsistencyRole?: "conflict" | "context" | "sentence";
      inconsistencySeverity?: InconsistencySeverity;
      inconsistencyIds?: string[];
      conflictInconsistencyIds?: string[];
      previewInconsistencyIds?: string[];
      sentenceInconsistencyIds?: string[];
      suggestionPreview?: boolean;
      freeEditInsertion?: boolean;
      replayVersion?: number;
    };
  }
}

const initialValue: Descendant[] = [
  {
    type: "paragraph",
    children: [
      {
        text: "Let's start writing...",
      },
    ],
  },
];

function normalizeSearchText(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function normalizeFactMatchText(value: unknown): string {
  return normalizeSearchText(value)
    .normalize("NFKC")
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}


export default function RichTextEditor({context,}: {context: StoryContext}) {
  const editor = useMemo(() => {
    const e = withHistory(
    withReact(createEditor())
  );

  
  const { isInline } = e;

  e.isInline = (element) => {
    return element.type === "link"
      ? true
      : isInline(element);
  };

  return e;
  }, []);

  const [inconsistencies, setInconsistencies] = useState<Inconsistency[]>([]);
  const [characterInconsistencies, setCharacterInconsistencies] =
    useState<CharacterInconsistency[]>([]);
  const [characterAnalysisError, setCharacterAnalysisError] = useState("");
  const [inconsistentPaths, setInconsistentPaths] = useState<InconsistentPath[]>([]);
  const [inconsistentRanges, setInconsistentRanges] = useState<InconsistentTextRange[]>([]);
  const [hiddenInconsistencyIds, setHiddenInconsistencyIds] =
    useState<Set<string>>(() => new Set());
  const [hiddenInconsistencyCategories, setHiddenInconsistencyCategories] =
    useState<Set<"story" | "character">>(() => new Set());
  const [categoryVisibleInconsistencyIds, setCategoryVisibleInconsistencyIds] =
    useState<Set<string>>(() => new Set());
  const [transitionHiddenInconsistencyIds, setTransitionHiddenInconsistencyIds] =
    useState<Set<string>>(() => new Set());
  const categoryTransitionTimeoutsRef = useRef(new Map<"story" | "character", number>());
  useEffect(() => () => {
    categoryTransitionTimeoutsRef.current.forEach((timeout) => window.clearTimeout(timeout));
  }, []);
  const [activeInconsistencyId, setActiveInconsistencyId] =
    useState<string | null>(null);
  const [selectedInconsistencyId, setSelectedInconsistencyId] =
    useState<string | null>(null);
  const selectedInconsistencyIdRef = useRef<string | null>(null);
  selectedInconsistencyIdRef.current = selectedInconsistencyId;
  const [jitterSuppressedIds, setJitterSuppressedIds] =
    useState<Set<string>>(() => new Set());
  const animationReplayVersion = useRef(0);
  const useExampleFactsRef = useRef(false);
  const exampleDocumentTextRef = useRef("");
  const analysisCacheRef = useRef(new Map<string, {
    result: FactExtraction;
    factInconsistencies: Inconsistency[];
    characterInconsistencies: CharacterInconsistency[];
  }>());
  const editorScrollRef = useRef<HTMLDivElement>(null);
  const editorScrollShellRef = useRef<HTMLDivElement>(null);
  const studyHoverStartsRef = useRef(new WeakMap<HTMLElement, {
    startedAt: number;
    inconsistencyId: string;
    source: "editor_marker" | "left_navigation";
    page?: number;
  }>());

  function captureEditorScrollPosition(preferredElement?: HTMLElement | null) {
    const container = editorScrollRef.current;
    const scrollTop = container?.scrollTop;
    const containerRect = container?.getBoundingClientRect();
    const editable = container?.firstElementChild as HTMLElement | null;
    const blocks = Array.from(
      editable?.querySelectorAll<HTMLElement>(":scope > [data-slate-node='element']") ?? []
    );
    const anchorY = containerRect
      ? containerRect.top + Math.min(containerRect.height / 3, 180)
      : null;
    let preferredBlock = preferredElement ?? null;
    while (
      preferredBlock &&
      preferredBlock.parentElement !== editable
    ) {
      preferredBlock = preferredBlock.parentElement;
    }
    if (preferredBlock?.parentElement !== editable) preferredBlock = null;
    const anchor = preferredBlock ?? (anchorY === null
      ? null
      : blocks.find((element) => {
          const rect = element.getBoundingClientRect();
          return rect.top <= anchorY && rect.bottom >= anchorY;
        }) ?? blocks.find((element) => {
          const rect = element.getBoundingClientRect();
          return rect.bottom >= (containerRect?.top ?? 0);
        }) ?? null);
    const anchorIndex = anchor ? blocks.indexOf(anchor) : -1;
    const anchorTop = anchor && containerRect
      ? anchor.getBoundingClientRect().top - containerRect.top
      : null;

    return () => {
      if (!container || scrollTop === undefined) return;

      const restoreAnchor = () => {
        const currentEditable = container.firstElementChild as HTMLElement | null;
        const currentAnchor = anchorIndex >= 0
          ? Array.from(
              currentEditable?.querySelectorAll<HTMLElement>(
                ":scope > [data-slate-node='element']"
              ) ?? []
            )[anchorIndex]
          : null;
        if (currentAnchor && anchorTop !== null) {
          const currentContainerTop = container.getBoundingClientRect().top;
          const currentAnchorTop = currentAnchor.getBoundingClientRect().top - currentContainerTop;
          container.scrollTop += currentAnchorTop - anchorTop;
        } else {
          container.scrollTop = scrollTop;
        }
      };

      // Applying removes controls and recalculates page breaks in separate
      // layout passes. Keeping a visible Slate block at the same viewport
      // position compensates those geometry changes as well as scroll anchoring.
      restoreAnchor();
      requestAnimationFrame(() => {
        restoreAnchor();
        requestAnimationFrame(() => {
          restoreAnchor();
          updatePagination();
        });
      });
    };
  }

  function getFreeEditChangedRanges(): BaseRange[] {
    const snapshot = freeEditDocumentSnapshotRef.current;
    if (snapshot.length === 0) return [];
    const ranges: BaseRange[] = [];

    editor.children.forEach((block, paragraphIndex) => {
      const before = snapshot[paragraphIndex] ?? "";
      const after = getNodeText(block);
      if (before === after) return;

      let start = 0;
      while (start < before.length && start < after.length && before[start] === after[start]) start += 1;
      let beforeEnd = before.length;
      let afterEnd = after.length;
      while (
        beforeEnd > start && afterEnd > start &&
        before[beforeEnd - 1] === after[afterEnd - 1]
      ) {
        beforeEnd -= 1;
        afterEnd -= 1;
      }
      if (afterEnd <= start) return;

      let textOffset = 0;
      for (const [node, path] of SlateNode.texts(block)) {
        const nodeStart = textOffset;
        const nodeEnd = nodeStart + node.text.length;
        textOffset = nodeEnd;
        const overlapStart = Math.max(start, nodeStart);
        const overlapEnd = Math.min(afterEnd, nodeEnd);
        if (overlapStart >= overlapEnd) continue;
        ranges.push({
          anchor: { path: [paragraphIndex, ...path], offset: overlapStart - nodeStart },
          focus: { path: [paragraphIndex, ...path], offset: overlapEnd - nodeStart },
        });
      }
    });

    return ranges;
  }

  function getBlockTextRange(
    paragraphIndex: number,
    startOffset: number,
    endOffset: number
  ): BaseRange | null {
    const block = editor.children[paragraphIndex];
    if (!block) return null;

    let textOffset = 0;
    let anchor: BaseRange["anchor"] | null = null;
    let focus: BaseRange["focus"] | null = null;
    for (const [node, path] of SlateNode.texts(block)) {
      const nodeStart = textOffset;
      const nodeEnd = nodeStart + node.text.length;
      const absolutePath = [paragraphIndex, ...path];
      if (!anchor && startOffset >= nodeStart && startOffset <= nodeEnd) {
        anchor = { path: absolutePath, offset: startOffset - nodeStart };
      }
      if (!focus && endOffset >= nodeStart && endOffset <= nodeEnd) {
        focus = { path: absolutePath, offset: endOffset - nodeStart };
      }
      textOffset = nodeEnd;
    }

    return anchor && focus ? { anchor, focus } : null;
  }

  function getRangeTextFragments(range: BaseRange): BaseRange[] {
    try {
      return Array.from(Editor.nodes(editor, {
        at: range,
        match: Text.isText,
      })).flatMap(([, path]) => {
        const intersection = Range.intersection(range, Editor.range(editor, path));
        return intersection && !Range.isCollapsed(intersection) ? [intersection] : [];
      });
    } catch {
      return [];
    }
  }
  const [offscreenAbove, setOffscreenAbove] =
    useState<OffscreenInconsistency[]>([]);
  const [offscreenBelow, setOffscreenBelow] =
    useState<OffscreenInconsistency[]>([]);
  const [offscreenFactPreviews, setOffscreenFactPreviews] =
    useState<OffscreenFactPreview[]>([]);
  const [factPreviewConnections, setFactPreviewConnections] =
    useState<FactPreviewConnection[]>([]);
  const [trackedChanges, setTrackedChanges] = useState<TrackedChange[]>([]);
  const [finalizingChangeIds, setFinalizingChangeIds] =
    useState<Set<string>>(() => new Set());
  const [finalizingInsertionOnlyChangeIds, setFinalizingInsertionOnlyChangeIds] =
    useState<Set<string>>(() => new Set());
  const [characterDecisions, setCharacterDecisions] = useState<CharacterDecision[]>([]);
  const [expandedTrackedChangeId, setExpandedTrackedChangeId] = useState<string | null>(null);
  const nextTrackedChangeId = useRef(0);
  const [suggestionTarget, setSuggestionTarget] =
    useState<Inconsistency | null>(null);
  const [suggestionDraft, setSuggestionDraft] = useState("");
  const [suggestionMode, setSuggestionMode] = useState<SuggestionMode>("replace");
  const [selectedSuggestionFacts, setSelectedSuggestionFacts] =
    useState<Set<number>>(() => new Set());
  const [confirmedPositionKeys, setConfirmedPositionKeys] =
    useState<Set<string>>(() => new Set());
  const [dependentPassages, setDependentPassages] = useState<DependentPassage[]>([]);
  const [handledCharacterEvidenceKeys, setHandledCharacterEvidenceKeys] =
    useState<Set<string>>(() => new Set());
  const [freeEditCharacterEvidenceIndices, setFreeEditCharacterEvidenceIndices] =
    useState<number[]>([]);
  const [freeEditParagraphs, setFreeEditParagraphs] = useState<number[]>([]);
  const [freeEditInconsistency, setFreeEditInconsistency] =
    useState<Inconsistency | null>(null);
  const [freeEditCharacterInconsistency, setFreeEditCharacterInconsistency] =
    useState<CharacterInconsistency | null>(null);
  const freeEditRangeRefs = useRef<RangeRef[]>([]);
  const freeEditChangedRangeRefs = useRef<RangeRef[]>([]);
  const freeEditDocumentSnapshotRef = useRef<string[]>([]);
  const freeEditDocumentNodesSnapshotRef = useRef<Descendant[]>([]);
  const freeEditInconsistencyIdRef = useRef<string | null>(null);
  const [successfulInconsistencyId, setSuccessfulInconsistencyId] =
    useState<string | null>(null);
  const successfulInconsistencyIdRef = useRef<string | null>(null);
  const successfulRangesRef = useRef<InconsistentTextRange[]>([]);
  const resolvedInconsistencyIdsRef = useRef<Set<string>>(new Set());
  const [, setPendingResolvedInconsistencies] =
    useState<Inconsistency[] | null>(null);
  const [, setPendingResolvedCharacterInconsistencies] =
    useState<CharacterInconsistency[] | null>(null);
  const [analysis, setAnalysis] =
    useState<FactExtraction | null>(null);

  const [analyzing, setAnalyzing] = useState(false);

  const [, setAnalysisError] = useState("");

  const [document, setDocument] = useState<Descendant[]>(initialValue);
  const [documentZoom, setDocumentZoom] = useState(100);
  const [currentPage, setCurrentPage] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [pageLineWidths, setPageLineWidths] = useState<number[][]>([[]]);
  const [pageLineTops, setPageLineTops] = useState<number[][]>([[]]);
  const [pageLineLefts, setPageLineLefts] = useState<number[][]>([[]]);
  const [blockPageIndices, setBlockPageIndices] = useState<number[]>([0]);
  const [inconsistencyPageIndices, setInconsistencyPageIndices] = useState<number[]>([]);
  const [, setInconsistencyPositions] = useState<Array<{ page: number; x: number; y: number }>>([]);
  const [navigationTextHighlights, setNavigationTextHighlights] = useState<NavigationTextHighlight[]>([]);
  const [hoveredNavigationInconsistencyIndex, setHoveredNavigationInconsistencyIndex] =
    useState<number | null>(null);
  const navigationHoverTargetRef = useRef<HTMLElement | null>(null);
  const navigationHoverTimeoutRef = useRef<number | null>(null);
  const navigationItems = useMemo(() => [
    ...inconsistencies.map((item) => ({ id: getStableInconsistencyId(item) })),
    ...characterInconsistencies.map((item) => ({ id: getStableCharacterInconsistencyId(item) })),
  ], [inconsistencies, characterInconsistencies]);
  const inconsistencyEmojiById = useMemo(() => new Map<string, string>([
    ...inconsistencies.map((item): [string, string] => [
      getStableInconsistencyId(item),
      getFactThemePresentation(item.predicate).emoji,
    ]),
    ...characterInconsistencies.map((item): [string, string] => [
      getStableCharacterInconsistencyId(item),
      CHARACTER_CATEGORY_EMOJI[item.category],
    ]),
  ]), [inconsistencies, characterInconsistencies]);
  const effectiveHiddenInconsistencyIds = useMemo(() => {
    const hidden = new Set(hiddenInconsistencyIds);
    if (hiddenInconsistencyCategories.has("story")) {
      inconsistencies.forEach((item) => {
        const id = getStableInconsistencyId(item);
        if (!categoryVisibleInconsistencyIds.has(id)) hidden.add(id);
      });
    }
    if (hiddenInconsistencyCategories.has("character")) {
      characterInconsistencies.forEach((item) => {
        const id = getStableCharacterInconsistencyId(item);
        if (!categoryVisibleInconsistencyIds.has(id)) hidden.add(id);
      });
    }
    return hidden;
  }, [hiddenInconsistencyIds, hiddenInconsistencyCategories, categoryVisibleInconsistencyIds, inconsistencies, characterInconsistencies]);

  const updatePagination = useCallback(() => {
    const container = editorScrollRef.current;
    if (!container) return;
    const zoomFactor = documentZoom / 100;
    const editable = container.firstElementChild as HTMLElement | null;
    editable?.style.setProperty("--editor-page-height", `${container.clientHeight}px`);
    // `container.scrollHeight` enthält den visuellen CSS-Zoom. Die interne
    // Höhe des Dokuments bleibt dagegen in logischen Seitenpixeln stabil.
    const logicalScrollHeight = editable?.scrollHeight ?? container.clientHeight;
    const count = Math.max(1, Math.ceil(logicalScrollHeight / container.clientHeight));
    setPageCount(count);
    setCurrentPage(Math.min(count - 1, Math.max(0, Math.round(
      container.scrollTop / Math.max(1, container.clientHeight * zoomFactor)
    ))));
  }, [documentZoom]);

  const navigateToPage = useCallback((page: number) => {
    const container = editorScrollRef.current;
    if (!container) return;
    const target = Math.min(pageCount - 1, Math.max(0, page));
    container.scrollTo({
      top: target * container.clientHeight * (documentZoom / 100),
      behavior: "smooth",
    });
    setCurrentPage(target);
  }, [documentZoom, pageCount]);

  const layoutParagraphsAcrossPages = useCallback(() => {
    const container = editorScrollRef.current;
    const editable = container?.firstElementChild as HTMLElement | null;
    if (!container || !editable || container.clientHeight === 0) return;

    const pageHeight = container.clientHeight;
    const zoomFactor = documentZoom / 100;
    editable.style.setProperty("--editor-page-height", `${pageHeight}px`);
    const blocks = Array.from(
      editable.querySelectorAll<HTMLElement>(":scope > [data-slate-node='element']")
    );

    const isFreeEditing = Boolean(freeEditInconsistency || freeEditCharacterInconsistency);

    // Während einer freien Bearbeitung bleiben die bestehenden Seitenabstände
    // eingefroren. Sonst kann bereits ein einziges Zeichen den Absatz über eine
    // Seitengrenze schieben und unmittelbar ein großes padding-top erzeugen.
    if (!isFreeEditing) {
      // Erst den natürlichen Textfluss wiederherstellen, damit die Messung nicht
      // auf Abständen einer früheren Fenster- oder Textgröße basiert.
      blocks.forEach((block) => block.style.removeProperty("padding-top"));

      for (const block of blocks) {
        const top = block.offsetTop;
        const height = block.offsetHeight;
        const pageEnd = (Math.floor(top / pageHeight) + 1) * pageHeight;
        const crossesPageEnd = top + height > pageEnd;
        const fitsOnOnePage = height <= pageHeight - 116;

        if (crossesPageEnd && fitsOnOnePage) {
          // Etwas Abstand nach der sichtbaren Papierkante lässt den neuen Absatz
          // wie auf einer echten Folgeseite beginnen.
          block.style.paddingTop = `${pageEnd - top + 24}px`;
        }
      }
    }

    const measuredBlockPages = blocks.map((block) => {
      const paddingTop = Number.parseFloat(block.style.paddingTop || "0") || 0;
      return Math.max(0, Math.floor((block.offsetTop + paddingTop) / pageHeight));
    });
    setBlockPageIndices((current) =>
      current.length === measuredBlockPages.length &&
      current.every((page, index) => page === measuredBlockPages[index])
        ? current
        : measuredBlockPages
    );

    const editableRect = editable.getBoundingClientRect();
    const contentWidth = Math.max(1, editable.clientWidth - 124);
    const measuredTextHighlights: NavigationTextHighlight[] = [];
    const addHighlightRects = (
      element: HTMLElement,
      id: string,
      success: boolean,
      sourceType: NavigationTextHighlight["sourceType"],
      sourceElementIndex: number
    ) => {
      const index = navigationItems.findIndex((item) => item.id === id);
      if (index < 0) return;
      const factual = inconsistencies[index];
      const character = index >= inconsistencies.length
        ? characterInconsistencies[index - inconsistencies.length]
        : undefined;
      const severity = factual?.severity ?? character?.confidence ?? "medium";
      const predicate = factual?.predicate ?? `character:${character?.category ?? "development"}`;

      Array.from(element.getClientRects()).forEach((rect, rectIndex) => {
        if (rect.width <= 0 || rect.height <= 0) return;
        const relativeTop = (rect.top + rect.height / 2 - editableRect.top) / zoomFactor;
        const page = Math.max(0, Math.floor(relativeTop / pageHeight));
        measuredTextHighlights.push({
          key: `${sourceType}-${sourceElementIndex}-${id}-${rectIndex}-${Math.round(relativeTop)}`,
          sourceElementIndex,
          sourceType,
          index,
          page,
          x: Math.min(98, Math.max(0, ((rect.left - editableRect.left - 62 * zoomFactor) / (contentWidth * zoomFactor)) * 100)),
          y: Math.min(98, Math.max(0, ((relativeTop % pageHeight) / pageHeight) * 100)),
          width: Math.min(100, Math.max(.8, (rect.width / (contentWidth * zoomFactor)) * 100)),
          severity,
          predicate,
          success,
        });
      });
    };

    editable.querySelectorAll<HTMLElement>("[data-inconsistency-ids]").forEach((element, elementIndex) => {
      if (element.dataset.inconsistencyRole === "sentence" || element.dataset.changeType === "insertion") return;
      element.dataset.inconsistencyIds?.split(" ").filter(Boolean).forEach((id) =>
        addHighlightRects(element, id, id === successfulInconsistencyId, "mark", elementIndex)
      );
    });
    editable.querySelectorAll<HTMLElement>("[data-change-type='insertion'][data-change-id]").forEach((element, elementIndex) => {
      const change = trackedChanges.find((candidate) => candidate.id === element.dataset.changeId);
      if (!change) return;
      addHighlightRects(
        element,
        getStableInconsistencyId(change.inconsistency),
        true,
        "change",
        elementIndex
      );
    });
    const uniqueTextHighlights = Array.from(new Map(
      measuredTextHighlights.map((highlight) => [
        `${highlight.index}:${highlight.page}:${highlight.x.toFixed(2)}:${highlight.y.toFixed(2)}:${highlight.width.toFixed(2)}:${highlight.success}`,
        highlight,
      ])
    ).values());
    setNavigationTextHighlights((current) =>
      JSON.stringify(current) === JSON.stringify(uniqueTextHighlights) ? current : uniqueTextHighlights
    );

    const measuredInconsistencyPositions = navigationItems.map(({ id }) => {
      const marker = editable.querySelector<HTMLElement>(
        `[data-conflict-inconsistency-ids~="${id}"]`
      );
      if (!marker) return { page: 0, x: 50, y: 8 };
      const rect = marker.getBoundingClientRect();
      const relativeTop =
        (rect.top + rect.height / 2 - editableRect.top) / zoomFactor;
      return {
        page: Math.max(0, Math.floor(relativeTop / pageHeight)),
        x: Math.min(92, Math.max(8, ((rect.left + rect.width / 2 - editableRect.left) / editableRect.width) * 100)),
        y: Math.min(92, Math.max(8, ((relativeTop % pageHeight) / pageHeight) * 100)),
      };
    });
    setInconsistencyPositions((current) =>
      JSON.stringify(current) === JSON.stringify(measuredInconsistencyPositions)
        ? current
        : measuredInconsistencyPositions
    );
    const measuredInconsistencyPages = measuredInconsistencyPositions.map(({ page }) => page);
    setInconsistencyPageIndices((current) =>
      current.length === measuredInconsistencyPages.length &&
      current.every((page, index) => page === measuredInconsistencyPages[index])
        ? current
        : measuredInconsistencyPages
    );
    const visualLines = new Map<number, { left: number; right: number; top: number }>();
    const walker = window.document.createTreeWalker(editable, NodeFilter.SHOW_TEXT);
    let textNode = walker.nextNode();

    while (textNode) {
      if (textNode.textContent?.trim()) {
        const range = window.document.createRange();
        range.selectNodeContents(textNode);
        for (const rect of Array.from(range.getClientRects())) {
          if (rect.width === 0 || rect.height === 0) continue;
          const relativeTop = (rect.top - editableRect.top) / zoomFactor;
          const lineKey = Math.round(relativeTop / 2) * 2;
          const existing = visualLines.get(lineKey);
          visualLines.set(lineKey, existing ? {
            left: Math.min(existing.left, (rect.left - editableRect.left) / zoomFactor),
            right: Math.max(existing.right, (rect.right - editableRect.left) / zoomFactor),
            top: Math.min(existing.top, relativeTop),
          } : {
            left: (rect.left - editableRect.left) / zoomFactor,
            right: (rect.right - editableRect.left) / zoomFactor,
            top: relativeTop,
          });
        }
      }
      textNode = walker.nextNode();
    }

    const measuredPageCount = Math.max(1, Math.ceil(editable.scrollHeight / pageHeight));
    const measuredLines = Array.from({ length: measuredPageCount }, () => [] as number[]);
    const measuredLineTops = Array.from({ length: measuredPageCount }, () => [] as number[]);
    const measuredLineLefts = Array.from({ length: measuredPageCount }, () => [] as number[]);
    Array.from(visualLines.values())
      .sort((a, b) => a.top - b.top)
      .forEach((line) => {
        const page = Math.min(measuredPageCount - 1, Math.max(0, Math.floor(line.top / pageHeight)));
        measuredLines[page].push(Math.min(100, Math.max(8, ((line.right - line.left) / contentWidth) * 100)));
        measuredLineTops[page].push(((line.top % pageHeight) / pageHeight) * 100);
        measuredLineLefts[page].push(Math.min(100, Math.max(0, ((line.left - 62) / contentWidth) * 100)));
      });
    setPageLineWidths((current) =>
      JSON.stringify(current) === JSON.stringify(measuredLines) ? current : measuredLines
    );
    setPageLineTops((current) =>
      JSON.stringify(current) === JSON.stringify(measuredLineTops) ? current : measuredLineTops
    );
    setPageLineLefts((current) =>
      JSON.stringify(current) === JSON.stringify(measuredLineLefts) ? current : measuredLineLefts
    );

    requestAnimationFrame(updatePagination);
  }, [navigationItems, inconsistentRanges, updatePagination, documentZoom, effectiveHiddenInconsistencyIds, inconsistencies, characterInconsistencies, successfulInconsistencyId, trackedChanges, freeEditInconsistency, freeEditCharacterInconsistency]);

  useEffect(() => {
    const container = editorScrollRef.current;
    if (!container) return;
    const frame = requestAnimationFrame(layoutParagraphsAcrossPages);
    const observer = new ResizeObserver(layoutParagraphsAcrossPages);
    observer.observe(container);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, [document, layoutParagraphsAcrossPages]);

  const decorateInconsistencies = useCallback(
    ([node, path]: NodeEntry): DecoratedRange[] => {
      if (!Text.isText(node)) {
        return [];
      }

      const nodeRanges = inconsistentRanges.filter((range) =>
        Path.equals(range.anchor.path, path)
      );

      /*
       * Slate führt die benutzerdefinierten Eigenschaften überlappender
       * Decorations nicht zusammen. Deshalb zerlegen wir sie an allen Grenzen
       * in eindeutige Segmente und erhalten so auch bei Überlappungen sämtliche
       * Inkonsistenz-IDs.
       */
      const boundaries = Array.from(new Set(
        nodeRanges.flatMap((range) => [range.anchor.offset, range.focus.offset])
      )).sort((a, b) => a - b);

      const segments: InconsistentTextRange[] = [];

      for (let boundaryIndex = 0; boundaryIndex < boundaries.length - 1; boundaryIndex += 1) {
        const start = boundaries[boundaryIndex];
        const end = boundaries[boundaryIndex + 1];
        const coveringRanges = nodeRanges.filter(
          (range) => range.anchor.offset < end && range.focus.offset > start
        );

        if (coveringRanges.length === 0) {
          continue;
        }

        const conflictRanges = coveringRanges.filter(
          (range) => range.inconsistencyRole === "conflict"
        );
        const severity = conflictRanges.reduce<InconsistencySeverity | undefined>(
          (current, range) => {
            if (current === undefined) {
              return range.inconsistencySeverity;
            }

            return isMoreSevere(range.inconsistencySeverity, current)
              ? range.inconsistencySeverity
              : current;
          },
          undefined
        );

        const contextRanges = coveringRanges.filter(
          (range) => range.inconsistencyRole === "context"
        );
        const sentenceRanges = coveringRanges.filter(
          (range) => range.inconsistencyRole === "sentence"
        );
        const freeEditInsertion = coveringRanges.some((range) => range.freeEditInsertion) &&
          !coveringRanges.some((range) =>
            !range.freeEditInsertion && range.inconsistencyRole === "conflict"
          );

        segments.push({
          anchor: { path, offset: start },
          focus: { path, offset: end },
          inconsistent: true,
          freeEditInsertion,
          inconsistencyRole:
            conflictRanges.length > 0
              ? "conflict"
              : contextRanges.length > 0
                ? "context"
                : "sentence",
          inconsistencySeverity: severity,
          inconsistencyIds: Array.from(new Set(
            coveringRanges.flatMap((range) => range.inconsistencyIds)
          )),
          conflictInconsistencyIds: Array.from(new Set(
            conflictRanges.flatMap((range) => range.conflictInconsistencyIds)
          )),
          previewInconsistencyIds: Array.from(new Set(
            contextRanges.flatMap((range) => range.inconsistencyIds)
          )),
          sentenceInconsistencyIds: Array.from(new Set(
            sentenceRanges.flatMap((range) => range.inconsistencyIds)
          )),
          replayVersion: Math.max(
            0,
            ...coveringRanges.map((range) => range.replayVersion ?? 0)
          ) || undefined,
        });
      }

      return segments;
    },
    [inconsistentRanges]
  );

  function scrollToInconsistencyCard(inconsistencyId: string) {
    window.requestAnimationFrame(() => {
      const card = Array.from(
        window.document.querySelectorAll<HTMLElement>("[data-inconsistency-card-id]")
      ).find((candidate) => candidate.dataset.inconsistencyCardId === inconsistencyId);
      const list = card?.closest<HTMLElement>(".conflict-list");
      if (!card || !list) return;

      const cardRect = card.getBoundingClientRect();
      const listRect = list.getBoundingClientRect();
      const targetTop = list.scrollTop + cardRect.top - listRect.top -
        Math.max(16, (list.clientHeight - cardRect.height) / 2);
      list.scrollTo({
        top: Math.max(0, targetTop),
        behavior: "smooth",
      });
    });
  }

  function focusInconsistency(
    index: number,
    scrollToRange = true,
    toggleSelection = true,
    studySource = "right_card"
  ) {
    const factualInconsistency = inconsistencies[index];
    const characterInconsistency = index >= inconsistencies.length
      ? characterInconsistencies[index - inconsistencies.length]
      : undefined;
    const inconsistencyId = factualInconsistency
      ? getStableInconsistencyId(factualInconsistency)
      : characterInconsistency
        ? getStableCharacterInconsistencyId(characterInconsistency)
        : null;
    if (!inconsistencyId) return;

    if (toggleSelection && selectedInconsistencyId === inconsistencyId) {
      finishInconsistencyWork("deselected");
      setSelectedInconsistencyId(null);
      selectedInconsistencyIdRef.current = null;
      setActiveInconsistencyId(null);
      return;
    }

    const allCandidateRanges = inconsistentRanges.filter(
      (candidate) =>
        candidate.inconsistencyRole !== "sentence" &&
        candidate.inconsistencyIds.includes(inconsistencyId)
    );
    const openCandidateRanges = allCandidateRanges.filter((candidate) => {
      try {
        const [node] = Editor.node(editor, candidate.anchor.path);
        return !Text.isText(node) || (!node.confirmedCorrect && !node.changeAccepted);
      } catch {
        return true;
      }
    });
    const candidateRanges = openCandidateRanges.length > 0
      ? openCandidateRanges
      : allCandidateRanges;
    const viewport = editorScrollRef.current?.getBoundingClientRect();
    const range = candidateRanges.reduce<InconsistentTextRange | null>((closest, candidate) => {
      if (!viewport) return closest ?? candidate;
      try {
        const candidateRect = ReactEditor.toDOMRange(editor, candidate).getBoundingClientRect();
        const candidateDistance = candidateRect.bottom < viewport.top
          ? viewport.top - candidateRect.bottom
          : candidateRect.top > viewport.bottom
            ? candidateRect.top - viewport.bottom
            : Math.abs(
                candidateRect.top + candidateRect.height / 2 -
                (viewport.top + viewport.height / 2)
              ) / 1000;
        if (!closest) return candidate;
        const closestRect = ReactEditor.toDOMRange(editor, closest).getBoundingClientRect();
        const closestDistance = closestRect.bottom < viewport.top
          ? viewport.top - closestRect.bottom
          : closestRect.top > viewport.bottom
            ? closestRect.top - viewport.bottom
            : Math.abs(
                closestRect.top + closestRect.height / 2 -
                (viewport.top + viewport.height / 2)
              ) / 1000;
        return candidateDistance < closestDistance ? candidate : closest;
      } catch {
        return closest ?? candidate;
      }
    }, null) ?? inconsistentRanges.find(
      (candidate) => candidate.conflictInconsistencyIds.includes(inconsistencyId)
    );

    if (!range) {
      return;
    }

    setActiveInconsistencyId(inconsistencyId);
    setSelectedInconsistencyId(inconsistencyId);
    selectedInconsistencyIdRef.current = inconsistencyId;
    logStudyEvent("inconsistency_selected", {
      inconsistency_id: inconsistencyId,
      source: studySource,
    });
    startInconsistencyWork(inconsistencyId, studySource);
    scrollToInconsistencyCard(inconsistencyId);
    animationReplayVersion.current += 1;
    const replayVersion = animationReplayVersion.current;

    setInconsistentRanges((ranges) =>
      ranges.map((candidate) =>
        candidate.inconsistencyIds.includes(inconsistencyId)
          ? { ...candidate, replayVersion }
          : candidate
      )
    );

    if (!scrollToRange) return;

    try {
      const blockPath = [range.anchor.path[0]];
      const point = Editor.start(editor, blockPath);

      Transforms.select(editor, {
        anchor: point,
        focus: point,
      });

      const element = ReactEditor.toDOMNode(
        editor,
        Editor.node(editor, blockPath)[0]
      );

      element.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    } catch (error) {
      console.error("Navigation zur Inkonsistenz fehlgeschlagen:", error);
    }
  }

  function handleInconsistencyHover(inconsistencyId: string | null) {
    if (inconsistencyId) {
      setJitterSuppressedIds((current) => {
        if (current.has(inconsistencyId)) {
          return current;
        }

        const next = new Set(current);
        next.add(inconsistencyId);
        return next;
      });
    }

    setActiveInconsistencyId(
      inconsistencyId ?? selectedInconsistencyIdRef.current
    );
  }

  const updateOffscreenMarkers = useCallback(() => {
    const scrollContainer = editorScrollRef.current;

    if (!scrollContainer) {
      return;
    }

    const viewport = scrollContainer.getBoundingClientRect();
    const markerSources = [
      ...inconsistencies.map((inconsistency, index) => {
        const category = INCONSISTENCY_CATEGORY_PRESENTATION[inconsistency.category];
        const theme = getFactThemePresentation(inconsistency.predicate);
        const inconsistencyId = getStableInconsistencyId(inconsistency);
        const successful = successfulInconsistencyId === inconsistencyId;
        const handledOccurrenceCount = trackedChanges
          .filter((change) => getStableInconsistencyId(change.inconsistency) === inconsistencyId)
          .reduce((total, change) => total + change.occurrenceCount, 0);
        return {
          index,
          id: getStableInconsistencyId(inconsistency),
          severity: inconsistency.severity ?? "medium" as InconsistencySeverity,
          emoji: theme.emoji,
          label: theme.label,
          detail: category.label,
          occurrenceCount: successful
            ? handledOccurrenceCount
            : getAffectedFactPositions(inconsistency).length,
          successful,
        };
      }),
      ...characterInconsistencies.map((inconsistency, index) => {
        const inconsistencyId = getStableCharacterInconsistencyId(inconsistency);
        const successful = successfulInconsistencyId === inconsistencyId ||
          inconsistency.evidence.every((_, evidenceIndex) =>
            handledCharacterEvidenceKeys.has(
              `${inconsistencyId}:${evidenceIndex}`
            )
          );
        const handledEvidenceCount = inconsistency.evidence.filter((_, evidenceIndex) =>
          handledCharacterEvidenceKeys.has(`${inconsistencyId}:${evidenceIndex}`)
        ).length;
        return {
          index: inconsistencies.length + index,
          id: inconsistencyId,
          severity: characterSeverity(inconsistency.confidence),
          emoji: CHARACTER_CATEGORY_EMOJI[inconsistency.category],
          label: "Character Continuity",
          detail: `${inconsistency.character} · ${CHARACTER_CATEGORY_PRESENTATION[inconsistency.category]}`,
          occurrenceCount: successful
            ? handledEvidenceCount
            : inconsistency.evidence.length - handledEvidenceCount,
          successful,
        };
      }),
    ];
    const positions = markerSources
      .filter((marker) =>
        hoveredNavigationInconsistencyIndex === null ||
        marker.index === hoveredNavigationInconsistencyIndex
      )
      .flatMap((marker) => {
      const { id } = marker;
      if (effectiveHiddenInconsistencyIds.has(id)) {
        return [];
      }
      const relatedChangeIds = new Set(
        trackedChanges
          .filter((change) => getStableInconsistencyId(change.inconsistency) === id)
          .map((change) => change.id)
      );
      const elements = Array.from(
        scrollContainer.querySelectorAll<HTMLElement>(
          "[data-inconsistency-ids], [data-change-id]"
        )
      ).filter((element) => {
        const isInconsistencyPassage =
          element.dataset.inconsistencyRole !== "sentence" &&
          element.dataset.inconsistencyIds?.split(" ").includes(id);
        const isTrackedChangePassage = Boolean(
          element.dataset.changeId && relatedChangeIds.has(element.dataset.changeId)
        );

        return isInconsistencyPassage || isTrackedChangePassage;
      });

      if (elements.length === 0) {
        return [];
      }

      const rects = elements.map((element) => element.getBoundingClientRect());
      const aboveRects = rects.filter((rect) => rect.bottom < viewport.top);
      const belowRects = rects.filter((rect) => rect.top > viewport.bottom);
      const markerPositions = [];

      if (aboveRects.length > 0) {
        const closestRect = aboveRects.reduce((closest, rect) =>
          rect.bottom > closest.bottom ? rect : closest
        );

        markerPositions.push({
          ...marker,
          direction: "above" as const,
          distance: viewport.top - closestRect.bottom,
          edgeOffset: Math.min(
            viewport.width - 14,
            Math.max(14, closestRect.left + closestRect.width / 2 - viewport.left)
          ),
        });
      }

      if (belowRects.length > 0) {
        const closestRect = belowRects.reduce((closest, rect) =>
          rect.top < closest.top ? rect : closest
        );

        markerPositions.push({
          ...marker,
          direction: "below" as const,
          distance: closestRect.top - viewport.bottom,
          edgeOffset: Math.min(
            viewport.width - 14,
            Math.max(14, closestRect.left + closestRect.width / 2 - viewport.left)
          ),
        });
      }

      return markerPositions;
    });

    const markersFor = (direction: "above" | "below") => {
      const minimumOffset = 16;
      const maximumOffset = Math.max(minimumOffset, viewport.width - 16);
      const markerGap = 28;
      const markers = positions
        .filter((position) => position.direction === direction)
        .sort((a, b) => a.edgeOffset - b.edgeOffset)
        .map(({ index, severity, emoji, label, detail, occurrenceCount, successful, edgeOffset, distance }) => ({
          index,
          severity,
          emoji,
          label,
          detail,
          occurrenceCount,
          successful,
          edgeOffset,
          opacity: Math.max(
            0.18,
            1 - (distance / Math.max(1, viewport.height * 1.5)) * 0.82
          ),
        }));

      /* Marker möglichst an ihrer Textprojektion belassen, aber von links
       * nach rechts so weit auseinanderschieben, dass Kreis und Ripple nicht
       * aufeinanderliegen. */
      for (let index = 1; index < markers.length; index += 1) {
        markers[index].edgeOffset = Math.max(
          markers[index].edgeOffset,
          markers[index - 1].edgeOffset + markerGap
        );
      }

      if (markers.length > 0 && markers.at(-1)!.edgeOffset > maximumOffset) {
        markers[markers.length - 1].edgeOffset = maximumOffset;

        for (let index = markers.length - 2; index >= 0; index -= 1) {
          markers[index].edgeOffset = Math.min(
            markers[index].edgeOffset,
            markers[index + 1].edgeOffset - markerGap
          );
        }
      }

      if (markers.length > 0 && markers[0].edgeOffset < minimumOffset) {
        markers[0].edgeOffset = minimumOffset;

        for (let index = 1; index < markers.length; index += 1) {
          markers[index].edgeOffset = Math.max(
            markers[index].edgeOffset,
            markers[index - 1].edgeOffset + markerGap
          );
        }
      }

      return markers;
    };

    setOffscreenAbove(markersFor("above"));
    setOffscreenBelow(markersFor("below"));
  }, [inconsistencies, characterInconsistencies, effectiveHiddenInconsistencyIds, trackedChanges, successfulInconsistencyId, handledCharacterEvidenceKeys, hoveredNavigationInconsistencyIndex]);

  useEffect(() => {
    const scrollContainer = editorScrollRef.current;

    if (!scrollContainer) {
      return;
    }

    const scheduleUpdate = () => requestAnimationFrame(updateOffscreenMarkers);
    scheduleUpdate();
    scrollContainer.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);

    return () => {
      scrollContainer.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
    };
  }, [document, inconsistentRanges, updateOffscreenMarkers]);

  const updateOffscreenFactPreviews = useCallback(() => {
    const scrollContainer = editorScrollRef.current;

    if (
      !scrollContainer ||
      !activeInconsistencyId ||
      effectiveHiddenInconsistencyIds.has(activeInconsistencyId)
    ) {
      setOffscreenFactPreviews([]);
      return;
    }

    const viewport = scrollContainer.getBoundingClientRect();
    const contextElements = Array.from(
      scrollContainer.querySelectorAll<HTMLElement>("[data-inconsistency-ids]")
    ).filter((element) =>
      element.dataset.inconsistencyRole !== "sentence" &&
      element.dataset.inconsistencyIds
        ?.split(" ")
        .includes(activeInconsistencyId)
    );

    const previews = contextElements.flatMap((element, index): OffscreenFactPreview[] => {
      const rect = element.getBoundingClientRect();
      const direction = rect.bottom < viewport.top
        ? "above"
        : rect.top > viewport.bottom
          ? "below"
          : null;

      if (!direction) {
        return [];
      }

      const block = element.closest("p, h1, h2, h3, blockquote") as HTMLElement | null;
      const fact = element.textContent?.trim() ?? "";

      if (!block || !fact) {
        return [];
      }

      const precedingRange = window.document.createRange();
      precedingRange.selectNodeContents(block);
      precedingRange.setEndBefore(element);
      const blockText = block.textContent ?? "";
      const factStart = precedingRange.toString().length;
      const factEnd = factStart + fact.length;
      const sentenceStart = Math.max(
        blockText.lastIndexOf(".", Math.max(0, factStart - 1)),
        blockText.lastIndexOf("!", Math.max(0, factStart - 1)),
        blockText.lastIndexOf("?", Math.max(0, factStart - 1))
      ) + 1;
      const endings = [".", "!", "?"]
        .map((character) => blockText.indexOf(character, factEnd))
        .filter((position) => position >= 0);
      const sentenceEnd = endings.length > 0
        ? Math.min(...endings) + 1
        : blockText.length;

      return [{
        key: `${activeInconsistencyId}-${index}`,
        targetIndex: index,
        direction,
        emoji: inconsistencyEmojiById.get(activeInconsistencyId) ?? "",
        before: blockText.slice(sentenceStart, factStart).trimStart(),
        fact: blockText.slice(factStart, factEnd),
        after: blockText.slice(factEnd, sentenceEnd).trimEnd(),
        distance: direction === "above"
          ? viewport.top - rect.bottom
          : rect.top - viewport.bottom,
      }];
    });

    setOffscreenFactPreviews(previews.sort((first, second) => first.distance - second.distance));
  }, [activeInconsistencyId, effectiveHiddenInconsistencyIds, inconsistencyEmojiById]);

  const navigateToFactPreview = useCallback((preview: OffscreenFactPreview) => {
    const scrollContainer = editorScrollRef.current;
    if (!scrollContainer || !activeInconsistencyId) return;

    const targets = Array.from(
      scrollContainer.querySelectorAll<HTMLElement>("[data-inconsistency-ids]")
    ).filter((element) =>
      element.dataset.inconsistencyRole !== "sentence" &&
      element.dataset.inconsistencyIds?.split(" ").includes(activeInconsistencyId)
    );
    const target = targets[preview.targetIndex];
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [activeInconsistencyId]);

  useEffect(() => {
    const scrollContainer = editorScrollRef.current;

    if (!scrollContainer) {
      return;
    }

    const scheduleUpdate = () => requestAnimationFrame(updateOffscreenFactPreviews);
    scheduleUpdate();
    scrollContainer.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);

    return () => {
      scrollContainer.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
    };
  }, [document, inconsistentRanges, updateOffscreenFactPreviews]);

  const updateFactPreviewConnections = useCallback(() => {
    const scrollContainer = editorScrollRef.current;
    const shell = editorScrollShellRef.current;

    if (
      !scrollContainer ||
      !shell ||
      !activeInconsistencyId ||
      offscreenFactPreviews.length === 0
    ) {
      setFactPreviewConnections([]);
      return;
    }

    const shellRect = shell.getBoundingClientRect();
    const viewport = scrollContainer.getBoundingClientRect();
    const relatedElements = Array.from(
      scrollContainer.querySelectorAll<HTMLElement>("[data-inconsistency-ids]")
    ).filter((element) =>
      element.dataset.inconsistencyRole !== "sentence" &&
      element.dataset.inconsistencyIds?.split(" ").includes(activeInconsistencyId)
    );
    const conflictElement = relatedElements.find((element) => {
      const rect = element.getBoundingClientRect();
      return rect.bottom >= viewport.top && rect.top <= viewport.bottom;
    }) ?? relatedElements[0];

    if (!conflictElement) {
      setFactPreviewConnections([]);
      return;
    }

    const sourceRect = conflictElement.getBoundingClientRect();
    const sourceX = Math.min(
      shellRect.width - 12,
      Math.max(12, sourceRect.left + sourceRect.width / 2 - shellRect.left)
    );
    const sourceY = Math.min(
      shellRect.height - 8,
      Math.max(8, sourceRect.top + sourceRect.height / 2 - shellRect.top)
    );
    const previewElements = Array.from(
      shell.querySelectorAll<HTMLElement>("[data-fact-preview-key]")
    );

    setFactPreviewConnections(offscreenFactPreviews.flatMap((preview) => {
      const previewElement = previewElements.find(
        (element) => element.dataset.factPreviewKey === preview.key
      );

      if (!previewElement) {
        return [];
      }

      const previewRect = previewElement.getBoundingClientRect();
      const targetX = previewRect.left + previewRect.width / 2 - shellRect.left;
      const targetY = preview.direction === "above"
        ? previewRect.bottom - shellRect.top
        : previewRect.top - shellRect.top;
      const railX = 12;
      const sourceControlX = Math.max(railX, sourceX - 26);
      const targetControlX = Math.max(railX, targetX - 26);

      return [{
        key: preview.key,
        path: [
          `M ${sourceX} ${sourceY}`,
          `C ${sourceControlX} ${sourceY}, ${railX} ${sourceY}, ${railX} ${sourceY}`,
          `L ${railX} ${targetY}`,
          `C ${railX} ${targetY}, ${targetControlX} ${targetY}, ${targetX} ${targetY}`,
        ].join(" "),
      }];
    }));
  }, [activeInconsistencyId, offscreenFactPreviews]);

  useEffect(() => {
    const scrollContainer = editorScrollRef.current;

    if (!scrollContainer) {
      return;
    }

    const scheduleUpdate = () => requestAnimationFrame(updateFactPreviewConnections);
    scheduleUpdate();
    scrollContainer.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);

    return () => {
      scrollContainer.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
    };
  }, [updateFactPreviewConnections]);

  
  function replaceEditorContent(nodes: Descendant[]) {
    Editor.withoutNormalizing(editor, () => {
      editor.children = nodes;

      editor.selection = {
        anchor: { path: [0, 0], offset: 0 },
        focus: { path: [0, 0], offset: 0 },
      };
    });
    setTrackedChanges([]);
    setExpandedTrackedChangeId(null);
    setDocument(nodes);
    editor.onChange();
  }  
/* 
  function getFactSearchText(fact: Fact): string {
    const subject = fact.subject;
    const object =
      fact.object !== undefined
        ? String(fact.object)
        : fact.value !== undefined
          ? String(fact.value)
          : "";

    return `${subject} ${object}`.trim();
  }
 */

function getNodeText(node: Descendant): string {
  if (Text.isText(node)) {
    return node.text;
  }

  if (SlateElement.isElement(node)) {
    return node.children
      .map((child) => getNodeText(child))
      .join("");
  }

  return "";
}

function getConflictingFact(inconsistency: Inconsistency) {
  const matchingFacts = inconsistency.facts.filter(
    (fact) =>
      normalizeSearchText(fact.subject) === normalizeSearchText(inconsistency.subject) &&
      normalizeSearchText(fact.predicate) === normalizeSearchText(inconsistency.predicate)
  );
  const candidates = matchingFacts.length > 0 ? matchingFacts : inconsistency.facts;

  return [...candidates].sort(
    (first, second) =>
      (first.source?.paragraphIndex ?? -1) -
      (second.source?.paragraphIndex ?? -1)
  ).at(-1);
}

function paragraphContainsFact(node: Descendant, fact: Inconsistency["facts"][number]): boolean {
  if (
    !SlateElement.isElement(node) ||
    (node.type !== "paragraph" && node.type !== "heading-one")
  ) {
    return false;
  }

  const text = normalizeFactMatchText(getNodeText(node));
  const subject = normalizeFactMatchText(fact.subject);
  const value = fact.object ?? fact.value;

  return subject !== "" && text.includes(subject) && factValueAppearsInText(getNodeText(node), value);
}

function getFactParagraphIndex(
  editor: Editor,
  fact: Inconsistency["facts"][number]
): number | null {
  const sourceIndex = fact.source?.paragraphIndex;

  if (
    sourceIndex !== undefined &&
    editor.children[sourceIndex] !== undefined
  ) {
    const sourceBlock = editor.children[sourceIndex];
    const sourceText = getNodeText(sourceBlock);
    const sourceStart = fact.source?.start;
    const sourceEnd = fact.source?.end;
    const hasUsableSourceOffsets =
      sourceStart !== undefined && sourceEnd !== undefined &&
      sourceStart >= 0 && sourceEnd > sourceStart && sourceEnd <= sourceText.length;
    const value = fact.object ?? fact.value;

    // The extractor's paragraph location is stronger evidence than a literal
    // subject match: prose often uses pronouns while facts use canonical names.
    if (
      paragraphContainsFact(sourceBlock, fact) ||
      hasUsableSourceOffsets ||
      factValueAppearsInText(sourceText, value)
    ) return sourceIndex;
  }

  for (let index = 0; index < editor.children.length; index += 1) {
    if (paragraphContainsFact(editor.children[index], fact)) {
      return index;
    }
  }

  return null;
}

function getInconsistentPaths(
  editor: Editor,
  inconsistencies: Inconsistency[]
): InconsistentPath[] {
  const paths = new Map<string, InconsistentPath>();

  for (const [index, inconsistency] of inconsistencies.entries()) {
    const conflictingFact = getConflictingFact(inconsistency);

    if (!conflictingFact) {
      continue;
    }

    const paragraphIndex = getFactParagraphIndex(editor, conflictingFact);

    if (paragraphIndex !== null) {
      const path = [paragraphIndex];
      const key = path.join(".");
      const severity = inconsistency.severity ?? "medium";
      const existing = paths.get(key);
      const pathInconsistency = {
        index,
        severity,
        predicate: inconsistency.predicate,
      };

      if (!existing) {
        paths.set(key, {
          path,
          severity,
          inconsistencies: [pathInconsistency],
        });
      } else {
        existing.inconsistencies.push(pathInconsistency);

        if (isMoreSevere(severity, existing.severity)) {
          existing.severity = severity;
        }
      }
    }
  }

  return Array.from(paths.values());
}

function isMoreSevere(
  candidate: InconsistencySeverity | undefined,
  current: InconsistencySeverity | undefined
): boolean {
  return (
    getSeverityRank(candidate) >
    getSeverityRank(current)
  );
}

function getSeverityRank(severity: InconsistencySeverity | undefined): number {
  return ({ low: 1, medium: 2, high: 3, critical: 4 })[severity ?? "medium"];
}

function getFactHighlightPattern(
  fact: Inconsistency["facts"][number]
): RegExp | null {
  const relationPatterns: Partial<Record<
    Inconsistency["facts"][number]["predicate"],
    string
  >> = {
    younger_than: "younger|jünger",
    older_than: "older|älter",
    sibling_of: "brother|sister|sibling|bruder|schwester|geschwister",
    parent_of: "parent|mother|father|elternteil|mutter|vater",
    child_of: "child|son|daughter|kind|sohn|tochter",
    married_to: "married|husband|wife|verheiratet|ehemann|ehefrau",
    friend_of: "friend|freund(?:in)?",
    owns: "owns|owner|besitzt|gehört",
    has: "has|hat",
  };

  const relationPattern = relationPatterns[fact.predicate];
  if (relationPattern) {
    return new RegExp(`\\b(?:${relationPattern})\\b`, "gi");
  }

  const value = fact.object ?? fact.value;
  if (value === undefined || value === null || value === "") {
    return null;
  }

  return getFactValuePattern(value);
}

function getBlockOffsetRanges(
  block: Descendant,
  paragraphIndex: number,
  startOffset: number,
  endOffset: number
): BaseRange[] {
  const fragments: BaseRange[] = [];
  let textOffset = 0;

  for (const [node, path] of SlateNode.texts(block)) {
    const nodeStart = textOffset;
    const nodeEnd = nodeStart + node.text.length;
    textOffset = nodeEnd;
    const overlapStart = Math.max(startOffset, nodeStart);
    const overlapEnd = Math.min(endOffset, nodeEnd);
    if (overlapStart >= overlapEnd) continue;
    const fullPath = [paragraphIndex, ...path];
    fragments.push({
      anchor: { path: fullPath, offset: overlapStart - nodeStart },
      focus: { path: fullPath, offset: overlapEnd - nodeStart },
    });
  }

  return fragments;
}

function getSentenceOffsets(text: string, matchStart: number, matchEnd: number) {
  const sentenceBoundary = /[.!?]/;
  let start = matchStart;
  let end = matchEnd;

  while (start > 0 && !sentenceBoundary.test(text[start - 1])) {
    start -= 1;
  }
  while (start < matchStart && /\s/.test(text[start])) {
    start += 1;
  }

  while (end < text.length && !sentenceBoundary.test(text[end])) {
    end += 1;
  }
  if (end < text.length) {
    end += 1;
  }

  return { start, end };
}

function matchBelongsToFactSentence(
  text: string,
  matchStart: number,
  matchEnd: number,
  fact: Inconsistency["facts"][number]
): boolean {
  const offsets = getSentenceOffsets(text, matchStart, matchEnd);
  const sentence = normalizeSearchText(text.slice(offsets.start, offsets.end));
  const subject = normalizeSearchText(fact.subject);

  // A repeated object or place name alone is not evidence for this fact.
  return subject === "" || sentence.includes(subject);
}

function getInconsistentTextRanges(
  editor: Editor,
  inconsistencies: Inconsistency[],
  forcedInconsistencyId?: string
): InconsistentTextRange[] {
  const ranges: InconsistentTextRange[] = [];

  for (const inconsistency of inconsistencies) {
    const inconsistencyId = forcedInconsistencyId ?? getStableInconsistencyId(inconsistency);
    const conflictFact = getConflictingFact(inconsistency);

    for (const fact of inconsistency.facts) {
      const paragraphIndex = getFactParagraphIndex(editor, fact);
      if (paragraphIndex === null) {
        continue;
      }

      const block = editor.children[paragraphIndex];
      if (!block) continue;
      const blockText = getNodeText(block);
      const pattern = getFactHighlightPattern(fact);
      const matches = pattern
        ? Array.from(blockText.matchAll(pattern)).flatMap((match) =>
            match.index === undefined || match[0].length === 0 ? [] : [{
              start: match.index,
              end: match.index + match[0].length,
            }]
          )
        : [];
      const sourceStart = fact.source?.start;
      const sourceEnd = fact.source?.end;
      if (
        matches.length === 0 &&
        fact.source?.paragraphIndex === paragraphIndex &&
        sourceStart !== undefined && sourceEnd !== undefined &&
        sourceStart >= 0 && sourceEnd > sourceStart && sourceEnd <= blockText.length
      ) {
        matches.push({ start: sourceStart, end: sourceEnd });
      }

      for (const match of matches) {
          const sentenceOffsets = getSentenceOffsets(blockText, match.start, match.end);
          const sourceParagraphMatches = fact.source?.paragraphIndex === paragraphIndex;
          if (
            !sourceParagraphMatches &&
            !matchBelongsToFactSentence(blockText, match.start, match.end, fact)
          ) continue;

          for (const sentenceRange of getBlockOffsetRanges(
            block,
            paragraphIndex,
            sentenceOffsets.start,
            sentenceOffsets.end
          )) {
            const hasSentenceRange = ranges.some((range) =>
              range.inconsistencyRole === "sentence" &&
              range.inconsistencyIds.includes(inconsistencyId) &&
              Path.equals(range.anchor.path, sentenceRange.anchor.path) &&
              range.anchor.offset === sentenceRange.anchor.offset &&
              range.focus.offset === sentenceRange.focus.offset
            );
            if (!hasSentenceRange) ranges.push({
              ...sentenceRange,
              inconsistent: true,
              inconsistencyRole: "sentence",
              inconsistencyIds: [inconsistencyId],
              conflictInconsistencyIds: [],
            });
          }

        for (const matchedRange of getBlockOffsetRanges(block, paragraphIndex, match.start, match.end)) {
          const existingRange = ranges.find((range) =>
            range.inconsistencyRole !== "sentence" &&
            Path.equals(range.anchor.path, matchedRange.anchor.path) &&
            range.anchor.offset === matchedRange.anchor.offset &&
            range.focus.offset === matchedRange.focus.offset
          );

          if (existingRange) {
            if (!existingRange.inconsistencyIds.includes(inconsistencyId)) {
              existingRange.inconsistencyIds.push(inconsistencyId);
            }

            if (fact === conflictFact) {
              if (!existingRange.conflictInconsistencyIds.includes(inconsistencyId)) {
                existingRange.conflictInconsistencyIds.push(inconsistencyId);
              }

              const wasContextRange =
                existingRange.inconsistencyRole !== "conflict";

              existingRange.inconsistencyRole = "conflict";
              if (
                wasContextRange ||
                isMoreSevere(
                  inconsistency.severity,
                  existingRange.inconsistencySeverity
                )
              ) {
                existingRange.inconsistencySeverity =
                  inconsistency.severity;
              }
            }
            continue;
          }

          ranges.push({
            ...matchedRange,
            inconsistent: true,
            inconsistencyRole:
              fact === conflictFact ? "conflict" : "context",
            inconsistencySeverity:
              fact === conflictFact
                ? inconsistency.severity
                : undefined,
            inconsistencyIds: [inconsistencyId],
            conflictInconsistencyIds:
              fact === conflictFact ? [inconsistencyId] : [],
          });
        }
      }
    }
  }

  return ranges;
}

function getCharacterInconsistentPaths(
  inconsistencies: CharacterInconsistency[],
  indexOffset: number
): InconsistentPath[] {
  const paths = new Map<number, InconsistentPath>();

  inconsistencies.forEach((inconsistency, index) => {
    const paragraphIndex = inconsistency.evidence.at(-1)?.paragraphIndex;
    if (paragraphIndex === undefined) return;
    const severity = characterSeverity(inconsistency.confidence);
    const detail = {
      index: indexOffset + index,
      severity,
      predicate: `character:${inconsistency.category}`,
    };
    const existing = paths.get(paragraphIndex);
    if (existing) {
      existing.inconsistencies.push(detail);
      if (isMoreSevere(severity, existing.severity)) existing.severity = severity;
    } else {
      paths.set(paragraphIndex, {
        path: [paragraphIndex],
        severity,
        inconsistencies: [detail],
      });
    }
  });

  return Array.from(paths.values());
}

function getCharacterInconsistentTextRanges(
  editor: Editor,
  inconsistencies: CharacterInconsistency[]
): InconsistentTextRange[] {
  const ranges: InconsistentTextRange[] = [];

  inconsistencies.forEach((inconsistency) => {
    const inconsistencyId = getStableCharacterInconsistencyId(inconsistency);
    const conflictEvidence = inconsistency.evidence.at(-1);

    inconsistency.evidence.forEach((evidence) => {
      const block = editor.children[evidence.paragraphIndex];
      if (!block) return;
      const blockText = SlateNode.string(block);
      const quoteStart = blockText.indexOf(evidence.quote);
      if (quoteStart < 0) return;
      const quoteEnd = quoteStart + evidence.quote.length;
      let textOffset = 0;

      for (const [node, path] of SlateNode.texts(block, { from: [] })) {
        const nodeStart = textOffset;
        const nodeEnd = nodeStart + node.text.length;
        textOffset = nodeEnd;
        const overlapStart = Math.max(quoteStart, nodeStart);
        const overlapEnd = Math.min(quoteEnd, nodeEnd);
        if (overlapStart >= overlapEnd) continue;
        const fullPath = [evidence.paragraphIndex, ...path];
        const isConflict = evidence === conflictEvidence;

        ranges.push({
          anchor: { path: fullPath, offset: overlapStart - nodeStart },
          focus: { path: fullPath, offset: overlapEnd - nodeStart },
          inconsistent: true,
          inconsistencyRole: isConflict ? "conflict" : "context",
          inconsistencySeverity: isConflict
            ? characterSeverity(inconsistency.confidence)
            : undefined,
          inconsistencyIds: [inconsistencyId],
          conflictInconsistencyIds: isConflict ? [inconsistencyId] : [],
        });
      }
    });
  });

  return ranges;
}

function removeInconsistencyFromRanges(
  ranges: InconsistentTextRange[],
  inconsistencyId: string
): InconsistentTextRange[] {
  return ranges.flatMap((range) => {
    if (!range.inconsistencyIds.includes(inconsistencyId)) {
      return [range];
    }

    const inconsistencyIds = range.inconsistencyIds.filter(
      (id) => id !== inconsistencyId
    );
    if (inconsistencyIds.length === 0) {
      return [];
    }

    const conflictInconsistencyIds = range.conflictInconsistencyIds.filter(
      (id) => id !== inconsistencyId
    );
    const previewInconsistencyIds = range.previewInconsistencyIds?.filter(
      (id) => id !== inconsistencyId
    );
    const sentenceInconsistencyIds = range.sentenceInconsistencyIds?.filter(
      (id) => id !== inconsistencyId
    );

    return [{
      ...range,
      inconsistencyIds,
      conflictInconsistencyIds,
      previewInconsistencyIds,
      sentenceInconsistencyIds,
      inconsistencyRole:
        conflictInconsistencyIds.length > 0
          ? "conflict"
          : sentenceInconsistencyIds && sentenceInconsistencyIds.length > 0
            ? "sentence"
            : "context",
      inconsistencySeverity:
        conflictInconsistencyIds.length > 0
          ? range.inconsistencySeverity
          : undefined,
    }];
  });
}


function deserialize(
  node: Node,
  marks: Partial<CustomText> = {}
): Descendant[] {
    // Text
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? "";

      if (!text) {
        return [];
      }

      return [
        {
          text,
          ...marks,
        },
      ];
    }

    // Kein HTML-Element
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return [];
    }

    const element = node as HTMLElement;

    // Marks übernehmen
    const currentMarks: Partial<CustomText> = {
      ...marks,
    };

    if (
      element.tagName === "STRONG" ||
      element.tagName === "B"
    ) {
      currentMarks.bold = true;
    }

    if (
      element.tagName === "EM" ||
      element.tagName === "I"
    ) {
      currentMarks.italic = true;
    }

    if (element.tagName === "U") {
      currentMarks.underline = true;
    }

    // --------------------------------
    // LINK
    // --------------------------------

    if (element.tagName === "A") {
      const url = element.getAttribute("href");

      console.log("FOUND LINK:", {
        url,
        text: element.textContent,
        html: element.outerHTML,
      });

      if (!url) {
        return Array.from(element.childNodes).flatMap(
          (child) => deserialize(child, currentMarks)
        );
      }

      const linkChildren: CustomText[] =
        Array.from(element.childNodes)
          .flatMap((child) =>
            deserialize(child, currentMarks)
          )
          .filter(
            (child): child is CustomText =>
              "text" in child
          );

      console.log("LINK CHILDREN:", linkChildren);

      return [
        {
          type: "link",
          url,
          children:
            linkChildren.length > 0
              ? linkChildren
              : [{ text: element.textContent ?? "" }],
        },
      ];
    }

    // --------------------------------
    // Normale Kinder
    // --------------------------------

    const children = Array.from(element.childNodes)
      .flatMap((child) =>
        deserialize(child, currentMarks)
      );

    // --------------------------------
    // H1
    // --------------------------------

    if (element.tagName === "H1") {
      const textChildren = children.filter(
        (child): child is CustomText =>
          "text" in child
      );

      return [
        {
          type: "heading-one",
          children:
            textChildren.length > 0
              ? textChildren
              : [{ text: "" }],
        },
      ];
    }

    // --------------------------------
    // P / DIV
    // --------------------------------

    if (
      element.tagName === "P" ||
      element.tagName === "DIV"
    ) {
      return [
        {
          type: "paragraph",
          children:
            children.length > 0
              ? (children as Array<
                  CustomText | LinkElement
                >)
              : [{ text: "" }],
        },
      ];
    }

    // --------------------------------
    // Andere Elemente
    // --------------------------------

    return children;
  }

  function htmlToSlate(html: string): Descendant[] {
    const parser = new DOMParser();
    const document = parser.parseFromString(html, "text/html");

    return Array.from(document.body.childNodes)
    .flatMap((node) => deserialize(node));
    }

  function handleHtmlLoad(html: string) {
    useExampleFactsRef.current = false;
    exampleDocumentTextRef.current = "";
    const nodes = htmlToSlate(html);

    if (nodes.length === 0) {
        nodes.push({
        type: "paragraph",
        children: [{ text: "" }],
        });
    }
    replaceEditorContent(nodes);
    logStudyEvent("document_loaded", {
      source: "file",
      format: "html_or_docx",
      character_count: getEditorText(nodes).length,
    });
    
    }

  function handleFileLoad(text: string) {
    useExampleFactsRef.current = false;
    exampleDocumentTextRef.current = "";
    const paragraphs: ParagraphElement[] = text
      .split(/\r?\n/)
      .map((line) => ({
        type: "paragraph",
        children: [{ text: line }],
      }));

    replaceEditorContent(paragraphs);
    logStudyEvent("document_loaded", {
      source: "file",
      format: "plain_text",
      character_count: text.length,
    });
    console.log("AFTER FILE LOAD", {
      children: editor.children,
      selection: editor.selection,
    });
  }

  function handleExampleLoad() {
    const paragraphs: ParagraphElement[] = EXAMPLE_TEXT
      .split(/\r?\n\s*\r?\n/)
      .map((paragraph) => ({
        type: "paragraph",
        children: [{ text: paragraph.trim() }],
      }));

    useExampleFactsRef.current = true;
    exampleDocumentTextRef.current = getEditorText(paragraphs);
    setAnalysis(null);
    setInconsistencies([]);
    setCharacterInconsistencies([]);
    setCharacterAnalysisError("");
    setInconsistentPaths([]);
    setInconsistentRanges([]);
    setActiveInconsistencyId(null);
    setSelectedInconsistencyId(null);
    selectedInconsistencyIdRef.current = null;
    resolvedInconsistencyIdsRef.current.clear();
    setJitterSuppressedIds(new Set());
    replaceEditorContent(paragraphs);
    logStudyEvent("document_loaded", {
      source: "example",
      format: "plain_text",
      character_count: EXAMPLE_TEXT.length,
    });
  }

  async function handleAnalyze() {
    const analysisStartedAt = performance.now();
    let analysisOutcome = "completed";
    logStudyEvent("analysis_started", {
      character_count: getEditorText(editor.children).length,
    });
    setAnalyzing(true);
    setAnalysisError("");
    resolvedInconsistencyIdsRef.current.clear();

    try {
      const text = getEditorText(editor.children);
      console.log('editor-text: ',text);
      if (!text.trim()) {
        analysisOutcome = "empty_document";
        setAnalysisError("The editor is empty.");
        return;
      }

      const cacheKey = `${JSON.stringify(context)}\n${text}`;
      const cached = useExampleFactsRef.current
        ? undefined
        : analysisCacheRef.current.get(cacheKey);
      if (cached) {
        const cachedPaths = getInconsistentPaths(editor, cached.factInconsistencies);
        setAnalysis(cached.result);
        setInconsistencies(cached.factInconsistencies);
        setCharacterInconsistencies(cached.characterInconsistencies);
        setCharacterAnalysisError("");
        setHiddenInconsistencyIds(new Set());
        setInconsistentPaths([
          ...cachedPaths,
          ...getCharacterInconsistentPaths(
            cached.characterInconsistencies,
            cached.factInconsistencies.length
          ),
        ]);
        setInconsistentRanges([
          ...getInconsistentTextRanges(editor, cached.factInconsistencies),
          ...getCharacterInconsistentTextRanges(editor, cached.characterInconsistencies),
        ]);
        console.log(
          "Character inconsistencies with editor paths (cache):",
          cached.characterInconsistencies.map((inconsistency, index) => ({
            index,
            character: inconsistency.character,
            category: inconsistency.category,
            kind: inconsistency.kind,
            confidence: inconsistency.confidence,
            message: inconsistency.message,
            evidenceParagraphs: inconsistency.evidence.map((item) => item.paragraphIndex),
            evidence: inconsistency.evidence,
            paths: getCharacterInconsistentPaths([inconsistency], cached.factInconsistencies.length + index)
              .map(({ path }) => path),
          }))
        );
        return;
      }
     
      let result: FactExtraction;

      if (useExampleFactsRef.current) {
        await new Promise((resolve) => window.setTimeout(resolve, 3500));
        result = EXAMPLE_FACTS;
      } else {
        result = await extractFacts(text, context);
      }

      setAnalysis(result);

      const foundInconsistencies =
        checkConsistency(result);

      setInconsistencies(foundInconsistencies);
      setHiddenInconsistencyIds(new Set());

      const paths = getInconsistentPaths(
        editor,
        foundInconsistencies
      );

      console.log(
        "Inconsistencies with editor paths:",
        foundInconsistencies.map((inconsistency, index) => ({
          index,
          inconsistency,
          paths: getInconsistentPaths(editor, [inconsistency]).map(({ path }) => path),
        }))
      );

      setInconsistentPaths(paths);
      setInconsistentRanges(
        getInconsistentTextRanges(editor, foundInconsistencies)
      );

      try {
        const foundCharacterInconsistencies = useExampleFactsRef.current
          ? EXAMPLE_CHARACTER_INCONSISTENCIES
          : await checkCharacterConsistency(text);
        setCharacterInconsistencies(foundCharacterInconsistencies);
        setCharacterAnalysisError("");
        console.log(
          "Character inconsistencies with editor paths:",
          foundCharacterInconsistencies.map((inconsistency, index) => ({
            index,
            character: inconsistency.character,
            category: inconsistency.category,
            kind: inconsistency.kind,
            confidence: inconsistency.confidence,
            message: inconsistency.message,
            evidenceParagraphs: inconsistency.evidence.map((item) => item.paragraphIndex),
            evidence: inconsistency.evidence,
            paths: getCharacterInconsistentPaths([inconsistency], foundInconsistencies.length + index)
              .map(({ path }) => path),
          }))
        );
        setInconsistentPaths([
          ...paths,
          ...getCharacterInconsistentPaths(
            foundCharacterInconsistencies,
            foundInconsistencies.length
          ),
        ]);
        setInconsistentRanges([
          ...getInconsistentTextRanges(editor, foundInconsistencies),
          ...getCharacterInconsistentTextRanges(editor, foundCharacterInconsistencies),
        ]);
        if (!useExampleFactsRef.current) {
          analysisCacheRef.current.set(cacheKey, {
            result,
            factInconsistencies: foundInconsistencies,
            characterInconsistencies: foundCharacterInconsistencies,
          });
          if (analysisCacheRef.current.size > 10) {
            const oldestKey = analysisCacheRef.current.keys().next().value;
            if (oldestKey !== undefined) analysisCacheRef.current.delete(oldestKey);
          }
        }
      } catch (characterError) {
        console.error(characterError);
        setCharacterInconsistencies([]);
        setCharacterAnalysisError(
          characterError instanceof Error
            ? characterError.message
            : "Character consistency analysis failed."
        );
      }

    } catch (error) {
      analysisOutcome = "error";
      console.error(error);
      logStudyEvent("error", {
        operation: "analysis",
        message: error instanceof Error ? error.message.slice(0, 500) : "Unknown error",
      });

      setAnalysisError(
        error instanceof Error
          ? error.message
          : "Unknown error"
      );
    } finally {
      setAnalyzing(false);
      logStudyEvent("analysis_finished", {
        outcome: analysisOutcome,
        duration_ms: Math.round(performance.now() - analysisStartedAt),
      });
    }
  }

  function handleToggleAllInconsistencies() {
    const allIds = navigationItems.map(({ id }) => id);
    const allAreHidden = allIds.length > 0 && allIds.every(
      (id) => hiddenInconsistencyIds.has(id)
    );
    setHiddenInconsistencyIds(allAreHidden
      ? new Set()
      : new Set(allIds)
    );
    setActiveInconsistencyId(null);
    setSelectedInconsistencyId(null);
    selectedInconsistencyIdRef.current = null;
    setJitterSuppressedIds(new Set());
    setOffscreenAbove([]);
    setOffscreenBelow([]);
    setOffscreenFactPreviews([]);
  }

  function handleToggleInconsistency(inconsistencyId: string) {
    const isStory = inconsistencies.some(
      (item) => getStableInconsistencyId(item) === inconsistencyId
    );
    const categoryIsHidden = hiddenInconsistencyCategories.has(
      isStory ? "story" : "character"
    );
    const isCurrentlyHidden = effectiveHiddenInconsistencyIds.has(inconsistencyId);
    const willHide = !isCurrentlyHidden;

    if (categoryIsHidden) {
      setCategoryVisibleInconsistencyIds((current) => {
        const next = new Set(current);
        if (isCurrentlyHidden) next.add(inconsistencyId);
        else next.delete(inconsistencyId);
        return next;
      });
      if (isCurrentlyHidden) {
        setHiddenInconsistencyIds((current) => {
          const next = new Set(current);
          next.delete(inconsistencyId);
          return next;
        });
      }
    } else {
    setHiddenInconsistencyIds((current) => {
      const next = new Set(current);
      if (next.has(inconsistencyId)) next.delete(inconsistencyId);
      else next.add(inconsistencyId);
      return next;
    });
    }
    if (willHide && selectedInconsistencyId === inconsistencyId) {
      setActiveInconsistencyId(null);
      setSelectedInconsistencyId(null);
      selectedInconsistencyIdRef.current = null;
    }
    setOffscreenAbove([]);
    setOffscreenBelow([]);
    setOffscreenFactPreviews([]);
  }

  function toggleInconsistencyCategory(category: "story" | "character") {
    const categoryIds = category === "story"
      ? inconsistencies.map(getStableInconsistencyId)
      : characterInconsistencies.map(getStableCharacterInconsistencyId);
    const existingTimeout = categoryTransitionTimeoutsRef.current.get(category);
    if (existingTimeout !== undefined) window.clearTimeout(existingTimeout);

    setCategoryVisibleInconsistencyIds((current) => {
      const next = new Set(current);
      categoryIds.forEach((id) => next.delete(id));
      return next;
    });

    if (!hiddenInconsistencyCategories.has(category)) {
      setTransitionHiddenInconsistencyIds((current) => new Set([...current, ...categoryIds]));
      const timeout = window.setTimeout(() => {
        setHiddenInconsistencyCategories((current) => new Set(current).add(category));
        setTransitionHiddenInconsistencyIds((current) => {
          const next = new Set(current);
          categoryIds.forEach((id) => next.delete(id));
          return next;
        });
        categoryTransitionTimeoutsRef.current.delete(category);
      }, 270);
      categoryTransitionTimeoutsRef.current.set(category, timeout);
    } else {
      setHiddenInconsistencyCategories((current) => {
        const next = new Set(current);
        next.delete(category);
        return next;
      });
      setTransitionHiddenInconsistencyIds((current) => new Set([...current, ...categoryIds]));
      requestAnimationFrame(() => requestAnimationFrame(() => {
        setTransitionHiddenInconsistencyIds((current) => {
          const next = new Set(current);
          categoryIds.forEach((id) => next.delete(id));
          return next;
        });
      }));
    }
    setOffscreenAbove([]);
    setOffscreenBelow([]);
    setOffscreenFactPreviews([]);
  }

  function getDefaultSuggestion(inconsistency: Inconsistency): string {
    const orderedFacts = [...inconsistency.facts].sort(
      (first, second) =>
        (first.source?.paragraphIndex ?? Number.MAX_SAFE_INTEGER) -
        (second.source?.paragraphIndex ?? Number.MAX_SAFE_INTEGER)
    );
    const baseFact = orderedFacts[0];
    const baseValue = baseFact?.object ?? baseFact?.value;

    return inconsistency.category === "exclusive_fact" &&
      baseValue !== undefined &&
      baseValue !== null
      ? String(baseValue)
      : "";
  }

  function getAllAffectedFacts(inconsistency: Inconsistency) {
    return [...inconsistency.facts].sort(
      (first, second) =>
        (first.source?.paragraphIndex ?? Number.MAX_SAFE_INTEGER) -
        (second.source?.paragraphIndex ?? Number.MAX_SAFE_INTEGER)
    );
  }

  function findDependentPassage(range: BaseRange): { range: BaseRange; text: string } | null {
    if (!Path.equals(range.anchor.path, range.focus.path)) return null;
    const [node] = Editor.node(editor, range.anchor.path);
    if (!Text.isText(node)) return null;
    const currentSentence = getSentenceOffsets(
      node.text,
      range.anchor.offset,
      range.focus.offset
    );
    const nextStart = node.text.slice(currentSentence.end).search(/\S/);
    if (nextStart < 0) return null;
    const absoluteStart = currentSentence.end + nextStart;
    const nextSentence = getSentenceOffsets(node.text, absoluteStart, absoluteStart + 1);
    const text = node.text.slice(nextSentence.start, nextSentence.end).trim();
    if (!text || !/\b(?:so|therefore|thus|hence|consequently|both|this|that|these|those|former|latter|daher|deshalb|somit|folglich|beide|dies|diese|dieser|jenes|jener)\b/i.test(text)) {
      return null;
    }
    const leadingWhitespace = node.text.slice(nextSentence.start, nextSentence.end).search(/\S/);
    const start = nextSentence.start + Math.max(0, leadingWhitespace);
    return {
      range: {
        anchor: { path: range.anchor.path, offset: start },
        focus: { path: range.anchor.path, offset: nextSentence.end },
      },
      text,
    };
  }

  function getAffectedFactPositions(inconsistency: Inconsistency): AffectedFactPosition[] {
    const positions = new Map<string, AffectedFactPosition>();

    for (const fact of getAllAffectedFacts(inconsistency)) {
      const paragraphIndex = getFactParagraphIndex(editor, fact);
      const pattern = getFactHighlightPattern(fact);
      if (paragraphIndex === null || !pattern) continue;

      for (const [node, path] of SlateNode.texts(editor)) {
        if (path[0] !== paragraphIndex || node.changeType || node.confirmedCorrect) continue;
        for (const match of node.text.matchAll(pattern)) {
          if (match.index === undefined || match[0].length === 0) continue;
          const sourceParagraphMatches = fact.source?.paragraphIndex === paragraphIndex;
          if (!sourceParagraphMatches && !matchBelongsToFactSentence(
            node.text,
            match.index,
            match.index + match[0].length,
            fact
          )) continue;
          const range: BaseRange = {
            anchor: { path, offset: match.index },
            focus: { path, offset: match.index + match[0].length },
          };
          const sentence = getSentenceOffsets(
            node.text,
            match.index,
            match.index + match[0].length
          );
          const previewText = node.text
            .slice(sentence.start, sentence.end)
            .trim();
          positions.set(`${path.join(".")}:${match.index}:${match.index + match[0].length}`, {
            fact,
            range,
            previewText: previewText || match[0],
          });
        }
      }
    }

    const inconsistencyId = getStableInconsistencyId(inconsistency);
    const dependentPositions = dependentPassages.flatMap((passage) => {
      if (passage.inconsistencyId !== inconsistencyId) return [];
      const range = passage.rangeRef.current;
      if (!range) return [];
      try {
        const containsHandledText = Array.from(Editor.nodes(editor, {
          at: range,
          match: Text.isText,
        })).some(([node]) =>
          Text.isText(node) && Boolean(node.changeType || node.confirmedCorrect)
        );
        if (containsHandledText) return [];
        const currentText = Editor.string(editor, range).trim();
        if (!currentText || normalizeSearchText(currentText) !== normalizeSearchText(passage.text)) {
          return [];
        }
      } catch {
        return [];
      }
      return [{ fact: passage.fact, range, previewText: passage.text }];
    });

    const mergedPositions = Array.from(positions.values());
    dependentPositions.forEach((dependentPosition) => {
      const isDuplicate = mergedPositions.some((existingPosition) => {
        const samePassageText = Boolean(
          existingPosition.previewText &&
          dependentPosition.previewText &&
          normalizeSearchText(existingPosition.previewText) ===
            normalizeSearchText(dependentPosition.previewText)
        );
        if (samePassageText) return true;
        try {
          return Range.intersection(existingPosition.range, dependentPosition.range) !== null;
        } catch {
          return false;
        }
      });
      if (!isDuplicate) mergedPositions.push(dependentPosition);
    });

    return mergedPositions.filter((position) =>
      !confirmedPositionKeys.has(getAffectedPositionKey(inconsistency, position))
    ).sort((first, second) => {
      const pathOrder = Path.compare(first.range.anchor.path, second.range.anchor.path);
      return pathOrder !== 0
        ? pathOrder
        : first.range.anchor.offset - second.range.anchor.offset;
    });
  }

  function getAffectedPositionKey(
    inconsistency: Inconsistency,
    position: AffectedFactPosition
  ): string {
    const { anchor, focus } = position.range;
    return `${getStableInconsistencyId(inconsistency)}:${anchor.path.join(".")}:${anchor.offset}:${focus.path.join(".")}:${focus.offset}`;
  }

  // Slate can emit its value change after a direct replacement has queued the
  // newly discovered dependent passage. That recalculation still sees the
  // previous React state and can overwrite the passage's decoration. Re-apply
  // valid dependent ranges once both the document and passage state settled.
  useEffect(() => {
    if (dependentPassages.length === 0) return;

    const dependentRanges = dependentPassages.flatMap((passage): InconsistentTextRange[] => {
      const range = passage.rangeRef.current;
      if (!range) return [];

      try {
        const containsHandledText = Array.from(Editor.nodes(editor, {
          at: range,
          match: Text.isText,
        })).some(([node]) =>
          Text.isText(node) && Boolean(node.changeType || node.confirmedCorrect)
        );
        const currentText = Editor.string(editor, range).trim();
        if (
          containsHandledText ||
          !currentText ||
          normalizeSearchText(currentText) !== normalizeSearchText(passage.text)
        ) return [];
      } catch {
        return [];
      }

      const sourceInconsistency = inconsistencies.find(
        (item) => getStableInconsistencyId(item) === passage.inconsistencyId
      );
      return getRangeTextFragments(range).map((fragment) => ({
        ...fragment,
        inconsistent: true,
        inconsistencyRole: "conflict",
        inconsistencySeverity: sourceInconsistency?.severity,
        inconsistencyIds: [passage.inconsistencyId],
        conflictInconsistencyIds: [passage.inconsistencyId],
      }));
    });

    if (dependentRanges.length === 0) return;

    setInconsistentRanges((current) => {
      const existingKeys = new Set(current.map((range) =>
        `${range.inconsistencyIds.join(" ")}:${range.anchor.path.join(".")}:${range.anchor.offset}:${range.focus.path.join(".")}:${range.focus.offset}`
      ));
      const missingRanges = dependentRanges.filter((range) => {
        const key = `${range.inconsistencyIds.join(" ")}:${range.anchor.path.join(".")}:${range.anchor.offset}:${range.focus.path.join(".")}:${range.focus.offset}`;
        if (existingKeys.has(key)) return false;
        existingKeys.add(key);
        return true;
      });
      return missingRanges.length > 0 ? [...current, ...missingRanges] : current;
    });
  }, [dependentPassages, document, inconsistencies]);

  useEffect(() => {
    if (successfulInconsistencyIdRef.current) return;

    const completedFact = inconsistencies.find((inconsistency) => {
      const id = getStableInconsistencyId(inconsistency);
      const changes = trackedChanges.filter(
        (change) => getStableInconsistencyId(change.inconsistency) === id
      );
      return changes.length > 0 &&
        getAffectedFactPositions(inconsistency).length === 0;
    });
    if (completedFact) {
      const id = getStableInconsistencyId(completedFact);
      setSuccessfulInconsistencyId(id);
      successfulInconsistencyIdRef.current = id;
      setPendingResolvedInconsistencies(
        inconsistencies.filter((item) => getStableInconsistencyId(item) !== id)
      );
      Transforms.deselect(editor);
      return;
    }

    const completedCharacter = characterInconsistencies.find((inconsistency) => {
      const id = getStableCharacterInconsistencyId(inconsistency);
      return inconsistency.evidence.length > 0 && inconsistency.evidence.every(
        (_, evidenceIndex) => handledCharacterEvidenceKeys.has(`${id}:${evidenceIndex}`)
      );
    });
    if (completedCharacter) {
      const id = getStableCharacterInconsistencyId(completedCharacter);
      setSuccessfulInconsistencyId(id);
      successfulInconsistencyIdRef.current = id;
      setPendingResolvedCharacterInconsistencies(
        characterInconsistencies.filter(
          (item) => getStableCharacterInconsistencyId(item) !== id
        )
      );
      Transforms.deselect(editor);
    }
  }, [document, trackedChanges, handledCharacterEvidenceKeys, inconsistencies, characterInconsistencies]);

  function confirmAffectedPosition(
    inconsistency: Inconsistency,
    position: AffectedFactPosition
  ) {
    const wasLastOpenPosition = getAffectedFactPositions(inconsistency).length === 1;
    const positionKey = getAffectedPositionKey(inconsistency, position);
    const [node] = Editor.node(editor, position.range.anchor.path);
    if (!Text.isText(node)) return;
    const sentence = getSentenceOffsets(
      node.text,
      position.range.anchor.offset,
      position.range.focus.offset
    );
    const original = node.text.slice(
      position.range.anchor.offset,
      position.range.focus.offset
    );
    const changeId = `tracked-change-${nextTrackedChangeId.current++}`;
    const affectedRangeRef = Editor.rangeRef(editor, position.range, { affinity: "outward" });

    Transforms.setNodes<CustomText>(
      editor,
      { changeId, confirmedCorrect: true, changeAccepted: true },
      { at: position.range, match: Text.isText, split: true }
    );

    setTrackedChanges((changes) => [...changes, {
      id: changeId,
      inconsistency,
      source: "confirmed",
      confirmedPositionKey: positionKey,
      replacement: original,
      replacedValues: [original],
      occurrenceCount: 1,
      paragraphIndices: [position.range.anchor.path[0]],
      affectedRangeRefs: [affectedRangeRef],
      accepted: true,
      contexts: [{
        before: node.text.slice(sentence.start, position.range.anchor.offset),
        original,
        replacement: original,
        after: node.text.slice(position.range.focus.offset, sentence.end),
        changed: false,
      }],
    }]);
    setExpandedTrackedChangeId(changeId);
    setConfirmedPositionKeys((current) => new Set(current).add(positionKey));
    if (suggestionTarget === inconsistency) {
      setSuggestionTarget(null);
      setSuggestionDraft("");
    }
    setDocument([...editor.children]);

    if (wasLastOpenPosition) {
      const inconsistencyId = getStableInconsistencyId(inconsistency);
      setSuccessfulInconsistencyId(inconsistencyId);
      successfulInconsistencyIdRef.current = inconsistencyId;
      setPendingResolvedInconsistencies(
        inconsistencies.filter((item) => getStableInconsistencyId(item) !== inconsistencyId)
      );
      Transforms.deselect(editor);
      setActiveInconsistencyId(inconsistencyId);
      setSelectedInconsistencyId(inconsistencyId);
      selectedInconsistencyIdRef.current = inconsistencyId;
    }
  }

  function openSuggestionEditor(inconsistency: Inconsistency, positionIndex?: number) {
    const positions = getAffectedFactPositions(inconsistency);
    setSuggestionTarget(inconsistency);
    setSuggestionDraft(getDefaultSuggestion(inconsistency));
    setSuggestionMode("replace");
    setSelectedSuggestionFacts(new Set(
      positionIndex === undefined ? positions.map((_, index) => index) : [positionIndex]
    ));
  }

  function navigateToAffectedPosition(
    inconsistency: Inconsistency,
    position: AffectedFactPosition
  ) {
    const inconsistencyId = getStableInconsistencyId(inconsistency);
    setActiveInconsistencyId(inconsistencyId);
    setSelectedInconsistencyId(inconsistencyId);
    selectedInconsistencyIdRef.current = inconsistencyId;
    // This action is navigation, not editing. Keeping a Slate selection here
    // leaves an inactive grey browser selection over the newly detected range
    // and visually hides its inconsistency decoration.
    Transforms.deselect(editor);
    requestAnimationFrame(() => {
      try {
        const domRange = ReactEditor.toDOMRange(editor, position.range);
        const element = domRange.startContainer.parentElement;
        element?.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
      } catch {
        // The position may have changed between rendering and clicking.
      }
    });
  }

  function handleSuggestChange(
    inconsistency: Inconsistency,
    requestedReplacement: string,
    selectedFactIndices: ReadonlySet<number>
  ) {
    const replacement = requestedReplacement.trim();

    if (!replacement) {
      return;
    }

    const allPositions = getAffectedFactPositions(inconsistency);
    const targetPositions = allPositions.filter((_, index) =>
      selectedFactIndices.has(index)
    );
    const newlyDependentPassages = targetPositions.flatMap(({ fact, range }) => {
      const dependent = findDependentPassage(range);
      if (!dependent) return [];
      return [{
        inconsistencyId: getStableInconsistencyId(inconsistency),
        fact,
        rangeRef: Editor.rangeRef(editor, dependent.range, { affinity: "outward" }),
        text: dependent.text,
      } satisfies DependentPassage];
    });
    let affectedRangeRefs: RangeRef[] = [];
    const ranges = new Map<string, BaseRange>();
    const replacedValues = new Set<string>();

    for (const { fact, range: factRange } of targetPositions) {
      replacedValues.add(String(fact.object ?? fact.value));
      const rangeKey = `${factRange.anchor.path.join(".")}:${factRange.anchor.offset}:${factRange.focus.offset}`;
      ranges.set(rangeKey, factRange);
    }

    const occurrences = Array.from(ranges.values()).sort((first, second) => {
      const pathOrder = Path.compare(second.anchor.path, first.anchor.path);
      return pathOrder !== 0
        ? pathOrder
        : second.anchor.offset - first.anchor.offset;
    });

    if (occurrences.length === 0) {
      return;
    }

    const changeContexts = targetPositions.flatMap(({ range }) => {
      const [node] = Editor.node(editor, range.anchor.path);
      if (!Text.isText(node) || !Path.equals(range.anchor.path, range.focus.path)) return [];
      const sentence = getSentenceOffsets(node.text, range.anchor.offset, range.focus.offset);
      return [{
        before: node.text.slice(sentence.start, range.anchor.offset),
        original: node.text.slice(range.anchor.offset, range.focus.offset),
        replacement,
        after: node.text.slice(range.focus.offset, sentence.end),
        changed: true,
      }];
    });

    // Track only ranges that this concrete change actually edits. Using all
    // ranges of the inconsistency would also highlight unchanged occurrences
    // of the replacement text elsewhere in the same paragraph.
    affectedRangeRefs = occurrences.map((range) =>
      Editor.rangeRef(editor, range, { affinity: "outward" })
    );

    const changeId = `tracked-change-${nextTrackedChangeId.current++}`;

    Editor.withoutNormalizing(editor, () => {
      for (const range of occurrences) {
        const insertionPoint = Editor.pointRef(editor, range.focus, {
          affinity: "forward",
        });

        Transforms.setNodes<CustomText>(
          editor,
          { changeId, changeType: "deletion", changeAccepted: true },
          { at: range, match: Text.isText, split: true }
        );

        const point = insertionPoint.unref();
        if (point) {
          Transforms.insertNodes<CustomText>(
            editor,
            { text: replacement, changeId, changeType: "insertion", changeAccepted: true },
            { at: point }
          );
        }
      }
    });

    /*
     * Die ursprünglichen RangeRefs zeigen auf den ersetzten (gelöschten)
     * Text. Beim späteren Entfernen dieses Knotens kann dessen Range auf null
     * kollabieren. Deshalb merken wir zusätzlich jeden neu eingefügten Knoten.
     * So bleibt z. B. die neue "28" selbst dann markierbar, wenn im gleichen
     * Satz noch eine weitere Inkonsistenz dekoriert wird.
     */
    for (const [, path] of Editor.nodes(editor, {
      at: [],
      match: (node) =>
        Text.isText(node) &&
        node.changeId === changeId &&
        node.changeType === "insertion",
    })) {
      affectedRangeRefs.push(
        Editor.rangeRef(editor, Editor.range(editor, path), {
          affinity: "outward",
        })
      );
    }

    setTrackedChanges((changes) => [
      ...changes,
      {
        id: changeId,
        inconsistency,
        replacement,
        replacedValues: Array.from(replacedValues),
        occurrenceCount: occurrences.length,
        paragraphIndices: Array.from(new Set(
          occurrences.map((range) => range.anchor.path[0])
        )),
        affectedRangeRefs,
        accepted: true,
        contexts: changeContexts,
      },
    ]);
    logStudyEvent("suggestion_accepted", {
      inconsistency_id: getStableInconsistencyId(inconsistency),
      source: "direct",
      occurrence_count: occurrences.length,
      replacement_character_count: replacement.length,
    });
    if (newlyDependentPassages.length > 0) {
      setDependentPassages((current) => {
        const keys = new Set(current.flatMap((passage) => {
          const range = passage.rangeRef.current;
          return range ? [`${passage.inconsistencyId}:${range.anchor.path.join(".")}:${range.anchor.offset}:${range.focus.offset}`] : [];
        }));
        return [...current, ...newlyDependentPassages.filter((passage) => {
          const range = passage.rangeRef.current;
          const key = range
            ? `${passage.inconsistencyId}:${range.anchor.path.join(".")}:${range.anchor.offset}:${range.focus.offset}`
            : "";
          if (!range || keys.has(key)) {
            passage.rangeRef.unref();
            return false;
          }
          keys.add(key);
          return true;
        })];
      });
      setInconsistentRanges((current) => {
        const existingKeys = new Set(current.map((range) =>
          `${range.inconsistencyIds.join(" ")}:${range.anchor.path.join(".")}:${range.anchor.offset}:${range.focus.path.join(".")}:${range.focus.offset}`
        ));
        const dependentRanges = newlyDependentPassages.flatMap((passage) => {
          const range = passage.rangeRef.current;
          if (!range) return [];
          const key = `${passage.inconsistencyId}:${range.anchor.path.join(".")}:${range.anchor.offset}:${range.focus.path.join(".")}:${range.focus.offset}`;
          if (existingKeys.has(key)) return [];
          existingKeys.add(key);
          return getRangeTextFragments(range).map((fragment) => ({
            ...fragment,
            inconsistent: true as const,
            inconsistencyRole: "conflict" as const,
            inconsistencySeverity: inconsistency.severity,
            inconsistencyIds: [passage.inconsistencyId],
            conflictInconsistencyIds: [passage.inconsistencyId],
          }));
        });
        return [...current, ...dependentRanges];
      });
    }
    setExpandedTrackedChangeId(changeId);
    setSuggestionTarget(null);
    setSuggestionDraft("");
    setDocument([...editor.children]);
  }


  function beginFreeEditing(inconsistency: Inconsistency) {
    const restoreScrollPosition = captureEditorScrollPosition();
    const selectedPositions = getAffectedFactPositions(inconsistency)
      .filter((_, index) => selectedSuggestionFacts.has(index));
    const paragraphIndices = Array.from(new Set(
      selectedPositions
        .map((position) => position.range.anchor.path[0])
        .filter((index): index is number => index !== null)
    ));

    if (paragraphIndices.length === 0) return;
    freeEditRangeRefs.current.forEach((rangeRef) => rangeRef.unref());
    freeEditChangedRangeRefs.current.forEach((rangeRef) => rangeRef.unref());
    freeEditChangedRangeRefs.current = [];
    freeEditDocumentSnapshotRef.current = editor.children.map(getNodeText);
    freeEditRangeRefs.current = selectedPositions.map(({ range }) =>
      Editor.rangeRef(editor, range, { affinity: "outward" })
    );
    freeEditInconsistencyIdRef.current = getStableInconsistencyId(inconsistency);
    setFreeEditParagraphs(paragraphIndices);
    setFreeEditInconsistency(inconsistency);
    Transforms.select(editor, selectedPositions[0].range);
    ReactEditor.focus(editor);
    restoreScrollPosition();
  }

  function beginCharacterFreeEditing(
    inconsistency: CharacterInconsistency,
    evidenceIndex: number
  ) {
    const restoreScrollPosition = captureEditorScrollPosition();
    const selectedEvidence = inconsistency.evidence[evidenceIndex];
    if (!selectedEvidence) return;
    const paragraphIndices = Array.from(new Set(
      [selectedEvidence.paragraphIndex]
    ));
    if (paragraphIndices.length === 0) return;

    freeEditRangeRefs.current.forEach((rangeRef) => rangeRef.unref());
    freeEditChangedRangeRefs.current.forEach((rangeRef) => rangeRef.unref());
    freeEditChangedRangeRefs.current = [];
    freeEditDocumentSnapshotRef.current = editor.children.map(getNodeText);
    freeEditDocumentNodesSnapshotRef.current = structuredClone(editor.children);
    freeEditRangeRefs.current = getCharacterInconsistentTextRanges(editor, [inconsistency])
      .filter((range) => range.anchor.path[0] === selectedEvidence.paragraphIndex)
      .map((range) => Editor.rangeRef(editor, range, { affinity: "outward" }));
    freeEditInconsistencyIdRef.current = getStableCharacterInconsistencyId(inconsistency);
    setFreeEditParagraphs(paragraphIndices);
    setFreeEditCharacterInconsistency(inconsistency);
    setFreeEditCharacterEvidenceIndices([evidenceIndex]);
    setFreeEditInconsistency(null);
    setActiveInconsistencyId(freeEditInconsistencyIdRef.current);
    setSelectedInconsistencyId(freeEditInconsistencyIdRef.current);
    Transforms.select(editor, Editor.start(editor, [paragraphIndices[0]]));
    ReactEditor.focus(editor);
    restoreScrollPosition();
  }

  function cancelFreeEditing() {
    const restoreScrollPosition = captureEditorScrollPosition();
    freeEditRangeRefs.current.forEach((rangeRef) => rangeRef.unref());
    freeEditRangeRefs.current = [];
    freeEditChangedRangeRefs.current.forEach((rangeRef) => rangeRef.unref());
    freeEditChangedRangeRefs.current = [];
    freeEditDocumentSnapshotRef.current = [];
    freeEditInconsistencyIdRef.current = null;
    setFreeEditInconsistency(null);
    setFreeEditCharacterInconsistency(null);
    setFreeEditCharacterEvidenceIndices([]);
    setFreeEditParagraphs([]);
    restoreScrollPosition();
  }

  function navigateToCharacterEvidence(
    inconsistency: CharacterInconsistency,
    evidenceIndex: number
  ) {
    const evidence = inconsistency.evidence[evidenceIndex];
    const block = evidence ? editor.children[evidence.paragraphIndex] : undefined;
    if (!evidence || !block) return;
    const quoteStart = SlateNode.string(block).indexOf(evidence.quote);
    if (quoteStart < 0) return;
    const range = getBlockTextRange(
      evidence.paragraphIndex,
      quoteStart,
      quoteStart + evidence.quote.length
    );
    if (!range) return;

    const issueId = getStableCharacterInconsistencyId(inconsistency);
    setActiveInconsistencyId(issueId);
    setSelectedInconsistencyId(issueId);
    selectedInconsistencyIdRef.current = issueId;
    Transforms.select(editor, range);
    ReactEditor.focus(editor);
    requestAnimationFrame(() => {
      try {
        const domRange = ReactEditor.toDOMRange(editor, range);
        domRange.startContainer.parentElement?.scrollIntoView({
          behavior: "smooth",
          block: "center",
          inline: "nearest",
        });
      } catch (error) {
        console.error("Navigation zur Character-Passage fehlgeschlagen:", error);
      }
    });
  }

  function confirmCharacterEvidence(
    inconsistency: CharacterInconsistency,
    evidenceIndex: number
  ) {
    const evidence = inconsistency.evidence[evidenceIndex];
    const block = evidence ? editor.children[evidence.paragraphIndex] : undefined;
    if (!evidence || !block) return;
    const quoteStart = SlateNode.string(block).indexOf(evidence.quote);
    if (quoteStart < 0) return;
    const range = getBlockTextRange(
      evidence.paragraphIndex,
      quoteStart,
      quoteStart + evidence.quote.length
    );
    if (!range) return;
    const decisionId = `character-decision-${nextTrackedChangeId.current++}`;

    Transforms.setNodes<CustomText>(
      editor,
      { confirmedCorrect: true, changeId: decisionId, changeAccepted: true },
      { at: range, match: Text.isText, split: true }
    );

    const issueId = getStableCharacterInconsistencyId(inconsistency);
    const evidenceKey = `${issueId}:${evidenceIndex}`;
    const handledAfterConfirmation = new Set([
      ...handledCharacterEvidenceKeys,
      evidenceKey,
    ]);
    const hasOpenEvidence = inconsistency.evidence.some(
      (_, index) => !handledAfterConfirmation.has(`${issueId}:${index}`)
    );
    setHandledCharacterEvidenceKeys(handledAfterConfirmation);
    setCharacterDecisions((decisions) => [...decisions, {
      id: decisionId,
      inconsistency,
      source: "confirmed",
      evidenceIndices: [evidenceIndex],
      contexts: [{ before: "", original: evidence.quote, replacement: evidence.quote, after: "" }],
      beforeBlocks: [],
    }]);
    setExpandedTrackedChangeId(decisionId);
    setDocument([...editor.children]);

    if (!hasOpenEvidence) {
      const successfulRange: InconsistentTextRange = {
        ...range,
        inconsistent: true,
        inconsistencyRole: "conflict",
        inconsistencySeverity: characterSeverity(inconsistency.confidence),
        inconsistencyIds: [issueId],
        conflictInconsistencyIds: [issueId],
      };
      setSuccessfulInconsistencyId(issueId);
      successfulInconsistencyIdRef.current = issueId;
      setPendingResolvedCharacterInconsistencies(
        characterInconsistencies.filter(
          (item) => getStableCharacterInconsistencyId(item) !== issueId
        )
      );
      Transforms.deselect(editor);
      successfulRangesRef.current = [successfulRange];
      setInconsistentRanges((current) => [
        ...removeInconsistencyFromRanges(current, issueId),
        successfulRange,
      ]);
      setActiveInconsistencyId(issueId);
      setSelectedInconsistencyId(issueId);
      selectedInconsistencyIdRef.current = issueId;
    }
  }

  function revertCharacterDecision(decision: CharacterDecision) {
    Editor.withoutNormalizing(editor, () => {
      if (decision.source === "free") {
        [...decision.beforeBlocks]
          .sort((first, second) => second.paragraphIndex - first.paragraphIndex)
          .forEach(({ paragraphIndex, block }) => {
            if (editor.children[paragraphIndex]) {
              Transforms.removeNodes(editor, { at: [paragraphIndex] });
            }
            Transforms.insertNodes(editor, structuredClone(block), { at: [paragraphIndex] });
          });
      } else {
        for (const [, path] of Array.from(Editor.nodes(editor, {
          at: [],
          match: (node) => Text.isText(node) && node.changeId === decision.id,
        })).sort(([, first], [, second]) => Path.compare(second, first))) {
          Transforms.unsetNodes(
            editor,
            ["changeId", "changeAccepted", "confirmedCorrect"],
            { at: path }
          );
        }
      }
    });
    const issueId = getStableCharacterInconsistencyId(decision.inconsistency);
    setHandledCharacterEvidenceKeys((current) => {
      const next = new Set(current);
      decision.evidenceIndices.forEach((index) => next.delete(`${issueId}:${index}`));
      return next;
    });
    setCharacterDecisions((decisions) => decisions.filter(({ id }) => id !== decision.id));
    setExpandedTrackedChangeId((current) => current === decision.id ? null : current);
    if (successfulInconsistencyIdRef.current === issueId) {
      setSuccessfulInconsistencyId(null);
      successfulInconsistencyIdRef.current = null;
      setPendingResolvedCharacterInconsistencies(null);
      setInconsistentRanges([
        ...getInconsistentTextRanges(editor, inconsistencies),
        ...getCharacterInconsistentTextRanges(editor, characterInconsistencies),
      ]);
    }
    setDocument([...editor.children]);
  }

  function isSameInconsistency(first: Inconsistency, second: Inconsistency) {
    return first.category === second.category &&
      normalizeSearchText(first.subject) === normalizeSearchText(second.subject) &&
      normalizeSearchText(first.predicate) === normalizeSearchText(second.predicate);
  }

  async function reevaluateParagraphs(
    paragraphIndices: number[],
    checkedInconsistency?: Inconsistency,
    rememberedRanges: BaseRange[] = []
  ) {
    if (!analysis || paragraphIndices.length === 0) {
      return;
    }

    if (checkedInconsistency && !ENABLE_AI_CHANGE_ACCEPT_CHECK) {
      const checkedId = getStableInconsistencyId(checkedInconsistency);
      const remainingInconsistencies = inconsistencies.filter(
        (item) => getStableInconsistencyId(item) !== checkedId
      );
      const resolvedRanges = new Map<string, BaseRange>();
      for (const range of [
        ...rememberedRanges,
        ...getAffectedFactPositions(checkedInconsistency).map(({ range }) => range),
      ]) {
        resolvedRanges.set(
          `${range.anchor.path.join(".")}:${range.anchor.offset}:${range.focus.path.join(".")}:${range.focus.offset}`,
          range
        );
      }

      setSuccessfulInconsistencyId(checkedId);
      successfulInconsistencyIdRef.current = checkedId;
      setPendingResolvedInconsistencies(remainingInconsistencies);
      if (resolvedRanges.size > 0) {
        const successfulRanges: InconsistentTextRange[] = Array.from(resolvedRanges.values()).map(
          (range) => ({
            ...range,
            inconsistent: true,
            inconsistencyRole: "conflict",
            inconsistencySeverity: checkedInconsistency.severity,
            inconsistencyIds: [checkedId],
            conflictInconsistencyIds: [checkedId],
          })
        );
        successfulRangesRef.current = successfulRanges;
        setInconsistentRanges((current) => [
          ...removeInconsistencyFromRanges(current, checkedId),
          ...successfulRanges,
        ]);
      }
      setActiveInconsistencyId(checkedId);
      setSelectedInconsistencyId(checkedId);
      selectedInconsistencyIdRef.current = checkedId;
      setJitterSuppressedIds(new Set());
      setOffscreenAbove([]);
      setOffscreenBelow([]);
      setOffscreenFactPreviews([]);
      return;
    }

    setAnalyzing(true);
    setAnalysisError("");

    try {
      const updatedExtractions = await Promise.all(
        paragraphIndices.map(async (paragraphIndex) => {
          const paragraph = editor.children[paragraphIndex];
          const paragraphText = paragraph
            ? getEditorText([paragraph])
            : "";

          if (!paragraphText.trim()) {
            return {
              paragraphIndex,
              extraction: { entities: [], facts: [] } as FactExtraction,
            };
          }

          const extraction = await extractFacts(paragraphText, context);
          return { paragraphIndex, extraction };
        })
      );
      const changedParagraphs = new Set(paragraphIndices);
      const unchangedFacts = analysis.facts.filter(
        (fact) =>
          fact.source?.paragraphIndex === undefined ||
          !changedParagraphs.has(fact.source.paragraphIndex)
      );
      const updatedFacts = updatedExtractions.flatMap(
        ({ paragraphIndex, extraction }) =>
          extraction.facts.map((fact) => ({
            ...fact,
            source: {
              ...fact.source,
              paragraphIndex,
            },
          }))
      );
      const entitiesById = new Map(
        [...analysis.entities, ...updatedExtractions.flatMap(({ extraction }) => extraction.entities)]
          .map((entity) => [entity.id, entity])
      );
      const updatedAnalysis: FactExtraction = {
        entities: Array.from(entitiesById.values()),
        facts: [...unchangedFacts, ...updatedFacts],
      };
      const updatedInconsistencies = checkConsistency(updatedAnalysis);

      const checkedId = checkedInconsistency
        ? getStableInconsistencyId(checkedInconsistency)
        : null;
      const isResolved = checkedInconsistency
        ? !updatedInconsistencies.some((item) =>
            isSameInconsistency(item, checkedInconsistency)
          )
        : false;

      setAnalysis(updatedAnalysis);
      if (checkedId && isResolved) {
        const refreshedFacts = updatedAnalysis.facts.filter((fact) =>
          normalizeSearchText(fact.subject) === normalizeSearchText(checkedInconsistency?.subject) &&
          normalizeSearchText(fact.predicate) === normalizeSearchText(checkedInconsistency?.predicate) &&
          fact.source?.paragraphIndex !== undefined &&
          paragraphIndices.includes(fact.source.paragraphIndex)
        );
        const successfulRanges = refreshedFacts.length > 0 && checkedInconsistency
          ? getInconsistentTextRanges(editor, [{
              ...checkedInconsistency,
              facts: refreshedFacts,
            }], checkedId)
          : [];

        setSuccessfulInconsistencyId(checkedId);
        successfulInconsistencyIdRef.current = checkedId;
        setPendingResolvedInconsistencies(updatedInconsistencies);
        successfulRangesRef.current = successfulRanges;
        setInconsistentRanges((current) => [
          ...removeInconsistencyFromRanges(current, checkedId),
          ...successfulRanges,
        ]);
      } else {
      setSuccessfulInconsistencyId(null);
      successfulInconsistencyIdRef.current = null;
      successfulRangesRef.current = [];
      setPendingResolvedInconsistencies(null);
      setInconsistencies(updatedInconsistencies);
      setInconsistentPaths(
        getInconsistentPaths(editor, updatedInconsistencies)
      );
      setInconsistentRanges(
        getInconsistentTextRanges(editor, updatedInconsistencies)
      );
      }
      setActiveInconsistencyId(checkedId && isResolved ? checkedId : null);
      setSelectedInconsistencyId(checkedId && isResolved ? checkedId : null);
      selectedInconsistencyIdRef.current = checkedId && isResolved ? checkedId : null;
      setJitterSuppressedIds(new Set());
      setOffscreenAbove([]);
      setOffscreenBelow([]);
      setOffscreenFactPreviews([]);
    } catch (error) {
      console.error(error);
      setAnalysisError(
        error instanceof Error
          ? error.message
          : "Unknown error during incremental analysis."
      );
    } finally {
      setAnalyzing(false);
    }
  }

  // Keep the optional AI re-check implementation available behind the
  // existing feature flag, even though passage-based completion is currently
  // the active acceptance workflow.
  void reevaluateParagraphs;

  function navigateToTextHighlight(highlight: NavigationTextHighlight) {
    const inconsistencyId = navigationItems[highlight.index]?.id;
    if (!inconsistencyId) return;
    logStudyEvent("navigation_marker_clicked", {
      inconsistency_id: inconsistencyId,
      page: highlight.page,
      severity: highlight.severity,
    });

    if (selectedInconsistencyId !== inconsistencyId) {
      focusInconsistency(highlight.index, false, true, "left_navigation");
    } else {
      setActiveInconsistencyId(inconsistencyId);
      scrollToInconsistencyCard(inconsistencyId);
    }

    const container = editorScrollRef.current;
    if (!container) return;
    const zoomFactor = documentZoom / 100;
    const absoluteTop = (highlight.page + highlight.y / 100) * container.clientHeight * zoomFactor;
    container.scrollTo({
      top: Math.max(0, absoluteTop - container.clientHeight / 2),
      behavior: "smooth",
    });
  }

  function handleNavigationHighlightHover(highlight: NavigationTextHighlight | null) {
    setHoveredNavigationInconsistencyIndex(highlight?.index ?? null);

    if (navigationHoverTimeoutRef.current !== null) {
      window.clearTimeout(navigationHoverTimeoutRef.current);
      navigationHoverTimeoutRef.current = null;
    }
    navigationHoverTargetRef.current?.classList.remove("inconsistency-hover-locate");
    navigationHoverTargetRef.current = null;

    if (!highlight) return;
    const inconsistencyId = navigationItems[highlight.index]?.id;
    const container = editorScrollRef.current;
    if (!inconsistencyId || !container) return;
    const editable = container.firstElementChild as HTMLElement | null;
    const sourceSelector = highlight.sourceType === "change"
      ? "[data-change-type='insertion'][data-change-id]"
      : "[data-inconsistency-ids]";
    const sourceElements = Array.from(editable?.querySelectorAll<HTMLElement>(sourceSelector) ?? []);
    const exactTarget = sourceElements[highlight.sourceElementIndex];
    if (exactTarget) {
      const animationTarget = exactTarget;
      animationTarget.classList.remove("inconsistency-hover-locate");
      void animationTarget.offsetWidth;
      animationTarget.classList.add("inconsistency-hover-locate");
      navigationHoverTargetRef.current = animationTarget;
      navigationHoverTimeoutRef.current = window.setTimeout(() => {
        animationTarget.classList.remove("inconsistency-hover-locate");
        if (navigationHoverTargetRef.current === animationTarget) navigationHoverTargetRef.current = null;
        navigationHoverTimeoutRef.current = null;
      }, 700);
      return;
    }
    const viewport = container.getBoundingClientRect();
    const relatedElements = Array.from(container.querySelectorAll<HTMLElement>(
      `[data-inconsistency-ids~="${inconsistencyId}"]`
    )).filter((element) => element.dataset.inconsistencyRole !== "sentence");
    const visibleElements = relatedElements.filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.bottom >= viewport.top && rect.top <= viewport.bottom;
    });
    if (visibleElements.length === 0) return;
    const zoomFactor = documentZoom / 100;
    const targetTop = (highlight.page + highlight.y / 100) * container.clientHeight * zoomFactor;
    const target = visibleElements.reduce((closest, element) => {
      const closestRect = closest.getBoundingClientRect();
      const elementRect = element.getBoundingClientRect();
      const closestTop = container.scrollTop + closestRect.top - viewport.top;
      const elementTop = container.scrollTop + elementRect.top - viewport.top;
      return Math.abs(elementTop - targetTop) < Math.abs(closestTop - targetTop)
        ? element
        : closest;
    });
    const animationTarget = target;
    animationTarget.classList.remove("inconsistency-hover-locate");
    void animationTarget.offsetWidth;
    animationTarget.classList.add("inconsistency-hover-locate");
    navigationHoverTargetRef.current = animationTarget;
    navigationHoverTimeoutRef.current = window.setTimeout(() => {
      animationTarget.classList.remove("inconsistency-hover-locate");
      if (navigationHoverTargetRef.current === animationTarget) {
        navigationHoverTargetRef.current = null;
      }
      navigationHoverTimeoutRef.current = null;
    }, 700);
  }

  function navigateToTrackedChangeContext(change: TrackedChange, contextIndex: number) {
    const container = editorScrollRef.current;
    if (!container) return;

    const inconsistencyId = getStableInconsistencyId(change.inconsistency);
    const context = change.contexts[contextIndex];
    const inconsistencyPassages = Array.from(
      container.querySelectorAll<HTMLElement>("[data-inconsistency-ids]")
    ).filter((element) =>
      element.dataset.inconsistencyRole !== "sentence" &&
      element.dataset.inconsistencyIds?.split(" ").includes(inconsistencyId)
    );
    const changedPassages = Array.from(
      container.querySelectorAll<HTMLElement>(`[data-change-id="${change.id}"]`)
    ).filter((element) => element.dataset.changeType === "insertion");
    const changedContextIndex = change.contexts
      .slice(0, contextIndex + 1)
      .filter((candidate) => candidate.changed).length - 1;
    const confirmedPassage = change.source === "confirmed"
      ? container.querySelector<HTMLElement>(`[data-change-id="${change.id}"]`)
      : null;
    const target = confirmedPassage ?? (context?.changed
      ? changedPassages[Math.max(0, changedContextIndex)]
      : inconsistencyPassages[contextIndex]);

    setActiveInconsistencyId(inconsistencyId);
    setSelectedInconsistencyId(inconsistencyId);
    selectedInconsistencyIdRef.current = inconsistencyId;
    target?.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
  }

  async function finishTrackedChange(
    change: TrackedChange,
    action: "accept" | "reject"
  ) {
    const inconsistencyId = getStableInconsistencyId(change.inconsistency);
    logStudyEvent(action === "accept" ? "suggestion_accepted" : "suggestion_rejected", {
      inconsistency_id: inconsistencyId,
      source: change.source ?? "direct",
      occurrence_count: change.occurrenceCount,
    });
    finishInconsistencyWork(action === "accept" ? "suggestion_accepted" : "suggestion_rejected");
    const entries = Array.from(
      Editor.nodes(editor, {
        at: [],
        match: (node) => Text.isText(node) && node.changeId === change.id,
      })
    ).sort(([, firstPath], [, secondPath]) => Path.compare(secondPath, firstPath));

    Editor.withoutNormalizing(editor, () => {
      for (const [node, path] of entries) {
        if (!Text.isText(node)) {
          continue;
        }

        if (action === "accept") {
          Transforms.setNodes<CustomText>(
            editor,
            { changeAccepted: true },
            { at: path }
          );
          continue;
        }

        const shouldRemove = node.changeType === "insertion";

        if (shouldRemove) {
          Transforms.removeNodes(editor, { at: path });
        } else {
          Transforms.unsetNodes(
            editor,
            ["changeId", "changeType", "changeAccepted", "confirmedCorrect"],
            { at: path }
          );
        }
      }
    });

    setTrackedChanges((changes) => action === "accept"
      ? changes.map((candidate) => candidate.id === change.id
        ? { ...candidate, accepted: true }
        : candidate)
      : changes.filter(({ id }) => id !== change.id)
    );
    setDocument([...editor.children]);

    if (action === "reject") {
      if (change.confirmedPositionKey) {
        setConfirmedPositionKeys((current) => {
          const next = new Set(current);
          next.delete(change.confirmedPositionKey!);
          return next;
        });
      }
      const inconsistencyId = getStableInconsistencyId(change.inconsistency);
      resolvedInconsistencyIdsRef.current.delete(inconsistencyId);
      if (successfulInconsistencyIdRef.current === inconsistencyId) {
        setSuccessfulInconsistencyId(null);
        successfulInconsistencyIdRef.current = null;
        successfulRangesRef.current = [];
        setPendingResolvedInconsistencies(null);
        setActiveInconsistencyId(inconsistencyId);
        setSelectedInconsistencyId(inconsistencyId);
        selectedInconsistencyIdRef.current = inconsistencyId;
        setInconsistentPaths([
          ...getInconsistentPaths(editor, inconsistencies),
          ...getCharacterInconsistentPaths(characterInconsistencies, inconsistencies.length),
        ]);
        setInconsistentRanges([
          ...getInconsistentTextRanges(editor, inconsistencies),
          ...getCharacterInconsistentTextRanges(editor, characterInconsistencies),
        ]);
      }
    }

    const rememberedRanges = change.affectedRangeRefs.flatMap((rangeRef) => {
      const range = rangeRef.unref();
      return range ? [range] : [];
    });

    if (action === "accept") {
      useExampleFactsRef.current = false;
      exampleDocumentTextRef.current = "";

      const inconsistencyId = getStableInconsistencyId(change.inconsistency);
      const remainingDetectedPositions = getAffectedFactPositions(change.inconsistency).length;
      const remainingStagedPositions = trackedChanges
        .filter((candidate) =>
          candidate.id !== change.id &&
          !candidate.accepted &&
          getStableInconsistencyId(candidate.inconsistency) === inconsistencyId
        )
        .reduce((total, candidate) => total + candidate.occurrenceCount, 0);

      // Accepting one passage resolves only that passage. The complete
      // inconsistency is re-evaluated (and may become "Resolved") only after
      // every other detected or staged passage has been handled as well.
      if (remainingDetectedPositions + remainingStagedPositions > 0) {
        setSuccessfulInconsistencyId(null);
        successfulInconsistencyIdRef.current = null;
        setPendingResolvedInconsistencies(null);
        setActiveInconsistencyId(inconsistencyId);
        setSelectedInconsistencyId(inconsistencyId);
        selectedInconsistencyIdRef.current = inconsistencyId;
        return;
      }

      // Every passage has now been handled. This is a workflow decision, so
      // an unchanged passage confirmed via "Looks good" must not cause the
      // consistency checker to reopen the issue when the final action happens
      // to be a textual change.
      const handledRanges = trackedChanges
        .filter((candidate) =>
          candidate.id === change.id ||
          getStableInconsistencyId(candidate.inconsistency) === inconsistencyId
        )
        .flatMap((candidate) => candidate.affectedRangeRefs)
        .flatMap((rangeRef) => {
          const range = rangeRef.current;
          return range ? [range] : [];
        });
      const successfulRanges: InconsistentTextRange[] = [
        ...handledRanges,
        ...rememberedRanges,
      ].map((range) => ({
        ...range,
        inconsistent: true,
        inconsistencyRole: "conflict",
        inconsistencySeverity: change.inconsistency.severity,
        inconsistencyIds: [inconsistencyId],
        conflictInconsistencyIds: [inconsistencyId],
      }));
      setSuccessfulInconsistencyId(inconsistencyId);
      successfulInconsistencyIdRef.current = inconsistencyId;
      setPendingResolvedInconsistencies(
        inconsistencies.filter((item) => getStableInconsistencyId(item) !== inconsistencyId)
      );
      Transforms.deselect(editor);
      successfulRangesRef.current = successfulRanges;
      setInconsistentRanges((current) => [
        ...removeInconsistencyFromRanges(current, inconsistencyId),
        ...successfulRanges,
      ]);
      setActiveInconsistencyId(inconsistencyId);
      setSelectedInconsistencyId(inconsistencyId);
      selectedInconsistencyIdRef.current = inconsistencyId;

    }
  }


  async function checkFreeChanges() {
    const editedInconsistencyId = freeEditInconsistencyIdRef.current;
    const restoreScrollPosition = captureEditorScrollPosition();

    try {
      await applyFreeChanges();
      if (editedInconsistencyId) {
        logStudyEvent("manual_edit_finished", {
          inconsistency_id: editedInconsistencyId,
          paragraph_count: freeEditParagraphs.length,
        });
      }
    } finally {
      restoreScrollPosition();
    }
  }

  function stageFreeEditTrackedChange(inconsistency: Inconsistency): boolean {
    const snapshot = freeEditDocumentSnapshotRef.current;
    const diffs = freeEditParagraphs.flatMap((paragraphIndex) => {
      const before = snapshot[paragraphIndex] ?? "";
      const after = editor.children[paragraphIndex]
        ? getNodeText(editor.children[paragraphIndex])
        : "";
      if (before === after) return [];

      let start = 0;
      while (start < before.length && start < after.length && before[start] === after[start]) {
        start += 1;
      }
      let beforeEnd = before.length;
      let afterEnd = after.length;
      while (
        beforeEnd > start &&
        afterEnd > start &&
        before[beforeEnd - 1] === after[afterEnd - 1]
      ) {
        beforeEnd -= 1;
        afterEnd -= 1;
      }

      const currentRange = getBlockTextRange(paragraphIndex, start, afterEnd);
      if (!currentRange) return [];
      const sentence = getSentenceOffsets(before, start, beforeEnd);
      return [{
        paragraphIndex,
        start,
        currentRange,
        original: before.slice(start, beforeEnd),
        replacement: after.slice(start, afterEnd),
        beforeContext: before.slice(sentence.start, start),
        afterContext: before.slice(beforeEnd, sentence.end),
      }];
    });
    if (diffs.length === 0) return false;

    const changeId = `tracked-change-${nextTrackedChangeId.current++}`;
    Editor.withoutNormalizing(editor, () => {
      for (const diff of [...diffs].sort((a, b) => b.paragraphIndex - a.paragraphIndex)) {
        const insertionPoint = Editor.pointRef(editor, diff.currentRange.anchor, {
          affinity: "backward",
        });
        if (diff.replacement) {
          Transforms.setNodes<CustomText>(
            editor,
            { changeId, changeType: "insertion", changeAccepted: true },
            { at: diff.currentRange, match: Text.isText, split: true }
          );
        }
        const point = insertionPoint.unref();
        if (point && diff.original) {
          Transforms.insertNodes<CustomText>(
            editor,
            { text: diff.original, changeId, changeType: "deletion", changeAccepted: true },
            { at: point }
          );
        }
      }
    });

    const affectedRangeRefs = Array.from(Editor.nodes(editor, {
      at: [],
      match: (node) => Text.isText(node) && node.changeId === changeId,
    })).map(([, path]) =>
      Editor.rangeRef(editor, Editor.range(editor, path), { affinity: "outward" })
    );

    setTrackedChanges((changes) => [...changes, {
      id: changeId,
      inconsistency,
      source: "free",
      replacement: diffs.map((diff) => diff.replacement || "∅").join(" / "),
      replacedValues: diffs.map((diff) => diff.original || "∅"),
      occurrenceCount: diffs.length,
      paragraphIndices: diffs.map((diff) => diff.paragraphIndex),
      affectedRangeRefs,
      accepted: true,
      contexts: diffs.map((diff) => ({
        before: diff.beforeContext,
        original: diff.original,
        replacement: diff.replacement,
        after: diff.afterContext,
        changed: true,
      })),
    }]);
    setExpandedTrackedChangeId(changeId);
    setDocument([...editor.children]);
    return true;
  }

  async function applyFreeChanges() {
    if (freeEditCharacterInconsistency) {
      const targetId = getStableCharacterInconsistencyId(freeEditCharacterInconsistency);
      const newlyHandledKeys = freeEditCharacterEvidenceIndices.map(
        (evidenceIndex) => `${targetId}:${evidenceIndex}`
      );
      const handledAfterChange = new Set([
        ...handledCharacterEvidenceKeys,
        ...newlyHandledKeys,
      ]);
      const hasOpenEvidence = freeEditCharacterInconsistency.evidence.some(
        (_, evidenceIndex) => !handledAfterChange.has(`${targetId}:${evidenceIndex}`)
      );
      const remainingCharacterInconsistencies = characterInconsistencies.filter(
        (item) => getStableCharacterInconsistencyId(item) !== targetId
      );
      const pendingRangeRefs = [...freeEditRangeRefs.current, ...freeEditChangedRangeRefs.current]
        .filter((rangeRef) => rangeRef.current)
        .sort((first, second) => {
          const firstRange = first.current;
          const secondRange = second.current;
          if (!firstRange || !secondRange) return 0;
          return Path.compare(secondRange.anchor.path, firstRange.anchor.path) ||
            secondRange.anchor.offset - firstRange.anchor.offset;
        });
      const rememberedRanges: BaseRange[] = [];
      const decisionId = `character-decision-${nextTrackedChangeId.current++}`;
      const beforeBlocks = freeEditParagraphs.flatMap((paragraphIndex) => {
        const block = freeEditDocumentNodesSnapshotRef.current[paragraphIndex];
        return block ? [{ paragraphIndex, block: structuredClone(block) }] : [];
      });
      const decisionContexts = freeEditParagraphs.flatMap((paragraphIndex) => {
        const beforeText = freeEditDocumentSnapshotRef.current[paragraphIndex] ?? "";
        const afterText = editor.children[paragraphIndex]
          ? getNodeText(editor.children[paragraphIndex])
          : "";
        if (beforeText === afterText) return [];
        let start = 0;
        while (
          start < beforeText.length &&
          start < afterText.length &&
          beforeText[start] === afterText[start]
        ) start += 1;
        let beforeEnd = beforeText.length;
        let afterEnd = afterText.length;
        while (
          beforeEnd > start &&
          afterEnd > start &&
          beforeText[beforeEnd - 1] === afterText[afterEnd - 1]
        ) {
          beforeEnd -= 1;
          afterEnd -= 1;
        }
        const contextLength = 48;
        return [{
          before: `${start > contextLength ? "…" : ""}${beforeText.slice(Math.max(0, start - contextLength), start)}`,
          original: beforeText.slice(start, beforeEnd) || "∅",
          replacement: afterText.slice(start, afterEnd) || "∅",
          after: `${afterText.slice(afterEnd, afterEnd + contextLength)}${afterEnd + contextLength < afterText.length ? "…" : ""}`,
        }];
      });
      Editor.withoutNormalizing(editor, () => {
        // Keep the remaining RangeRefs live while each mark splits Slate text
        // nodes. Otherwise the first split invalidates paths for later edits,
        // especially changes outside the originally selected evidence.
        pendingRangeRefs.forEach((rangeRef) => {
          const range = rangeRef.unref();
          if (!range) return;
          rememberedRanges.push(range);
          Transforms.setNodes<CustomText>(
            editor,
            { confirmedCorrect: true, changeId: decisionId, changeAccepted: true },
            { at: range, match: Text.isText, split: true }
          );
        });
      });
      setHandledCharacterEvidenceKeys(handledAfterChange);
      setCharacterDecisions((decisions) => [...decisions, {
        id: decisionId,
        inconsistency: freeEditCharacterInconsistency,
        source: "free",
        evidenceIndices: [...freeEditCharacterEvidenceIndices],
        contexts: decisionContexts,
        beforeBlocks,
      }]);
      setExpandedTrackedChangeId(decisionId);
      setFreeEditCharacterEvidenceIndices([]);
      freeEditRangeRefs.current = [];
      freeEditChangedRangeRefs.current = [];
      freeEditDocumentSnapshotRef.current = [];
      freeEditDocumentNodesSnapshotRef.current = [];
      freeEditInconsistencyIdRef.current = null;
      setFreeEditCharacterInconsistency(null);
      setFreeEditParagraphs([]);
      setSuccessfulInconsistencyId(hasOpenEvidence ? null : targetId);
      successfulInconsistencyIdRef.current = hasOpenEvidence ? null : targetId;
      setPendingResolvedCharacterInconsistencies(
        hasOpenEvidence ? null : remainingCharacterInconsistencies
      );
      const markedRanges = Array.from(Editor.nodes(editor, {
        at: [],
        match: (node) => Text.isText(node) && node.changeId === decisionId,
      })).map(([, path]) => Editor.range(editor, path));
      const successfulRanges: InconsistentTextRange[] = markedRanges.map((range) => ({
        ...range,
        inconsistent: true,
        inconsistencyRole: "conflict",
        inconsistencySeverity: freeEditCharacterInconsistency.confidence,
        inconsistencyIds: [targetId],
        conflictInconsistencyIds: [targetId],
      }));
      successfulRangesRef.current = hasOpenEvidence ? [] : successfulRanges;
      if (!hasOpenEvidence) {
        Transforms.deselect(editor);
        setInconsistentRanges((current) => [
          ...removeInconsistencyFromRanges(current, targetId),
          ...successfulRanges,
        ]);
      }
      setActiveInconsistencyId(targetId);
      setSelectedInconsistencyId(targetId);
      selectedInconsistencyIdRef.current = targetId;
      useExampleFactsRef.current = false;
      exampleDocumentTextRef.current = "";
      return;
    }
    if (!freeEditInconsistency) return;
    const target = freeEditInconsistency;
    const staged = stageFreeEditTrackedChange(target);
    setFreeEditInconsistency(null);
    setFreeEditParagraphs([]);
    freeEditRangeRefs.current.forEach((rangeRef) => rangeRef.unref());
    freeEditChangedRangeRefs.current.forEach((rangeRef) => rangeRef.unref());
    freeEditRangeRefs.current = [];
    freeEditChangedRangeRefs.current = [];
    freeEditDocumentSnapshotRef.current = [];
    freeEditInconsistencyIdRef.current = null;
    useExampleFactsRef.current = false;
    exampleDocumentTextRef.current = "";
    if (!staged) return;
    setSuggestionTarget(null);
    setSuggestionMode("replace");
  }

  async function completeResolution(resolutionId?: string) {
    const targetResolutionId = resolutionId ?? successfulInconsistencyId;
    if (!targetResolutionId) return;
    finishInconsistencyWork("resolved");
    const resolutionChangeIds = new Set([
      ...trackedChanges
        .filter((change) =>
          getStableInconsistencyId(change.inconsistency) === targetResolutionId
        )
        .map((change) => change.id),
      ...characterDecisions
        .filter((decision) =>
          getStableCharacterInconsistencyId(decision.inconsistency) === targetResolutionId
        )
        .map((decision) => decision.id),
    ]);
    const scrollContainer = editorScrollRef.current;
    const viewport = scrollContainer?.getBoundingClientRect();
    const resolutionElements = Array.from(
      scrollContainer?.querySelectorAll<HTMLElement>("[data-change-id]") ?? []
    ).filter((element) =>
      Boolean(element.dataset.changeId && resolutionChangeIds.has(element.dataset.changeId))
    );
    const visibleResolutionElements = viewport
      ? resolutionElements.filter((element) => {
          const rect = element.getBoundingClientRect();
          return rect.bottom >= viewport.top && rect.top <= viewport.bottom;
        })
      : [];
    const preferredResolutionElement = (visibleResolutionElements.length > 0
      ? visibleResolutionElements
      : resolutionElements
    ).reduce<HTMLElement | null>((closest, element) => {
      if (!closest || !viewport) return element;
      const viewportCenter = viewport.top + viewport.height / 2;
      const closestRect = closest.getBoundingClientRect();
      const elementRect = element.getBoundingClientRect();
      return Math.abs(elementRect.top + elementRect.height / 2 - viewportCenter) <
        Math.abs(closestRect.top + closestRect.height / 2 - viewportCenter)
        ? element
        : closest;
    }, null);
    const restoreScrollPosition = captureEditorScrollPosition(preferredResolutionElement);
    const resolvesCharacterInconsistency = characterInconsistencies.some(
      (item) => getStableCharacterInconsistencyId(item) === targetResolutionId
    );
    const resolvedCharacterDecisionIds = new Set(
      characterDecisions
        .filter((decision) =>
          getStableCharacterInconsistencyId(decision.inconsistency) === targetResolutionId
        )
        .map((decision) => decision.id)
    );

    // A resolved card must no longer keep the editor in scoped/selected mode.
    // Clear this before Slate removes accepted nodes so adjacent decorations
    // cannot inherit a stale replay animation during the resulting render.
    setActiveInconsistencyId(null);
    setSelectedInconsistencyId(null);
    selectedInconsistencyIdRef.current = null;
    setJitterSuppressedIds(new Set());
    setOffscreenAbove([]);
    setOffscreenBelow([]);
    setOffscreenFactPreviews([]);
    if (successfulInconsistencyIdRef.current === targetResolutionId) {
      successfulInconsistencyIdRef.current = null;
      successfulRangesRef.current = [];
    }

    {
      // Slate emits an onValueChange while accepted deletion nodes are removed.
      // Suppress this resolved id before that mutation so the stale render does
      // not recreate its old red ranges once more.
      resolvedInconsistencyIdsRef.current.add(targetResolutionId);
      const acceptedChanges = trackedChanges.filter((change) =>
        getStableInconsistencyId(change.inconsistency) === targetResolutionId
      );
      const insertionOnlyChangeIds = new Set<string>();
      let finalizationDuration = resolvedCharacterDecisionIds.size > 0 ? 660 : 0;
      acceptedChanges.forEach((change) => {
        const changedNodes = Array.from(Editor.nodes(editor, {
          at: [],
          match: (node) =>
            Text.isText(node) &&
            node.changeId === change.id,
        })).map(([node]) => node).filter(Text.isText);
        const hasDeletion = changedNodes.some((node) => node.changeType === "deletion");
        const hasInsertion = changedNodes.some((node) =>
          node.changeType === "insertion" || node.confirmedCorrect
        );
        if (!hasDeletion) insertionOnlyChangeIds.add(change.id);
        finalizationDuration = Math.max(
          finalizationDuration,
          hasDeletion && hasInsertion ? 1440 : hasDeletion ? 780 : 660
        );
      });
      const allFinalizingChangeIds = new Set([
        ...acceptedChanges.map((change) => change.id),
        ...resolvedCharacterDecisionIds,
      ]);
      resolvedCharacterDecisionIds.forEach((id) => insertionOnlyChangeIds.add(id));
      // Measure deletion leaves while they still have their natural inline
      // width. Measuring after the finalizing class is rendered would read the
      // 30em fallback and create a large empty spacer during the wipe.
      acceptedChanges.forEach((change) => {
        window.document.querySelectorAll<HTMLElement>(`[data-change-id="${change.id}"]`)
          .forEach((element) => {
            const deletion = element.querySelector<HTMLElement>(".tracked-deletion");
            if (deletion) {
              element.style.setProperty(
                "--tracked-deletion-width",
                `${deletion.getBoundingClientRect().width}px`
              );
            }
          });
      });
      setFinalizingChangeIds(allFinalizingChangeIds);
      setFinalizingInsertionOnlyChangeIds(insertionOnlyChangeIds);
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
      if (allFinalizingChangeIds.size > 0) {
        await new Promise<void>((resolve) =>
          window.setTimeout(resolve, finalizationDuration)
        );
      }
      Editor.withoutNormalizing(editor, () => {
        for (const change of acceptedChanges) {
          const entries = Array.from(Editor.nodes(editor, {
            at: [],
            match: (node) => Text.isText(node) && node.changeId === change.id,
          })).sort(([, firstPath], [, secondPath]) => Path.compare(secondPath, firstPath));
          for (const [node, path] of entries) {
            if (!Text.isText(node)) continue;
            if (node.changeType === "deletion") {
              Transforms.removeNodes(editor, { at: path });
            } else {
              Transforms.unsetNodes(
                editor,
                ["changeId", "changeType", "changeAccepted", "confirmedCorrect"],
                { at: path }
              );
            }
          }
        }
      });
      setTrackedChanges((changes) => changes.filter((change) =>
        !acceptedChanges.some((accepted) => accepted.id === change.id)
      ));
      setFinalizingChangeIds(new Set());
      setFinalizingInsertionOnlyChangeIds(new Set());
      setDocument([...editor.children]);
    }

    if (resolvesCharacterInconsistency) {
      Editor.withoutNormalizing(editor, () => {
        const entries = Array.from(Editor.nodes(editor, {
          at: [],
          match: (node) =>
            Text.isText(node) &&
            Boolean(node.changeId && resolvedCharacterDecisionIds.has(node.changeId)),
        })).sort(([, firstPath], [, secondPath]) => Path.compare(secondPath, firstPath));
        entries.forEach(([, path]) => {
          Transforms.unsetNodes(
            editor,
            ["changeId", "changeAccepted", "confirmedCorrect"],
            { at: path }
          );
        });
      });
      setCharacterDecisions((decisions) => decisions.filter(
        (decision) => !resolvedCharacterDecisionIds.has(decision.id)
      ));
      setExpandedTrackedChangeId((current) =>
        current && resolvedCharacterDecisionIds.has(current) ? null : current
      );
      const remainingCharacterInconsistencies = characterInconsistencies.filter(
        (item) => getStableCharacterInconsistencyId(item) !== targetResolutionId
      );
      setCharacterInconsistencies(remainingCharacterInconsistencies);
      setInconsistentPaths([
        ...getInconsistentPaths(editor, inconsistencies),
        ...getCharacterInconsistentPaths(
          remainingCharacterInconsistencies,
          inconsistencies.length
        ),
      ]);
      setInconsistentRanges([
        ...getInconsistentTextRanges(editor, inconsistencies),
        ...getCharacterInconsistentTextRanges(editor, remainingCharacterInconsistencies),
      ]);
      if (successfulInconsistencyId === targetResolutionId) {
        setSuccessfulInconsistencyId(null);
        successfulInconsistencyIdRef.current = null;
      }
      successfulRangesRef.current = [];
      setPendingResolvedCharacterInconsistencies(null);
      setOffscreenAbove([]);
      setOffscreenBelow([]);
      setDocument([...editor.children]);
      restoreScrollPosition();
      return;
    }
    const remainingInconsistencies = inconsistencies.filter(
      (item) => getStableInconsistencyId(item) !== targetResolutionId
    );
    setInconsistencies(remainingInconsistencies);
    setInconsistentPaths(
      [
        ...getInconsistentPaths(editor, remainingInconsistencies),
        ...getCharacterInconsistentPaths(
          characterInconsistencies,
          remainingInconsistencies.length
        ),
      ]
    );
    setInconsistentRanges(
      [
        ...getInconsistentTextRanges(editor, remainingInconsistencies),
        ...getCharacterInconsistentTextRanges(editor, characterInconsistencies),
      ]
    );
    if (successfulInconsistencyId === targetResolutionId) {
      setSuccessfulInconsistencyId(null);
      successfulInconsistencyIdRef.current = null;
    }
    successfulRangesRef.current = [];
    setPendingResolvedInconsistencies(null);
    setOffscreenAbove([]);
    setOffscreenBelow([]);
    setOffscreenFactPreviews([]);
    restoreScrollPosition();
  }

  const activeInconsistencyImpact = activeInconsistencyId
    ? inconsistencies.find(
        (inconsistency) =>
          getStableInconsistencyId(inconsistency) === activeInconsistencyId
      )?.impact ?? null
    : null;

  const visibleConfirmedChangeIds = new Set([
    ...trackedChanges.flatMap((change) =>
      change.source === "confirmed" &&
      !effectiveHiddenInconsistencyIds.has(getStableInconsistencyId(change.inconsistency))
        ? [change.id]
        : []
    ),
    ...characterDecisions.flatMap((decision) =>
      !effectiveHiddenInconsistencyIds.has(
        getStableCharacterInconsistencyId(decision.inconsistency)
      )
        ? [decision.id]
        : []
    ),
  ]);

  const isFreeEditActive = Boolean(
    freeEditInconsistency || freeEditCharacterInconsistency
  );

  function isAllowedDuringFreeEdit(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    return Boolean(
      target.closest(".free-edit-checkbar") ||
      target.closest("[data-slate-editor='true']") ||
      target === editorScrollRef.current
    );
  }

  function blockCompetingFreeEditInteraction(
    event: React.SyntheticEvent<HTMLElement>
  ) {
    if (!isFreeEditActive || isAllowedDuringFreeEdit(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
  }

  function handleFreeEditEditorKeyDown(
    event: React.KeyboardEvent<HTMLDivElement>
  ) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
      logStudyEvent("undo", {
        inconsistency_id: selectedInconsistencyIdRef.current,
        source: "keyboard",
      });
    }
    if (isFreeEditActive && event.key === "Enter") {
      event.preventDefault();
    }
  }

  function handleStudyClickCapture(event: React.MouseEvent<HTMLDivElement>) {
    blockCompetingFreeEditInteraction(event);
    if (event.defaultPrevented || !(event.target instanceof HTMLElement)) return;

    const target = event.target;
    const card = target.closest<HTMLElement>("[data-inconsistency-card-id]");
    if (card) {
      const inconsistencyId = card.dataset.inconsistencyCardId;
      const button = target.closest<HTMLElement>("button, summary");
      if (!inconsistencyId || !button) return;

      const action = button.classList.contains("conflict-card-content") ? "selected"
        : button.classList.contains("conflict-card-position-preview") ? "passage_opened"
        : button.classList.contains("conflict-card-position-edit") ? "manual_edit_started"
        : button.classList.contains("conflict-card-position-confirm") ? "passage_confirmed"
        : button.classList.contains("resolved-inconsistency-button") ? "resolved"
        : button.classList.contains("resolve-inconsistency-button") ? "visibility_toggled"
        : button.closest(".suggestion-editor") ? "suggestion_editor_action"
        : button.closest(".tracked-change-dialog") ? "tracked_change_action"
        : "card_control_clicked";
      startInconsistencyWork(inconsistencyId, "right_card");
      logStudyEvent("card_interaction", {
        inconsistency_id: inconsistencyId,
        action,
      });
      return;
    }

    const marker = target.closest<HTMLElement>("[data-inconsistency-ids]");
    if (marker && marker.dataset.inconsistencyRole !== "sentence") {
      const inconsistencyId = (
        marker.dataset.conflictInconsistencyIds ?? marker.dataset.inconsistencyIds ?? ""
      ).split(" ").find(Boolean);
      if (!inconsistencyId) return;
      logStudyEvent("editor_marker_clicked", {
        inconsistency_id: inconsistencyId,
        role: marker.dataset.inconsistencyRole ?? "unknown",
      });
      startInconsistencyWork(inconsistencyId, "editor_marker");
    }
  }

  function getStudyHoverTarget(target: EventTarget | null): {
    element: HTMLElement;
    inconsistencyId: string;
    source: "editor_marker" | "left_navigation";
    page?: number;
  } | null {
    if (!(target instanceof HTMLElement)) return null;

    const navigationMarker = target.closest<HTMLElement>("[data-study-navigation-marker]");
    if (navigationMarker) {
      const index = Number(navigationMarker.dataset.studyInconsistencyIndex);
      const inconsistencyId = Number.isInteger(index) ? navigationItems[index]?.id : undefined;
      if (!inconsistencyId) return null;
      return {
        element: navigationMarker,
        inconsistencyId,
        source: "left_navigation",
        page: Number(navigationMarker.dataset.studyPage),
      };
    }

    const editorMarker = target.closest<HTMLElement>("[data-inconsistency-ids]");
    if (!editorMarker || editorMarker.dataset.inconsistencyRole === "sentence") return null;
    const inconsistencyId = (
      editorMarker.dataset.conflictInconsistencyIds ?? editorMarker.dataset.inconsistencyIds ?? ""
    ).split(" ").find(Boolean);
    if (!inconsistencyId) return null;
    return {
      element: editorMarker,
      inconsistencyId,
      source: "editor_marker",
    };
  }

  function handleStudyPointerOver(event: React.PointerEvent<HTMLDivElement>) {
    const target = getStudyHoverTarget(event.target);
    if (!target || target.element.contains(event.relatedTarget as Node | null)) return;
    if (studyHoverStartsRef.current.has(target.element)) return;
    studyHoverStartsRef.current.set(target.element, {
      startedAt: performance.now(),
      inconsistencyId: target.inconsistencyId,
      source: target.source,
      page: target.page,
    });
  }

  function handleStudyPointerOut(event: React.PointerEvent<HTMLDivElement>) {
    const target = getStudyHoverTarget(event.target);
    if (!target || target.element.contains(event.relatedTarget as Node | null)) return;
    const started = studyHoverStartsRef.current.get(target.element);
    if (!started) return;
    studyHoverStartsRef.current.delete(target.element);
    const durationMs = Math.round(performance.now() - started.startedAt);
    if (durationMs < MIN_STUDY_HOVER_DURATION_MS) return;

    logStudyEvent(
      started.source === "left_navigation"
        ? "navigation_marker_hovered"
        : "editor_marker_hovered",
      {
        inconsistency_id: started.inconsistencyId,
        duration_ms: durationMs,
        ...(started.page === undefined ? {} : { page: started.page }),
      }
    );
  }

  return (
    <div
      className={`content-container${isFreeEditActive ? " content-container--free-edit-locked" : ""}`}
      onPointerDownCapture={blockCompetingFreeEditInteraction}
      onPointerOverCapture={handleStudyPointerOver}
      onPointerOutCapture={handleStudyPointerOut}
      onClickCapture={handleStudyClickCapture}
      onKeyDownCapture={blockCompetingFreeEditInteraction}
    >
      <div className="editor-navigation-container">
        <EditorNavigation
        document={document}
        inconsistentPaths={inconsistentPaths}
        pageLineWidths={pageLineWidths}
        pageLineTops={pageLineTops}
        pageLineLefts={pageLineLefts}
        blockPageIndices={blockPageIndices}
        inconsistencyPageIndices={inconsistencyPageIndices}
        textHighlights={navigationTextHighlights}
        activeInconsistencyIndex={activeInconsistencyId
          ? navigationItems.findIndex((item) => item.id === activeInconsistencyId)
          : null}
        successfulInconsistencyIndex={successfulInconsistencyId
          ? inconsistencies.findIndex((item) => getStableInconsistencyId(item) === successfulInconsistencyId)
          : null}
        hiddenInconsistencyIndices={new Set(
          navigationItems.flatMap((item, index) =>
            effectiveHiddenInconsistencyIds.has(item.id) ? [index] : []
          )
        )}
        pageCount={pageCount}
        currentPage={currentPage}
        onNavigatePage={navigateToPage}
        onNavigateTextHighlight={navigateToTextHighlight}
        onHoverTextHighlight={handleNavigationHighlightHover}
      />
        
    </div>
    <div className="editor-container">
        <Slate
            editor={editor}
            initialValue={initialValue}
            onValueChange={(value) => {
              if (
                useExampleFactsRef.current &&
                getEditorText(value) !== exampleDocumentTextRef.current
              ) {
                useExampleFactsRef.current = false;
                exampleDocumentTextRef.current = "";
              }

              /*
               * Slate mutiert `editor.children` direkt. Die Navigation braucht
               * deshalb bei jeder Inhaltsänderung einen neuen React-Snapshot.
               */
              setDocument([...value]);

              /*
               * Pfade sind positionsbasiert. Nach dem Löschen oder Verschieben
               * eines Absatzes dürfen alte Pfade nicht weiterverwendet werden.
               */
              const unresolvedInconsistencies = inconsistencies.filter(
                (inconsistency) => !resolvedInconsistencyIdsRef.current.has(
                  getStableInconsistencyId(inconsistency)
                )
              );
              const unresolvedCharacterInconsistencies = characterInconsistencies.filter(
                (inconsistency) => !resolvedInconsistencyIdsRef.current.has(
                  getStableCharacterInconsistencyId(inconsistency)
                )
              );
              setInconsistentPaths(
                [
                  ...getInconsistentPaths(editor, unresolvedInconsistencies),
                  ...getCharacterInconsistentPaths(
                    unresolvedCharacterInconsistencies,
                    unresolvedInconsistencies.length
                  ),
                ]
              );
              const dependentRanges: InconsistentTextRange[] = dependentPassages.flatMap((passage) => {
                const range = passage.rangeRef.current;
                if (!range) return [];
                try {
                  const containsHandledText = Array.from(Editor.nodes(editor, {
                    at: range,
                    match: Text.isText,
                  })).some(([node]) =>
                    Text.isText(node) && Boolean(node.changeType || node.confirmedCorrect)
                  );
                  const currentText = Editor.string(editor, range).trim();
                  if (
                    containsHandledText ||
                    !currentText ||
                    normalizeSearchText(currentText) !== normalizeSearchText(passage.text)
                  ) return [];
                } catch {
                  return [];
                }
                const sourceInconsistency = inconsistencies.find(
                  (item) => getStableInconsistencyId(item) === passage.inconsistencyId
                );
                return getRangeTextFragments(range).map((fragment) => ({
                  ...fragment,
                  inconsistent: true,
                  inconsistencyRole: "conflict",
                  inconsistencySeverity: sourceInconsistency?.severity,
                  inconsistencyIds: [passage.inconsistencyId],
                  conflictInconsistencyIds: [passage.inconsistencyId],
                }));
              });
              const recalculatedRanges = [
                ...getInconsistentTextRanges(editor, unresolvedInconsistencies),
                ...getCharacterInconsistentTextRanges(editor, unresolvedCharacterInconsistencies),
                ...dependentRanges,
              ];
              const freeEditId = freeEditInconsistencyIdRef.current;
              if (freeEditId) {
                freeEditChangedRangeRefs.current.forEach((rangeRef) => rangeRef.unref());
                freeEditChangedRangeRefs.current = getFreeEditChangedRanges().map((range) =>
                  Editor.rangeRef(editor, range, { affinity: "outward" })
                );
              }
              const freeEditOriginalRangeCount = freeEditRangeRefs.current.length;
              const freeEditRanges: InconsistentTextRange[] = freeEditId
                ? [...freeEditRangeRefs.current, ...freeEditChangedRangeRefs.current].flatMap((rangeRef, rangeIndex) => {
                    const range = rangeRef.current;
                    return range
                      ? getRangeTextFragments(range).map((fragment) => ({
                          ...fragment,
                          inconsistent: true as const,
                          freeEditInsertion: rangeIndex >= freeEditOriginalRangeCount,
                          inconsistencyRole: "conflict" as const,
                          inconsistencySeverity: inconsistencies.find(
                            (item) => getStableInconsistencyId(item) === freeEditId
                          )?.severity ?? characterInconsistencies.find(
                            (item) => getStableCharacterInconsistencyId(item) === freeEditId
                          )?.confidence,
                          inconsistencyIds: [freeEditId],
                          conflictInconsistencyIds: [freeEditId],
                        }))
                      : [];
                  })
                : [];
              const rangesWithFreeEdit = freeEditId
                ? [
                    ...removeInconsistencyFromRanges(recalculatedRanges, freeEditId),
                    ...freeEditRanges,
                  ]
                : recalculatedRanges;
              const successfulId = successfulInconsistencyIdRef.current;
              setInconsistentRanges(
                successfulId
                  ? [
                      ...removeInconsistencyFromRanges(
                        rangesWithFreeEdit,
                        successfulId
                      ),
                      ...successfulRangesRef.current,
                    ]
                  : rangesWithFreeEdit
              );
            }}
        >
        <Toolbar
          onTextLoad={handleFileLoad}
          onHtmlLoad={handleHtmlLoad}
          onExampleLoad={handleExampleLoad}
          onAnalyze={handleAnalyze}
          analyzing={analyzing}
          documentZoom={documentZoom}
          onDocumentZoomChange={setDocumentZoom}
        />
        <div
          ref={editorScrollShellRef}
          className={`editor-scroll-shell${isFreeEditActive ? " editor-scroll-shell--free-edit" : ""}`}
        >
          {isFreeEditActive && (
            <div className="free-edit-checkbar" role="status">
              <span>Edit the selected passages directly in the document. Paragraph breaks are disabled during this step.</span>
              <button type="button" onClick={checkFreeChanges} disabled={analyzing}>
                {analyzing
                  ? "Checking…"
                  : freeEditInconsistency
                    ? "Review changes"
                    : ENABLE_AI_CHANGE_ACCEPT_CHECK
                    ? "Check these changes"
                    : "Accept changes"}
              </button>
              <button type="button" className="free-edit-cancel" onClick={cancelFreeEditing}>Cancel</button>
            </div>
          )}
          <div ref={editorScrollRef} className="editor-scroll-container" onScroll={updatePagination}>
            <Editable
            className={`editor${activeInconsistencyId ? " editor--scope-active" : ""}`}
            style={{ zoom: documentZoom / 100 }}
            placeholder="Text eingeben ..."
            renderElement={renderElement}
            renderLeaf={(props) => renderLeaf({
              ...props,
              activeInconsistencyId,
              activeInconsistencyImpact,
              jitterSuppressedIds,
              hiddenInconsistencyIds: effectiveHiddenInconsistencyIds,
              transitionHiddenInconsistencyIds,
              successfulInconsistencyId,
              finalizingChangeIds,
              finalizingInsertionOnlyChangeIds,
              visibleConfirmedChangeIds,
              onConflictHoverChange: handleInconsistencyHover,
            })}
            decorate={decorateInconsistencies}
            onKeyDown={handleFreeEditEditorKeyDown}
            spellCheck
            />
          </div>
          {analyzing && (
            <div
              className="analysis-loading-overlay"
              role="status"
              aria-live="polite"
              aria-label="Analyzing text"
            >
              <div className="analysis-loading-indicator" aria-hidden="true">
                <span className="analysis-loading-ring" />
                <span className="analysis-loading-label">
                  Analyzing text<span className="analysis-loading-dots" />
                </span>
              </div>
              <span className="analysis-loading-scan" aria-hidden="true" />
            </div>
          )}
          {factPreviewConnections.length > 0 && (
            <svg
              className="fact-preview-connection-overlay"
              width="100%"
              height="100%"
              aria-hidden="true"
            >
              {factPreviewConnections.map((connection) => (
                <path
                  key={connection.key}
                  className={`fact-preview-connection${activeInconsistencyId === successfulInconsistencyId ? " fact-preview-connection--success" : ""}`}
                  d={connection.path}
                  pathLength="1"
                />
              ))}
            </svg>
          )}
          {(["above", "below"] as const).map((direction) => {
            const previews = offscreenFactPreviews.filter(
              (preview) => preview.direction === direction
            );
            const directionalMarkers = direction === "above" ? offscreenAbove : offscreenBelow;
            const largestMarkerSize = directionalMarkers.reduce(
              (largest, marker) => Math.max(largest, Math.max(32, marker.occurrenceCount * 16 + 8)),
              0
            );
            const markerClearance = largestMarkerSize > 0
              ? largestMarkerSize * 1.5 + 8
              : 0;

            return previews.length > 0 ? (
              <div
                key={direction}
                className={`offscreen-fact-previews offscreen-fact-previews--${direction}`}
                style={{ "--context-marker-clearance": `${markerClearance}px` } as React.CSSProperties}
                aria-live="polite"
              >
                {previews.map((preview) => (
                  <button
                    type="button"
                    key={preview.key}
                    className={`offscreen-fact-preview${activeInconsistencyId === successfulInconsistencyId ? " offscreen-fact-preview--success" : ""}`}
                    data-fact-preview-key={preview.key}
                    onClick={() => navigateToFactPreview(preview)}
                    aria-label={`Scroll to passage: ${preview.fact}`}
                  >
                    <span className="offscreen-fact-preview-emoji" aria-hidden="true">
                      {preview.emoji}
                    </span>
                    {preview.before}<mark>{preview.fact}</mark>{preview.after}
                  </button>
                ))}
              </div>
            ) : null;
          })}
          {offscreenAbove.length > 0 && (
            <div className="offscreen-inconsistency-markers offscreen-inconsistency-markers--above">
              {offscreenAbove.map((marker) => (
                <OffscreenMarker
                  key={marker.index}
                  direction="above"
                  marker={marker}
                  onClick={() => focusInconsistency(marker.index, true, false, "editor_offscreen_marker")}
                />
              ))}
            </div>
          )}
          {offscreenBelow.length > 0 && (
            <div className="offscreen-inconsistency-markers offscreen-inconsistency-markers--below">
              {offscreenBelow.map((marker) => (
                <OffscreenMarker
                  key={marker.index}
                  direction="below"
                  marker={marker}
                  onClick={() => focusInconsistency(marker.index, true, false, "editor_offscreen_marker")}
                />
              ))}
            </div>
          )}
        </div>
        <div className="page-controls" aria-label="Seitennavigation">
          <button type="button" onClick={() => navigateToPage(currentPage - 1)} disabled={currentPage === 0}>← Zurück</button>
          <span>Seite {currentPage + 1} von {pageCount}</span>
          <button type="button" onClick={() => navigateToPage(currentPage + 1)} disabled={currentPage >= pageCount - 1}>Weiter →</button>
        </div>
        
      </Slate>
    </div>
    <aside className="conflict-list" aria-label="Found inconsistencies">
      <div className="conflict-list-header">
        <h2>Inconsistencies</h2>
        <button
          type="button"
          className="resolve-all-button"
          onClick={handleToggleAllInconsistencies}
          disabled={navigationItems.length === 0}
        >
          {navigationItems.length > 0 && navigationItems.every((item) =>
            hiddenInconsistencyIds.has(item.id)
          ) ? "Show All" : "Hide All"}
        </button>
      </div>
      <div className="inconsistency-group-shell">
      <details className="inconsistency-group" open>
        <summary>
          <span><strong>Story Facts</strong><small>Timeline, attributes, places, and relationships</small></span>
          <span className="inconsistency-group-count">{inconsistencies.length}</span>
        </summary>
      {inconsistencies.length === 0 ? (
        <p className="conflict-list-empty">
          No Inconsistencies found.
        </p>
      ) : (
        inconsistencies
        .map((inconsistency, index) => ({ inconsistency, index }))
        .sort((first, second) =>
          getSeverityRank(second.inconsistency.severity) -
          getSeverityRank(first.inconsistency.severity)
        )
        .map(({ inconsistency, index }) => {
          const inconsistencyId = getStableInconsistencyId(inconsistency);
          const isHidden = effectiveHiddenInconsistencyIds.has(inconsistencyId);
          const severity = inconsistency.severity ?? "medium";
          const category = INCONSISTENCY_CATEGORY_PRESENTATION[inconsistency.category];
          const factTheme = getFactThemePresentation(inconsistency.predicate);
          const presentationLabel = `${factTheme.label} · ${category.label}`;
          const cardTrackedChanges = trackedChanges.filter(
            (change) => change.inconsistency === inconsistency
          );
          const affectedPositions = getAffectedFactPositions(inconsistency);
          const isResolutionReady = successfulInconsistencyId === inconsistencyId || (
            affectedPositions.length === 0 &&
            cardTrackedChanges.length > 0 &&
            cardTrackedChanges.every((change) => change.accepted)
          );
          return (
            <div
              key={inconsistencyId}
              data-inconsistency-card-id={inconsistencyId}
              className={[
                "conflict-card",
                `conflict-card--${severity}`,
                selectedInconsistencyId === inconsistencyId
                  ? "conflict-card--selected"
                  : "",
                isHidden ? "conflict-card--hidden" : "",
                isResolutionReady ? "conflict-card--success" : "",
              ].filter(Boolean).join(" ")}
            >
              <button
                type="button"
                className="conflict-card-content"
                onClick={() => !isHidden && focusInconsistency(index)}
                aria-pressed={selectedInconsistencyId === inconsistencyId}
                aria-disabled={isHidden}
              >
                <span
                  className="conflict-card-category-emoji"
                  role="img"
                  aria-label={presentationLabel}
                >
                  {factTheme.emoji}
                </span>
                <span className="conflict-card-category-label">
                  {factTheme.label} · {category.label}
                </span>
                <span className="conflict-card-severity">{severity}</span>
                <span className="conflict-card-message">
                  {inconsistency.message}
                </span>
                <span className="conflict-card-facts">
                  {inconsistency.facts.map((fact, factIndex) => {
                    const label = inconsistency.facts.length === 1
                      ? "Statement"
                      : factIndex === 0
                        ? "Earlier"
                        : factIndex === inconsistency.facts.length - 1
                          ? "Later"
                          : "Related";

                    return (
                      <span key={`${fact.predicate}-${factIndex}`} className="conflict-card-fact">
                        <strong>{label}:</strong> {formatFactStatement(fact)}
                      </span>
                    );
                  })}
                </span>
              </button>
              <div className="conflict-card-positions" aria-label="Affected passages">
                <strong>{affectedPositions.length} affected {affectedPositions.length === 1 ? "passage" : "passages"} remaining</strong>
                {affectedPositions.map((position, positionIndex) => (
                  <div
                    className="conflict-card-position"
                    key={`${position.range.anchor.path.join(".")}-${position.range.anchor.offset}`}
                  >
                    <button
                      type="button"
                      className="conflict-card-position-preview"
                      onClick={() => navigateToAffectedPosition(inconsistency, position)}
                      title={position.previewText ?? Editor.string(editor, position.range)}
                    >
                      {position.previewText ?? Editor.string(editor, position.range)}
                    </button>
                    <button
                      type="button"
                      className="conflict-card-position-edit"
                      onClick={() => openSuggestionEditor(inconsistency, positionIndex)}
                      disabled={isResolutionReady}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="conflict-card-position-confirm"
                      onClick={() => confirmAffectedPosition(inconsistency, position)}
                      disabled={isResolutionReady}
                    >
                      Looks good
                    </button>
                  </div>
                ))}
              </div>
              <div className="conflict-card-actions">
                {isResolutionReady && (
                  <button
                    type="button"
                    className="resolved-inconsistency-button"
                    onClick={() => completeResolution(inconsistencyId)}
                  >
                    <span aria-hidden="true">✓</span>
                    Resolved
                  </button>
                )}
                <button
                  type="button"
                  className={`resolve-inconsistency-button${isHidden ? " resolve-inconsistency-button--show" : ""}`}
                  onClick={() => handleToggleInconsistency(inconsistencyId)}
                  aria-pressed={isHidden}
                >
                  <span aria-hidden="true">{isHidden ? "◉" : "⊘"}</span>
                  {isHidden ? "Show" : "Hide"}
                </button>
              </div>
              {suggestionTarget === inconsistency && (
                <form
                  className="suggestion-editor"
                  onSubmit={(event) => {
                    event.preventDefault();
                    handleSuggestChange(
                      inconsistency,
                      suggestionDraft,
                      selectedSuggestionFacts
                    );
                  }}
                >
                  <div className="suggestion-mode-toggle" role="group" aria-label="Editing mode">
                    <button type="button" className={suggestionMode === "replace" ? "is-active" : ""} onClick={() => setSuggestionMode("replace")}>Direct replacement</button>
                    <button type="button" className={suggestionMode === "free" ? "is-active" : ""} onClick={() => {
                      setSuggestionMode("free");
                      beginFreeEditing(inconsistency);
                    }}>Edit freely</button>
                  </div>
                  {suggestionMode === "free" ? (
                    <p className="free-edit-hint">Please edit the text in the editor.</p>
                  ) : <>
                    <label htmlFor={`suggestion-${index}`}>Replacement for the marked text</label>
                    <textarea id={`suggestion-${index}`} value={suggestionDraft} onChange={(event) => setSuggestionDraft(event.target.value)} rows={2} autoFocus />
                    <div className="suggestion-editor-actions">
                      <button
                        type="submit"
                        disabled={selectedSuggestionFacts.size === 0 || !suggestionDraft.trim()}
                      >
                        Add change
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSuggestionTarget(null);
                          setSuggestionDraft("");
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </>}
                </form>
              )}
              {cardTrackedChanges.map((change) => (
                <TrackedChangeDialog
                  key={change.id}
                  expanded={expandedTrackedChangeId === change.id}
                  change={change}
                  onToggle={() => setExpandedTrackedChangeId((current) =>
                    current === change.id ? null : change.id
                  )}
                  onNavigateContext={(contextIndex) =>
                    navigateToTrackedChangeContext(change, contextIndex)
                  }
                  onAccept={() => finishTrackedChange(change, "accept")}
                  onReject={() => finishTrackedChange(change, "reject")}
                />
              ))}
            </div>
          );
        })
      )}
      </details>
      <button
        type="button"
        className="category-visibility-button"
        aria-pressed={hiddenInconsistencyCategories.has("story")}
        onClick={() => toggleInconsistencyCategory("story")}
      >
        {hiddenInconsistencyCategories.has("story") ? "Show marks" : "Hide marks"}
      </button>
      </div>
      <div className="inconsistency-group-shell">
      <details className="inconsistency-group" open>
        <summary>
          <span><strong>Character Continuity</strong><small>Thoughts, knowledge, motives, emotions, and development</small></span>
          <span className="inconsistency-group-count">{characterInconsistencies.length}</span>
        </summary>
        {characterAnalysisError ? (
          <p className="character-consistency-error">{characterAnalysisError}</p>
        ) : characterInconsistencies.length === 0 ? (
          <p className="conflict-list-empty">No character inconsistencies found.</p>
        ) : characterInconsistencies
        .map((issue, issueIndex) => ({ issue, issueIndex }))
        .sort((first, second) =>
          getSeverityRank(second.issue.confidence) -
          getSeverityRank(first.issue.confidence)
        )
        .map(({ issue, issueIndex }) => {
          const issueId = getStableCharacterInconsistencyId(issue);
          const isHidden = effectiveHiddenInconsistencyIds.has(issueId);
          const navigationIndex = inconsistencies.length + issueIndex;
          const issueDecisions = characterDecisions.filter(
            (decision) => decision.inconsistency === issue
          );
          const isResolutionReady = successfulInconsistencyId === issueId || (
            issueDecisions.length > 0 &&
            issue.evidence.every((_, evidenceIndex) =>
              handledCharacterEvidenceKeys.has(`${issueId}:${evidenceIndex}`)
            )
          );
          return (
          <div
            className={[
              "conflict-card",
              `conflict-card--${characterSeverity(issue.confidence)}`,
              selectedInconsistencyId === issueId ? "conflict-card--selected" : "",
              isHidden ? "conflict-card--hidden" : "",
              isResolutionReady ? "conflict-card--success" : "",
            ].filter(Boolean).join(" ")}
            key={issueId}
            data-inconsistency-card-id={issueId}
          >
            <button
              type="button"
              className="conflict-card-content"
              onClick={() => !isHidden && focusInconsistency(navigationIndex)}
              aria-pressed={selectedInconsistencyId === issueId}
              aria-disabled={isHidden}
            >
              <span className="conflict-card-category-emoji" role="img" aria-label="Character continuity">
                {CHARACTER_CATEGORY_EMOJI[issue.category]}
              </span>
              <span className="conflict-card-category-label">
                {issue.character} · {CHARACTER_CATEGORY_PRESENTATION[issue.category]}
              </span>
              <span className="conflict-card-severity">{issue.confidence}</span>
              <span className="conflict-card-message">{issue.message}</span>
              <span className="conflict-card-facts">
                {issue.evidence.map((evidence, evidenceIndex) => (
                  <span className="conflict-card-fact" key={`${evidence.paragraphIndex}-${evidenceIndex}`}>
                    <strong>{evidenceIndex === 0 ? "Earlier" : "Later"}:</strong> “{evidence.quote}”
                  </span>
                ))}
              </span>
            </button>
            <div className="conflict-card-positions" aria-label="Affected character passages">
              <strong>
                {issue.evidence.filter((_, evidenceIndex) =>
                  !handledCharacterEvidenceKeys.has(`${issueId}:${evidenceIndex}`)
                ).length}  affected passages remaining
              </strong>
              {issue.evidence.map((evidence, evidenceIndex) => {
                const isHandled = handledCharacterEvidenceKeys.has(`${issueId}:${evidenceIndex}`);
                if (isHandled) return null;
                return (
                  <div className="conflict-card-position" key={`${evidence.paragraphIndex}-position-${evidenceIndex}`}>
                    <button
                      type="button"
                      className="conflict-card-position-preview"
                      onClick={() => navigateToCharacterEvidence(issue, evidenceIndex)}
                    >
                      “{evidence.quote}”
                    </button>
                    <button
                      type="button"
                      className="conflict-card-position-edit"
                      onClick={() => beginCharacterFreeEditing(issue, evidenceIndex)}
                      disabled={isResolutionReady}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="conflict-card-position-confirm"
                      onClick={() => confirmCharacterEvidence(issue, evidenceIndex)}
                      disabled={isResolutionReady}
                    >
                      Looks good
                    </button>
                  </div>
                );
              })}
            </div>
            <details className="character-consistency-explanation">
              <summary>Explanation</summary>
              <p>{issue.explanation}</p>
              <div className="character-evidence-interpretations">
                {issue.evidence.map((evidence, evidenceIndex) => (
                  <p key={`${evidence.paragraphIndex}-explanation-${evidenceIndex}`}>
                    <strong>{evidenceIndex === 0 ? "Earlier" : "Later"}:</strong>{" "}
                    {evidence.interpretation}
                  </p>
                ))}
              </div>
            </details>
            <div className="conflict-card-actions">
              {isResolutionReady && (
                <button
                  type="button"
                  className="resolved-inconsistency-button"
                  onClick={() => completeResolution(issueId)}
                >
                  <span aria-hidden="true">✓</span>
                  Resolved
                </button>
              )}
              <button
                type="button"
                className={`resolve-inconsistency-button${isHidden ? " resolve-inconsistency-button--show" : ""}`}
                onClick={() => handleToggleInconsistency(issueId)}
                aria-pressed={isHidden}
              >
                <span aria-hidden="true">{isHidden ? "◉" : "⊘"}</span>
                {isHidden ? "Show" : "Hide"}
              </button>
            </div>
            {issueDecisions.map((decision) => (
              <CharacterDecisionDialog
                key={decision.id}
                expanded={expandedTrackedChangeId === decision.id}
                decision={decision}
                onToggle={() => setExpandedTrackedChangeId((current) =>
                  current === decision.id ? null : decision.id
                )}
                onReject={() => revertCharacterDecision(decision)}
              />
            ))}
          </div>
          );
        })}
      </details>
      <button
        type="button"
        className="category-visibility-button"
        aria-pressed={hiddenInconsistencyCategories.has("character")}
        onClick={() => toggleInconsistencyCategory("character")}
      >
        {hiddenInconsistencyCategories.has("character") ? "Show marks" : "Hide marks"}
      </button>
      </div>
    </aside>
  </div>   
  );
}

function CharacterDecisionDialog({ expanded, decision, onToggle, onReject }: {
  expanded: boolean;
  decision: CharacterDecision; onToggle: () => void; onReject: () => void;
}) {
  const title = decision.source === "confirmed" ? "Confirmed Passage" : "Tracked Change";
  return expanded ? (
    <aside className="tracked-change-dialog tracked-change-dialog--inline tracked-change-card--accepted">
      <div className="tracked-change-dialog-header">
        <strong className="tracked-change-dialog-title">{title} · Character Continuity</strong>
        <button type="button" onClick={onToggle} aria-label="Collapse dialog">−</button>
      </div>
      <p>{decision.source === "confirmed" ? "This character passage was marked as correct." : "This character passage was edited freely."}</p>
      <div className="tracked-change-contexts">
        {decision.contexts.map((context, index) => <div className="tracked-change-context" key={index}>
          <span>{context.before}</span>
          {decision.source === "free" ? <><del>{context.original}</del><ins>{context.replacement}</ins></> : <mark>{context.original}</mark>}
          <span>{context.after}</span>
        </div>)}
      </div>
      <div className="tracked-change-actions"><button type="button" onClick={onReject}>Revert decision</button></div>
    </aside>
  ) : (
    <button type="button" className="tracked-change-dialog tracked-change-dialog--inline tracked-change-dialog--minimized tracked-change-card--accepted" onClick={onToggle}>
      <strong>{title}</strong><span>Character Continuity</span>
    </button>
  );
}

function TrackedChangeDialog({
  expanded,
  change,
  onToggle,
  onNavigateContext,
  onAccept,
  onReject,
}: {
  expanded: boolean;
  change: TrackedChange;
  onToggle: () => void;
  onNavigateContext: (contextIndex: number) => void;
  onAccept: () => void;
  onReject: () => void;
}) {
  const factTheme = getFactThemePresentation(change.inconsistency.predicate);
  const category = INCONSISTENCY_CATEGORY_PRESENTATION[change.inconsistency.category];
  const shortTitle = `${factTheme.label} · ${category.label}`;

  return !expanded ? (
      <button
        type="button"
        className={`tracked-change-dialog tracked-change-dialog--inline tracked-change-dialog--minimized${change.accepted ? " tracked-change-card--accepted" : ""}`}
        onClick={onToggle}
        title={`Expand ${shortTitle}`}
        aria-expanded="false"
      >
        <strong>{change.source === "confirmed" ? "Confirmed Passage" : "Tracked Change"}</strong>
        <span>{shortTitle}</span>
      </button>
    ) : (
    <aside
      className={`tracked-change-dialog tracked-change-dialog--inline${change.accepted ? " tracked-change-card--accepted" : ""}`}
      aria-label="Tracked change"
    >
      <div className="tracked-change-dialog-header">
        <strong className="tracked-change-dialog-title">{change.source === "confirmed" ? "Confirmed Passage" : "Tracked Change"} · {shortTitle}</strong>
        <button type="button" onClick={onToggle} aria-label="Collapse dialog">−</button>
      </div>
      <p>
        {change.source === "confirmed"
          ? "This passage was marked as correct without changing the text."
          : change.source === "free"
          ? `Free edit in ${change.occurrenceCount} ${change.occurrenceCount === 1 ? "passage" : "passages"}`
          : <>
              Replace {change.replacedValues.join(", ")} with {change.replacement}
              {change.occurrenceCount > 1 ? ` (${change.occurrenceCount} occurrences)` : ""}
            </>}
      </p>
      <div className="tracked-change-contexts" aria-label="Changed text context">
        {change.contexts.map((context, index) => (
          <button
            type="button"
            className="tracked-change-context"
            key={index}
            onClick={() => onNavigateContext(index)}
            title="Scroll to this passage"
          >
            <strong className="tracked-change-context-label">
              {change.source === "confirmed" ? "Looks good" : context.changed ? "Changed passage" : "Related passage"}
            </strong>
            <span>{context.before}</span>
            {context.changed ? <>
              <del>{context.original}</del>
              <ins>{context.replacement}</ins>
            </> : <mark>{context.original}</mark>}
            <span>{context.after}</span>
          </button>
        ))}
      </div>
      <div className="tracked-change-actions">
        {!change.accepted && (
          <button type="button" onClick={onAccept}>
            {ENABLE_AI_CHANGE_ACCEPT_CHECK ? "Check these changes" : "Accept changes"}
          </button>
        )}
        <button type="button" onClick={onReject}>
          {change.source === "confirmed" ? "Revert decision" : "Remove change"}
        </button>
      </div>
    </aside>
  );
}

const offscreenMarkerSizeHistory = new Map<string, { size: number; updatedAt: number }>();

function OffscreenMarker({
  direction,
  marker,
  onClick,
}: {
  direction: "above" | "below";
  marker: OffscreenInconsistency;
  onClick: () => void;
}) {
  const markerSize = Math.max(32, marker.occurrenceCount * 16 + 8);
  const markerHistoryKey = `${direction}:${marker.index}`;
  const [displayedMarkerSize, setDisplayedMarkerSize] = useState(() => {
    const previous = offscreenMarkerSizeHistory.get(markerHistoryKey);
    return previous && performance.now() - previous.updatedAt < 2000
      ? previous.size
      : markerSize;
  });

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setDisplayedMarkerSize(markerSize);
      offscreenMarkerSizeHistory.set(markerHistoryKey, {
        size: markerSize,
        updatedAt: performance.now(),
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [markerHistoryKey, markerSize]);

  if (marker.occurrenceCount <= 0) return null;

  const countStatus = marker.successful ? "treated" : "open";
  const label = `${marker.label}: ${marker.detail}, ${marker.occurrenceCount} ${countStatus} ${marker.occurrenceCount === 1 ? "passage" : "passages"}, ${direction === "above" ? "above" : "below"} the visible editor area`;

  return (
    <button
      type="button"
      className={`offscreen-inconsistency-marker offscreen-inconsistency-marker--${direction} offscreen-inconsistency-marker--${marker.severity}${marker.successful ? " offscreen-inconsistency-marker--success" : ""}`}
      style={{
        left: `${marker.edgeOffset}px`,
        "--marker-opacity": marker.opacity,
        "--marker-size": `${displayedMarkerSize}px`,
      } as React.CSSProperties}
      onClick={onClick}
      aria-label={`${label}. Scroll to this inconsistency.`}
    >
      <span className="offscreen-inconsistency-marker-icon" aria-hidden="true">{marker.emoji}</span>
      <span className="offscreen-inconsistency-tooltip" aria-hidden="true">
        <strong>{marker.label}</strong>
        <span>{marker.detail} · {marker.occurrenceCount} {countStatus}</span>
      </span>
    </button>
  );
}

/* -----------------------------
   Toolbar
----------------------------- */

function Toolbar({
    onTextLoad,
    onHtmlLoad,
    onExampleLoad,
    onAnalyze,
    analyzing,
    documentZoom,
    onDocumentZoomChange,
}:{
    onTextLoad: (text:string) => void;
    onHtmlLoad: (text:string) => void;
    onExampleLoad: () => void;
    onAnalyze: () => void;
    analyzing: boolean;
    documentZoom: number;
    onDocumentZoomChange: (zoom: number) => void;
}) {
  const changeZoom = (nextZoom: number) => {
    onDocumentZoomChange(Math.min(180, Math.max(60, nextZoom)));
  };

  return (
    <div className="toolbar">
      <MarkButton format="bold">B</MarkButton>
      <MarkButton format="italic">I</MarkButton>
      <MarkButton format="underline">U</MarkButton>

      <BlockButton format="heading-one">
        H1
      </BlockButton>
      <BlockButton format="paragraph">
        p
      </BlockButton>
      <LinkButton />
      <FileUploader onTextLoad={onTextLoad} onHtmlLoad={onHtmlLoad}></FileUploader>
      <button
        type="button"
        onMouseDown={(event) => {
          event.preventDefault();
          onExampleLoad();
        }}
      >
        Example Text
      </button>
      <div className="document-zoom-controls" role="group" aria-label="Document zoom">
        <button
          type="button"
          onClick={() => changeZoom(documentZoom - 10)}
          disabled={documentZoom <= 60}
          aria-label="Zoom out"
          title="Zoom out"
        >
          −
        </button>
        <button
          type="button"
          className="document-zoom-value"
          onClick={() => changeZoom(100)}
          aria-label={`Reset document zoom. Current zoom ${documentZoom} percent`}
          title="Reset to 100%"
        >
          {documentZoom}%
        </button>
        <button
          type="button"
          onClick={() => changeZoom(documentZoom + 10)}
          disabled={documentZoom >= 180}
          aria-label="Zoom in"
          title="Zoom in"
        >
          +
        </button>
      </div>
      <button
        type="button"
        className="analyze-text-button"
        onMouseDown={(event) => {
          event.preventDefault();
          onAnalyze();
        }}
        disabled={analyzing}
      >
        {analyzing ? "Analyzing..." : "Analyze Text"}
      </button>
    </div>
  );
}

/* -----------------------------
   Marks
----------------------------- */

function MarkButton({
  format,
  children,
}: {
  format: MarkFormat;
  children: React.ReactNode;
}) {
  const editor = useSlate();

  return (
    <button
      type="button"
      onMouseDown={(event) => {
        event.preventDefault();

        const isActive = isMarkActive(editor, format);

        if (isActive) {
          Editor.removeMark(editor, format);
        } else {
          Editor.addMark(editor, format, true);
        }
      }}
    >
      {children}
    </button>
  );
}

function isMarkActive(
  editor: Editor,
  format: MarkFormat
) {
  const marks = Editor.marks(editor);

  return marks ? marks[format] === true : false;
}

/* -----------------------------
   Blocks
----------------------------- */

function BlockButton({
  format,
  children,
}: {
  format: CustomElement["type"];
  children: React.ReactNode;
}) {
  const editor = useSlate();

  return (
    <button
      type="button"
      onMouseDown={(event) => {
        event.preventDefault();

        Transforms.setNodes(
          editor,
          { type: format },
          {
            match: (node) =>
              SlateElement.isElement(node) &&
              Editor.isBlock(editor, node),
          }
        );
      }}
    >
      {children}
    </button>
  );
}

/* -----------------------------
   Links
----------------------------- */

function LinkButton() {
  const editor = useSlate();

  return (
    <button
      type="button"
      onMouseDown={(event) => {
        event.preventDefault();

        const url = window.prompt("URL:");

        if (!url) return;

        const link: LinkElement = {
          type: "link",
          url,
          children: [{ text: url }],
        };

        Transforms.insertNodes(editor, link);
      }}
    >
      Link
    </button>
  );
}

/* -----------------------------
   Rendering
----------------------------- */
function renderElement({
  attributes,
  children,
  element,
}: any) {
  switch (element.type) {
    case "heading-one":
      return (
        <h1 {...attributes}>
          {children}
        </h1>
      );

    case "link":
      return (
        <a
        {...attributes}
        href={element.url}
        target="_blank"
        rel="noopener noreferrer"
        onMouseDown={(event) => {
          if (event.ctrlKey || event.metaKey) {
            event.preventDefault();

            window.open(
              element.url,
              "_blank",
              "noopener,noreferrer"
            );
          }
        }}
        style={{
          color: "blue",
          textDecoration: "underline",
          cursor: "pointer",
        }}
      >
        {children}
      </a>
      );

    case "paragraph":
      return (
        <p {...attributes}>
          {children}
        </p>
      );

    default:
      return (
        <p {...attributes}>
          {children}
        </p>
      );
  }
}

function renderLeaf({
  attributes,
  children,
  leaf,
  activeInconsistencyId,
  activeInconsistencyImpact,
  jitterSuppressedIds,
  hiddenInconsistencyIds,
  transitionHiddenInconsistencyIds,
  successfulInconsistencyId,
  finalizingChangeIds,
  finalizingInsertionOnlyChangeIds,
  visibleConfirmedChangeIds,
  onConflictHoverChange,
}: any) {
  const roleInconsistencyIds: string[] =
    leaf.inconsistencyRole === "conflict"
      ? leaf.conflictInconsistencyIds ?? []
      : leaf.inconsistencyRole === "context"
        ? leaf.previewInconsistencyIds ?? []
        : leaf.sentenceInconsistencyIds ?? [];
  const visibleRoleInconsistencyIds = roleInconsistencyIds.filter(
    (id) => !hiddenInconsistencyIds.has(id)
  );
  const isHidden = roleInconsistencyIds.length > 0 && visibleRoleInconsistencyIds.length === 0;
  const isTransitionHidden = roleInconsistencyIds.some(
    (id) => transitionHiddenInconsistencyIds.has(id)
  );
  const transitionClass = isTransitionHidden
    ? "inconsistency-mark--transition-hidden"
    : "";
  const activeRoleInconsistencyIds =
    leaf.inconsistencyRole === "conflict"
      ? leaf.conflictInconsistencyIds
      : leaf.inconsistencyRole === "context"
        ? leaf.previewInconsistencyIds
        : leaf.sentenceInconsistencyIds;
  const belongsToActiveScope =
    activeInconsistencyId !== null &&
    activeRoleInconsistencyIds?.includes(activeInconsistencyId);
  const belongsToActiveSentence =
    activeInconsistencyId !== null &&
    leaf.sentenceInconsistencyIds?.includes(activeInconsistencyId);
  const isSuccessful = successfulInconsistencyId !== null &&
    leaf.inconsistencyIds?.includes(successfulInconsistencyId);
  const renderAsActiveSentence =
    belongsToActiveSentence && !belongsToActiveScope && !isSuccessful;
  const suppressJitter = leaf.inconsistencyIds?.some(
    (id: string) => jitterSuppressedIds.has(id)
  );
  if (leaf.bold) {
    children = <strong>{children}</strong>;
  }

  if (leaf.italic) {
    children = <em>{children}</em>;
  }

  if (leaf.underline) {
    children = <u>{children}</u>;
  }

  if (leaf.changeType === "deletion") {
    children = <del className={`tracked-deletion${leaf.changeAccepted ? " tracked-deletion--accepted" : ""}`}>{children}</del>;
  } else if (leaf.changeType === "insertion") {
    children = <ins className={`tracked-insertion${leaf.changeAccepted ? " tracked-insertion--accepted" : ""}`}>{children}</ins>;
  }

  if (
    leaf.confirmedCorrect &&
    leaf.changeId &&
    visibleConfirmedChangeIds.has(leaf.changeId)
  ) {
    children = <mark className="confirmed-correct-passage">{children}</mark>;
  }

  return (
    <span
      style={
        leaf.suggestionPreview
          ? {
              animationName:
                (leaf.replayVersion ?? 0) % 2 === 0
                  ? "sentence-suggestion-preview-a"
                  : "sentence-suggestion-preview-b",
            }
          : leaf.inconsistencyRole === "conflict" &&
        activeInconsistencyId !== null &&
        leaf.replayVersion &&
        !belongsToActiveScope &&
        !isHidden &&
        !suppressJitter
          ? {
              animationName:
                leaf.replayVersion % 2 === 0
                  ? "inconsistency-jitter-replay-a"
                  : "inconsistency-jitter-replay-b",
              animationDuration: "1s",
              animationTimingFunction: "ease-in-out",
              animationFillMode: "both",
              animationDelay: "0ms",
            }
          : undefined
      }
      {...attributes}
      data-change-id={leaf.changeId || undefined}
      data-change-type={leaf.changeType || undefined}
      data-suggestion-preview={leaf.suggestionPreview || undefined}
      data-free-edit-insertion={leaf.freeEditInsertion || undefined}
      data-inconsistency-role={leaf.inconsistencyRole}
      data-preview-inconsistency-ids={
        leaf.previewInconsistencyIds?.filter((id: string) => !hiddenInconsistencyIds.has(id)).join(" ") || undefined
      }
      data-sentence-inconsistency-ids={
        leaf.sentenceInconsistencyIds?.join(" ") || undefined
      }
      data-inconsistency-ids={
        leaf.inconsistencyRole
          ? leaf.inconsistencyIds?.join(" ")
          : undefined
      }
      data-conflict-inconsistency-ids={
        leaf.inconsistencyRole === "conflict"
          ? visibleRoleInconsistencyIds.join(" ") || undefined
          : undefined
      }
      className={[
        leaf.suggestionPreview
          ? "sentence-suggestion-preview"
          : isHidden
          ? undefined
          : isSuccessful && leaf.inconsistencyRole !== "conflict"
          ? undefined
          : renderAsActiveSentence
          ? [
              "inconsistency-sentence",
              "inconsistency-sentence--active",
              isSuccessful ? "inconsistency-mark--success" : "",
            ].join(" ")
          : leaf.freeEditInsertion
          ? "free-edit-insertion"
          : leaf.inconsistencyRole === "conflict"
          ? [
              "inconsistent-text",
              isSuccessful ? "inconsistency-mark--success" : "",
              `inconsistent-text--${
                leaf.inconsistencySeverity ?? "medium"
              }`,
              belongsToActiveScope ? "inconsistency-scope-active" : "",
              belongsToActiveScope
                ? `inconsistency-scope-active--${activeInconsistencyImpact}`
                : "",
              belongsToActiveScope ? "inconsistency-scope-active--conflict" : "",
              suppressJitter ? "inconsistent-text--no-jitter" : "",
              transitionClass,
            ].filter(Boolean).join(" ")
          : leaf.inconsistencyRole === "context"
            ? [
                "inconsistency-context",
                isSuccessful ? "inconsistency-mark--success" : "",
                belongsToActiveScope
                  ? "inconsistency-context--active"
                  : "",
                belongsToActiveScope ? "inconsistency-scope-active" : "",
                belongsToActiveScope
                  ? `inconsistency-scope-active--${activeInconsistencyImpact}`
                  : "",
                belongsToActiveScope ? "inconsistency-scope-active--context" : "",
                transitionClass,
              ].filter(Boolean).join(" ")
            : leaf.inconsistencyRole === "sentence"
              ? [
                  "inconsistency-sentence",
                  isSuccessful ? "inconsistency-mark--success" : "",
                  belongsToActiveScope
                    ? "inconsistency-sentence--active"
                    : "",
                  transitionClass,
                ].filter(Boolean).join(" ")
              : undefined,
        leaf.changeId && finalizingChangeIds.has(leaf.changeId)
          ? "tracked-change-finalizing"
          : "",
        leaf.changeId && finalizingInsertionOnlyChangeIds.has(leaf.changeId)
          ? "tracked-change-finalizing--insertion-only"
          : "",
      ].filter(Boolean).join(" ") || undefined}
      onMouseEnter={
        (leaf.inconsistencyRole === "conflict" || leaf.inconsistencyRole === "context") && !isHidden
          ? () => onConflictHoverChange(visibleRoleInconsistencyIds[0] ?? null)
          : undefined
      }
      onMouseLeave={
        (leaf.inconsistencyRole === "conflict" || leaf.inconsistencyRole === "context") && !isHidden
          ? () => onConflictHoverChange(null)
          : undefined
      }
    >
      {children}
    </span>
  );
}
