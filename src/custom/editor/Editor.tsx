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
import { getEditorText } from "./getEditorText";
import {
  checkConsistency,
  type Inconsistency,
  type InconsistencyCategory,
  type InconsistencySeverity,
} from './../../ai/consistencyChecker';
import EditorNavigation, { type InconsistentPath } from "./EditorNavigation";
import { EXAMPLE_TEXT } from "./exampleText";
import { EXAMPLE_FACTS } from "./exampleFacts";

import type { StoryContext } from "../../types/story";

type CustomText = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  inconsistent?: boolean;
  changeId?: string;
  changeType?: "insertion" | "deletion";
};

type TrackedChange = {
  id: string;
  inconsistency: Inconsistency;
  replacement: string;
  replacedValues: string[];
  occurrenceCount: number;
  rewritesEntireSentence: boolean;
  paragraphIndices: number[];
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
  category: InconsistencyCategory;
  predicate: string;
  edgeOffset: number;
  opacity: number;
};

type OffscreenFactPreview = {
  key: string;
  direction: "above" | "below";
  before: string;
  fact: string;
  after: string;
  distance: number;
};

type FactPreviewConnection = {
  key: string;
  path: string;
};

type SentenceRewriteCandidate = {
  key: string;
  text: string;
  range: BaseRange;
};

type SentenceSuggestionPreview = BaseRange & {
  suggestionPreview: true;
  replayVersion: number;
};

const stableInconsistencyIds = new WeakMap<Inconsistency, string>();
let nextStableInconsistencyId = 0;

function getStableInconsistencyId(inconsistency: Inconsistency): string {
  const existingId = stableInconsistencyIds.get(inconsistency);
  if (existingId) {
    return existingId;
  }

  const id = `inconsistency-${nextStableInconsistencyId++}`;
  stableInconsistencyIds.set(inconsistency, id);
  return id;
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
      replayVersion?: number;
    };
  }
}

const initialValue: Descendant[] = [
  {
    type: "paragraph",
    children: [
      {
        text: "Hallo! Das ist mein Rich-Text-Editor.",
      },
    ],
  },
];

function normalizeSearchText(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
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
  const [inconsistentPaths, setInconsistentPaths] = useState<InconsistentPath[]>([]);
  const [inconsistentRanges, setInconsistentRanges] = useState<InconsistentTextRange[]>([]);
  const [hiddenInconsistencyIds, setHiddenInconsistencyIds] =
    useState<Set<string>>(() => new Set());
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
  const editorScrollRef = useRef<HTMLDivElement>(null);
  const editorScrollShellRef = useRef<HTMLDivElement>(null);
  const [offscreenAbove, setOffscreenAbove] =
    useState<OffscreenInconsistency[]>([]);
  const [offscreenBelow, setOffscreenBelow] =
    useState<OffscreenInconsistency[]>([]);
  const [offscreenFactPreviews, setOffscreenFactPreviews] =
    useState<OffscreenFactPreview[]>([]);
  const [factPreviewConnections, setFactPreviewConnections] =
    useState<FactPreviewConnection[]>([]);
  const [trackedChanges, setTrackedChanges] = useState<TrackedChange[]>([]);
  const nextTrackedChangeId = useRef(0);
  const [suggestionTarget, setSuggestionTarget] =
    useState<Inconsistency | null>(null);
  const [suggestionDraft, setSuggestionDraft] = useState("");
  const [rewriteEntireSentence, setRewriteEntireSentence] = useState(false);
  const [sentenceRewriteTarget, setSentenceRewriteTarget] = useState("");
  const [sentenceSuggestionPreview, setSentenceSuggestionPreview] =
    useState<SentenceSuggestionPreview | null>(null);
  const sentenceSuggestionReplayVersion = useRef(0);

  const [analysis, setAnalysis] =
    useState<FactExtraction | null>(null);

  const [analyzing, setAnalyzing] = useState(false);

  const [, setAnalysisError] = useState("");

  const [document, setDocument] = useState<Descendant[]>(initialValue);
  const [currentPage, setCurrentPage] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [pageLineWidths, setPageLineWidths] = useState<number[][]>([[]]);
  const [pageLineTops, setPageLineTops] = useState<number[][]>([[]]);
  const [blockPageIndices, setBlockPageIndices] = useState<number[]>([0]);
  const [inconsistencyPageIndices, setInconsistencyPageIndices] = useState<number[]>([]);
  const [inconsistencyPositions, setInconsistencyPositions] = useState<Array<{ page: number; x: number; y: number }>>([]);

  const updatePagination = useCallback(() => {
    const container = editorScrollRef.current;
    if (!container) return;
    const editable = container.firstElementChild as HTMLElement | null;
    editable?.style.setProperty("--editor-page-height", `${container.clientHeight}px`);
    const count = Math.max(1, Math.ceil(container.scrollHeight / container.clientHeight));
    setPageCount(count);
    setCurrentPage(Math.min(count - 1, Math.max(0, Math.round(container.scrollTop / Math.max(1, container.clientHeight)))));
  }, []);

  const navigateToPage = useCallback((page: number) => {
    const container = editorScrollRef.current;
    if (!container) return;
    const target = Math.min(pageCount - 1, Math.max(0, page));
    container.scrollTo({ top: target * container.clientHeight, behavior: "smooth" });
    setCurrentPage(target);
  }, [pageCount]);

  const layoutParagraphsAcrossPages = useCallback(() => {
    const container = editorScrollRef.current;
    const editable = container?.firstElementChild as HTMLElement | null;
    if (!container || !editable || container.clientHeight === 0) return;

    const pageHeight = container.clientHeight;
    editable.style.setProperty("--editor-page-height", `${pageHeight}px`);
    const blocks = Array.from(
      editable.querySelectorAll<HTMLElement>(":scope > [data-slate-node='element']")
    );

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
    const measuredInconsistencyPositions = inconsistencies.map((inconsistency) => {
      const id = getStableInconsistencyId(inconsistency);
      const marker = editable.querySelector<HTMLElement>(
        `[data-conflict-inconsistency-ids~="${id}"]`
      );
      if (!marker) return { page: 0, x: 50, y: 8 };
      const rect = marker.getBoundingClientRect();
      const relativeTop = rect.top + rect.height / 2 - editableRect.top;
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
    const contentWidth = Math.max(1, editable.clientWidth - 124);
    const visualLines = new Map<number, { left: number; right: number; top: number }>();
    const walker = window.document.createTreeWalker(editable, NodeFilter.SHOW_TEXT);
    let textNode = walker.nextNode();

    while (textNode) {
      if (textNode.textContent?.trim()) {
        const range = window.document.createRange();
        range.selectNodeContents(textNode);
        for (const rect of Array.from(range.getClientRects())) {
          if (rect.width === 0 || rect.height === 0) continue;
          const relativeTop = rect.top - editableRect.top;
          const lineKey = Math.round(relativeTop / 2) * 2;
          const existing = visualLines.get(lineKey);
          visualLines.set(lineKey, existing ? {
            left: Math.min(existing.left, rect.left),
            right: Math.max(existing.right, rect.right),
            top: Math.min(existing.top, relativeTop),
          } : { left: rect.left, right: rect.right, top: relativeTop });
        }
      }
      textNode = walker.nextNode();
    }

    const measuredPageCount = Math.max(1, Math.ceil(editable.scrollHeight / pageHeight));
    const measuredLines = Array.from({ length: measuredPageCount }, () => [] as number[]);
    const measuredLineTops = Array.from({ length: measuredPageCount }, () => [] as number[]);
    Array.from(visualLines.values())
      .sort((a, b) => a.top - b.top)
      .forEach((line) => {
        const page = Math.min(measuredPageCount - 1, Math.max(0, Math.floor(line.top / pageHeight)));
        measuredLines[page].push(Math.min(100, Math.max(8, ((line.right - line.left) / contentWidth) * 100)));
        measuredLineTops[page].push(((line.top % pageHeight) / pageHeight) * 100);
      });
    setPageLineWidths((current) =>
      JSON.stringify(current) === JSON.stringify(measuredLines) ? current : measuredLines
    );
    setPageLineTops((current) =>
      JSON.stringify(current) === JSON.stringify(measuredLineTops) ? current : measuredLineTops
    );

    requestAnimationFrame(updatePagination);
  }, [inconsistencies, updatePagination]);

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

        segments.push({
          anchor: { path, offset: start },
          focus: { path, offset: end },
          inconsistent: true,
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

      if (
        sentenceSuggestionPreview &&
        Path.equals(sentenceSuggestionPreview.anchor.path, path)
      ) {
        return [...segments, sentenceSuggestionPreview];
      }

      return segments;
    },
    [inconsistentRanges, sentenceSuggestionPreview]
  );

  function focusInconsistency(index: number) {
    const inconsistency = inconsistencies[index];
    if (!inconsistency) {
      return;
    }
    const inconsistencyId = getStableInconsistencyId(inconsistency);

    if (selectedInconsistencyId === inconsistencyId) {
      setSelectedInconsistencyId(null);
      selectedInconsistencyIdRef.current = null;
      setActiveInconsistencyId(null);
      return;
    }

    const range = inconsistentRanges.find(
      (candidate) => candidate.conflictInconsistencyIds.includes(inconsistencyId)
    );

    if (!range) {
      return;
    }

    setActiveInconsistencyId(inconsistencyId);
    setSelectedInconsistencyId(inconsistencyId);
    selectedInconsistencyIdRef.current = inconsistencyId;
    animationReplayVersion.current += 1;
    const replayVersion = animationReplayVersion.current;

    setInconsistentRanges((ranges) =>
      ranges.map((candidate) =>
        candidate.inconsistencyIds.includes(inconsistencyId)
          ? { ...candidate, replayVersion }
          : candidate
      )
    );

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
    const positions = inconsistencies.map((inconsistency, index) => {
      const id = getStableInconsistencyId(inconsistency);
      if (hiddenInconsistencyIds.has(id)) {
        return null;
      }
      const elements = Array.from(
        scrollContainer.querySelectorAll<HTMLElement>("[data-conflict-inconsistency-ids]")
      ).filter((element) =>
        element.dataset.conflictInconsistencyIds?.split(" ").includes(id)
      );

      if (elements.length === 0) {
        return null;
      }

      const rects = elements.map((element) => element.getBoundingClientRect());

      if (rects.every((rect) => rect.bottom < viewport.top)) {
        const closestRect = rects.reduce((closest, rect) =>
          rect.bottom > closest.bottom ? rect : closest
        );

        return {
          index,
          severity: inconsistency.severity ?? "medium",
          category: inconsistency.category,
          predicate: inconsistency.predicate,
          direction: "above" as const,
          distance: viewport.top - closestRect.bottom,
          edgeOffset: Math.min(
            viewport.width - 14,
            Math.max(14, closestRect.left + closestRect.width / 2 - viewport.left)
          ),
        };
      }

      if (rects.every((rect) => rect.top > viewport.bottom)) {
        const closestRect = rects.reduce((closest, rect) =>
          rect.top < closest.top ? rect : closest
        );

        return {
          index,
          severity: inconsistency.severity ?? "medium",
          category: inconsistency.category,
          predicate: inconsistency.predicate,
          direction: "below" as const,
          distance: closestRect.top - viewport.bottom,
          edgeOffset: Math.min(
            viewport.width - 14,
            Math.max(14, closestRect.left + closestRect.width / 2 - viewport.left)
          ),
        };
      }

      return null;
    }).filter((position): position is NonNullable<typeof position> => position !== null);

    const markersFor = (direction: "above" | "below") => {
      const minimumOffset = 16;
      const maximumOffset = Math.max(minimumOffset, viewport.width - 16);
      const markerGap = 28;
      const markers = positions
        .filter((position) => position.direction === direction)
        .sort((a, b) => a.edgeOffset - b.edgeOffset)
        .map(({ index, severity, category, predicate, edgeOffset, distance }) => ({
          index,
          severity,
          category,
          predicate,
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
  }, [inconsistencies, hiddenInconsistencyIds]);

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
      hiddenInconsistencyIds.has(activeInconsistencyId)
    ) {
      setOffscreenFactPreviews([]);
      return;
    }

    const viewport = scrollContainer.getBoundingClientRect();
    const contextElements = Array.from(
      scrollContainer.querySelectorAll<HTMLElement>("[data-preview-inconsistency-ids]")
    ).filter((element) =>
      element.dataset.inconsistencyRole === "context" &&
      element.dataset.previewInconsistencyIds
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
        direction,
        before: blockText.slice(sentenceStart, factStart).trimStart(),
        fact: blockText.slice(factStart, factEnd),
        after: blockText.slice(factEnd, sentenceEnd).trimEnd(),
        distance: direction === "above"
          ? viewport.top - rect.bottom
          : rect.top - viewport.bottom,
      }];
    });

    setOffscreenFactPreviews(previews.sort((first, second) => first.distance - second.distance));
  }, [activeInconsistencyId, hiddenInconsistencyIds]);

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
    const conflictElement = Array.from(
      scrollContainer.querySelectorAll<HTMLElement>("[data-conflict-inconsistency-ids]")
    ).find((element) =>
      element.dataset.conflictInconsistencyIds
        ?.split(" ")
        .includes(activeInconsistencyId)
    );

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

  const text = normalizeSearchText(getNodeText(node));
  const subject = normalizeSearchText(fact.subject);
  const value = normalizeSearchText(fact.object ?? fact.value);

  return subject !== "" && text.includes(subject) && (value === "" || text.includes(value));
}

function getFactParagraphIndex(
  editor: Editor,
  fact: Inconsistency["facts"][number]
): number | null {
  const sourceIndex = fact.source?.paragraphIndex;

  if (
    sourceIndex !== undefined &&
    editor.children[sourceIndex] !== undefined &&
    paragraphContainsFact(editor.children[sourceIndex], fact)
  ) {
    return sourceIndex;
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

function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isMoreSevere(
  candidate: InconsistencySeverity | undefined,
  current: InconsistencySeverity | undefined
): boolean {
  const severityRank: Record<InconsistencySeverity, number> = {
    low: 1,
    medium: 2,
    high: 3,
    critical: 4,
  };

  return (
    severityRank[candidate ?? "medium"] >
    severityRank[current ?? "medium"]
  );
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

  return new RegExp(`\\b${escapeForRegExp(String(value))}\\b`, "gi");
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

function getInconsistentTextRanges(
  editor: Editor,
  inconsistencies: Inconsistency[]
): InconsistentTextRange[] {
  const ranges: InconsistentTextRange[] = [];

  for (const inconsistency of inconsistencies) {
    const inconsistencyId = getStableInconsistencyId(inconsistency);
    const conflictFact = getConflictingFact(inconsistency);

    for (const fact of inconsistency.facts) {
      const pattern = getFactHighlightPattern(fact);
      if (!pattern) {
        continue;
      }

      const paragraphIndex = getFactParagraphIndex(editor, fact);
      if (paragraphIndex === null) {
        continue;
      }

      for (const [node, path] of SlateNode.texts(editor)) {
        if (path[0] !== paragraphIndex) {
          continue;
        }

        const block = editor.children[path[0]];
        const blockText = block ? normalizeSearchText(getNodeText(block)) : "";
        const subject = normalizeSearchText(fact.subject);
        const object = normalizeSearchText(fact.object ?? fact.value);

        if (!blockText.includes(subject) || (object !== "" && !blockText.includes(object))) {
          continue;
        }

        for (const match of node.text.matchAll(pattern)) {
          if (match.index === undefined || match[0].length === 0) {
            continue;
          }

          const anchor = { path, offset: match.index };
          const focus = { path, offset: match.index + match[0].length };
          const sentenceOffsets = getSentenceOffsets(
            node.text,
            match.index,
            match.index + match[0].length
          );
          const hasSentenceRange = ranges.some((range) =>
            range.inconsistencyRole === "sentence" &&
            range.inconsistencyIds.includes(inconsistencyId) &&
            Path.equals(range.anchor.path, path) &&
            range.anchor.offset === sentenceOffsets.start &&
            range.focus.offset === sentenceOffsets.end
          );

          if (!hasSentenceRange) {
            ranges.push({
              anchor: { path, offset: sentenceOffsets.start },
              focus: { path, offset: sentenceOffsets.end },
              inconsistent: true,
              inconsistencyRole: "sentence",
              inconsistencyIds: [inconsistencyId],
              conflictInconsistencyIds: [],
            });
          }

          const existingRange = ranges.find((range) =>
            range.inconsistencyRole !== "sentence" &&
            Path.equals(range.anchor.path, anchor.path) &&
            range.anchor.offset === anchor.offset &&
            range.focus.offset === focus.offset
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
            anchor,
            focus,
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
    setInconsistentPaths([]);
    setInconsistentRanges([]);
    setActiveInconsistencyId(null);
    setSelectedInconsistencyId(null);
    selectedInconsistencyIdRef.current = null;
    setJitterSuppressedIds(new Set());
    replaceEditorContent(paragraphs);
  }

  async function handleAnalyze() {
    setAnalyzing(true);
    setAnalysisError("");

    try {
      const text = getEditorText(editor.children);
      console.log('editor-text: ',text);
      if (!text.trim()) {
        setAnalysisError("The editor is empty.");
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

    } catch (error) {
      console.error(error);

      setAnalysisError(
        error instanceof Error
          ? error.message
          : "Unknown error"
      );
    } finally {
      setAnalyzing(false);
    }
  }

  function handleToggleAllInconsistencies() {
    const allAreHidden = inconsistencies.length > 0 && inconsistencies.every(
      (item) => hiddenInconsistencyIds.has(getStableInconsistencyId(item))
    );
    setHiddenInconsistencyIds(allAreHidden
      ? new Set()
      : new Set(inconsistencies.map(getStableInconsistencyId))
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
    const willHide = !hiddenInconsistencyIds.has(inconsistencyId);
    setHiddenInconsistencyIds((current) => {
      const next = new Set(current);
      if (next.has(inconsistencyId)) next.delete(inconsistencyId);
      else next.add(inconsistencyId);
      return next;
    });
    if (willHide && selectedInconsistencyId === inconsistencyId) {
      setActiveInconsistencyId(null);
      setSelectedInconsistencyId(null);
      selectedInconsistencyIdRef.current = null;
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

  function getSuggestionTargetFacts(inconsistency: Inconsistency) {
    const orderedFacts = [...inconsistency.facts].sort(
      (first, second) =>
        (first.source?.paragraphIndex ?? Number.MAX_SAFE_INTEGER) -
        (second.source?.paragraphIndex ?? Number.MAX_SAFE_INTEGER)
    );
    const baseValue = orderedFacts[0]?.object ?? orderedFacts[0]?.value;
    const conflictingFact = getConflictingFact(inconsistency);

    return inconsistency.category === "exclusive_fact"
      ? orderedFacts.filter(
          (fact) =>
            normalizeSearchText(fact.object ?? fact.value) !==
            normalizeSearchText(baseValue)
        )
      : conflictingFact
        ? [conflictingFact]
        : [];
  }

  function getSentenceRewriteCandidates(inconsistency: Inconsistency) {
    const candidates = new Map<string, SentenceRewriteCandidate>();

    for (const fact of getSuggestionTargetFacts(inconsistency)) {
      const paragraphIndex = getFactParagraphIndex(editor, fact);
      const pattern = getFactHighlightPattern(fact);
      if (paragraphIndex === null || !pattern) {
        continue;
      }

      for (const [node, path] of SlateNode.texts(editor)) {
        if (path[0] !== paragraphIndex || node.changeType) {
          continue;
        }

        for (const match of node.text.matchAll(pattern)) {
          if (match.index === undefined || match[0].length === 0) {
            continue;
          }

          const offsets = getSentenceOffsets(
            node.text,
            match.index,
            match.index + match[0].length
          );
          const key = `${path.join(".")}:${offsets.start}:${offsets.end}`;
          candidates.set(key, {
            key,
            text: node.text.slice(offsets.start, offsets.end).trim(),
            range: {
              anchor: { path, offset: offsets.start },
              focus: { path, offset: offsets.end },
            },
          });
        }
      }
    }

    return Array.from(candidates.values());
  }

  function previewSentenceCandidate(candidate: SentenceRewriteCandidate) {
    sentenceSuggestionReplayVersion.current += 1;
    setSentenceRewriteTarget(candidate.key);
    setSentenceSuggestionPreview({
      ...candidate.range,
      suggestionPreview: true,
      replayVersion: sentenceSuggestionReplayVersion.current,
    });

    requestAnimationFrame(() => {
      try {
        const domRange = ReactEditor.toDOMRange(editor, candidate.range);
        const element = domRange.commonAncestorContainer instanceof HTMLElement
          ? domRange.commonAncestorContainer
          : domRange.commonAncestorContainer.parentElement;
        element?.scrollIntoView({ behavior: "smooth", block: "center" });
      } catch {
        // Der Text kann zwischen Auswahl und Rendern bearbeitet worden sein.
      }
    });
  }

  function openSuggestionEditor(inconsistency: Inconsistency) {
    setSuggestionTarget(inconsistency);
    setSuggestionDraft(getDefaultSuggestion(inconsistency));
    setRewriteEntireSentence(false);
    setSentenceRewriteTarget("");
    setSentenceSuggestionPreview(null);
  }

  function handleSuggestChange(
    inconsistency: Inconsistency,
    requestedReplacement: string,
    rewriteSentence: boolean,
    selectedSentenceTarget: string
  ) {
    const replacement = requestedReplacement.trim();

    if (!replacement) {
      return;
    }

    const targetFacts = getSuggestionTargetFacts(inconsistency);
    const ranges = new Map<string, BaseRange>();
    const replacedValues = new Set<string>();

    for (const fact of targetFacts) {
      const paragraphIndex = getFactParagraphIndex(editor, fact);
      const pattern = getFactHighlightPattern(fact);
      if (paragraphIndex === null || !pattern) {
        continue;
      }

      replacedValues.add(String(fact.object ?? fact.value));

      for (const [node, path] of SlateNode.texts(editor)) {
        if (path[0] !== paragraphIndex || node.changeType) {
          continue;
        }

        for (const match of node.text.matchAll(pattern)) {
          if (match.index === undefined || match[0].length === 0) {
            continue;
          }

          const sentenceOffsets = rewriteSentence
            ? getSentenceOffsets(
                node.text,
                match.index,
                match.index + match[0].length
              )
            : null;
          const range = {
            anchor: {
              path,
              offset: sentenceOffsets?.start ?? match.index,
            },
            focus: {
              path,
              offset:
                sentenceOffsets?.end ?? match.index + match[0].length,
            },
          };
          const rangeKey = `${path.join(".")}:${range.anchor.offset}:${range.focus.offset}`;
          if (
            !rewriteSentence ||
            selectedSentenceTarget === "all" ||
            selectedSentenceTarget === rangeKey
          ) {
            ranges.set(rangeKey, range);
          }
        }
      }
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

    const changeId = `tracked-change-${nextTrackedChangeId.current++}`;

    Editor.withoutNormalizing(editor, () => {
      for (const range of occurrences) {
        const insertionPoint = Editor.pointRef(editor, range.focus, {
          affinity: "forward",
        });

        Transforms.setNodes<CustomText>(
          editor,
          { changeId, changeType: "deletion" },
          { at: range, match: Text.isText, split: true }
        );

        const point = insertionPoint.unref();
        if (point) {
          Transforms.insertNodes<CustomText>(
            editor,
            { text: replacement, changeId, changeType: "insertion" },
            { at: point }
          );
        }
      }
    });

    setTrackedChanges((changes) => [
      ...changes,
      {
        id: changeId,
        inconsistency,
        replacement,
        replacedValues: Array.from(replacedValues),
        occurrenceCount: occurrences.length,
        rewritesEntireSentence: rewriteSentence,
        paragraphIndices: Array.from(new Set(
          occurrences.map((range) => range.anchor.path[0])
        )),
      },
    ]);
    setSuggestionTarget(null);
    setSuggestionDraft("");
    setRewriteEntireSentence(false);
    setSentenceRewriteTarget("");
    setSentenceSuggestionPreview(null);
    setDocument([...editor.children]);
  }

  async function reevaluateParagraphs(paragraphIndices: number[]) {
    if (!analysis || paragraphIndices.length === 0) {
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

      setAnalysis(updatedAnalysis);
      setInconsistencies(updatedInconsistencies);
      setInconsistentPaths(
        getInconsistentPaths(editor, updatedInconsistencies)
      );
      setInconsistentRanges(
        getInconsistentTextRanges(editor, updatedInconsistencies)
      );
      setActiveInconsistencyId(null);
      setSelectedInconsistencyId(null);
      selectedInconsistencyIdRef.current = null;
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

  async function finishTrackedChange(
    change: TrackedChange,
    action: "accept" | "reject"
  ) {
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

        const shouldRemove =
          (action === "accept" && node.changeType === "deletion") ||
          (action === "reject" && node.changeType === "insertion");

        if (shouldRemove) {
          Transforms.removeNodes(editor, { at: path });
        } else {
          Transforms.unsetNodes(editor, ["changeId", "changeType"], { at: path });
        }
      }
    });

    setTrackedChanges((changes) => changes.filter(({ id }) => id !== change.id));
    setDocument([...editor.children]);

    if (action === "accept") {
      useExampleFactsRef.current = false;
      exampleDocumentTextRef.current = "";
      await reevaluateParagraphs(change.paragraphIndices);

    }
  }

  const activeInconsistencyImpact = activeInconsistencyId
    ? inconsistencies.find(
        (inconsistency) =>
          getStableInconsistencyId(inconsistency) === activeInconsistencyId
      )?.impact ?? null
    : null;

  return (
    <div className="content-container">
      <div className="editor-navigation-container">
        <EditorNavigation
        document={document}
        inconsistentPaths={inconsistentPaths}
        pageLineWidths={pageLineWidths}
        pageLineTops={pageLineTops}
        blockPageIndices={blockPageIndices}
        inconsistencyPageIndices={inconsistencyPageIndices}
        inconsistencyPositions={inconsistencyPositions}
        activeInconsistencyIndex={activeInconsistencyId
          ? inconsistencies.findIndex((item) => getStableInconsistencyId(item) === activeInconsistencyId)
          : null}
        hiddenInconsistencyIndices={new Set(
          inconsistencies.flatMap((item, index) =>
            hiddenInconsistencyIds.has(getStableInconsistencyId(item)) ? [index] : []
          )
        )}
        pageCount={pageCount}
        currentPage={currentPage}
        onNavigatePage={navigateToPage}
        onNavigateInconsistency={focusInconsistency}
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
              setInconsistentPaths(
                getInconsistentPaths(editor, inconsistencies)
              );
              setInconsistentRanges(
                getInconsistentTextRanges(editor, inconsistencies)
              );
            }}
        >
        <Toolbar
          onTextLoad={handleFileLoad}
          onHtmlLoad={handleHtmlLoad}
          onExampleLoad={handleExampleLoad}
          onAnalyze={handleAnalyze}
          analyzing={analyzing}
        />
        <div ref={editorScrollShellRef} className="editor-scroll-shell">
          <div ref={editorScrollRef} className="editor-scroll-container" onScroll={updatePagination}>
            <Editable
            className={`editor${activeInconsistencyId ? " editor--scope-active" : ""}`}
            placeholder="Text eingeben ..."
            renderElement={renderElement}
            renderLeaf={(props) => renderLeaf({
              ...props,
              activeInconsistencyId,
              activeInconsistencyImpact,
              jitterSuppressedIds,
              hiddenInconsistencyIds,
              onConflictHoverChange: handleInconsistencyHover,
            })}
            decorate={decorateInconsistencies}
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
                  className="fact-preview-connection"
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

            return previews.length > 0 ? (
              <div
                key={direction}
                className={`offscreen-fact-previews offscreen-fact-previews--${direction}`}
                aria-live="polite"
              >
                {previews.map((preview) => (
                  <div
                    key={preview.key}
                    className="offscreen-fact-preview"
                    data-fact-preview-key={preview.key}
                  >
                    {preview.before}<mark>{preview.fact}</mark>{preview.after}
                  </div>
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
                  onClick={() => focusInconsistency(marker.index)}
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
                  onClick={() => focusInconsistency(marker.index)}
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
          disabled={inconsistencies.length === 0}
        >
          {inconsistencies.length > 0 && inconsistencies.every((item) =>
            hiddenInconsistencyIds.has(getStableInconsistencyId(item))
          ) ? "Show All" : "Hide All"}
        </button>
      </div>
      {inconsistencies.length === 0 ? (
        <p className="conflict-list-empty">
          No Inconsistencies found.
        </p>
      ) : (
        inconsistencies.map((inconsistency, index) => {
          const inconsistencyId = getStableInconsistencyId(inconsistency);
          const isHidden = hiddenInconsistencyIds.has(inconsistencyId);
          const severity = inconsistency.severity ?? "medium";
          const category = INCONSISTENCY_CATEGORY_PRESENTATION[inconsistency.category];
          const factTheme = getFactThemePresentation(inconsistency.predicate);
          const presentationLabel = `${factTheme.label} · ${category.label}`;
          const sentenceCandidates = suggestionTarget === inconsistency
            ? getSentenceRewriteCandidates(inconsistency)
            : [];

          return (
            <div
              key={inconsistencyId}
              className={[
                "conflict-card",
                `conflict-card--${severity}`,
                selectedInconsistencyId === inconsistencyId
                  ? "conflict-card--selected"
                  : "",
                isHidden ? "conflict-card--hidden" : "",
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
              <div className="conflict-card-actions">
                <button
                  type="button"
                  className="suggest-change-button"
                  onClick={() => openSuggestionEditor(inconsistency)}
                  disabled={trackedChanges.some(
                    (change) => change.inconsistency === inconsistency
                  )}
                >
                  Suggest change
                </button>
                <button
                  type="button"
                  className="resolve-inconsistency-button"
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
                      rewriteEntireSentence,
                      sentenceRewriteTarget
                    );
                  }}
                >
                  <label htmlFor={`suggestion-${index}`}>
                    {rewriteEntireSentence
                      ? "Replacement sentence"
                      : "Replacement for the marked text"}
                  </label>
                  <textarea
                    id={`suggestion-${index}`}
                    value={suggestionDraft}
                    onChange={(event) => setSuggestionDraft(event.target.value)}
                    rows={2}
                    autoFocus
                  />
                  <label className="rewrite-sentence-option">
                    <input
                      type="checkbox"
                      checked={rewriteEntireSentence}
                      onChange={(event) => {
                        const checked = event.target.checked;
                        setRewriteEntireSentence(checked);
                        const firstCandidate = sentenceCandidates[0];
                        if (checked && firstCandidate) {
                          previewSentenceCandidate(firstCandidate);
                        } else {
                          setSentenceRewriteTarget("");
                          setSentenceSuggestionPreview(null);
                        }

                        if (
                          checked &&
                          suggestionDraft === getDefaultSuggestion(inconsistency)
                        ) {
                          setSuggestionDraft("");
                        } else if (!checked && !suggestionDraft.trim()) {
                          setSuggestionDraft(getDefaultSuggestion(inconsistency));
                        }
                      }}
                    />
                    Rewrite entire sentence
                  </label>
                  {rewriteEntireSentence && sentenceCandidates.length > 1 && (
                    <fieldset className="sentence-target-options">
                      <legend>Which sentence should be rewritten?</legend>
                      {sentenceCandidates.map((candidate) => (
                        <label key={candidate.key}>
                          <input
                            type="radio"
                            name={`sentence-target-${inconsistencyId}`}
                            value={candidate.key}
                            checked={sentenceRewriteTarget === candidate.key}
                            onChange={() => previewSentenceCandidate(candidate)}
                          />
                          <span>{candidate.text}</span>
                        </label>
                      ))}
                      <label>
                        <input
                          type="radio"
                          name={`sentence-target-${inconsistencyId}`}
                          value="all"
                          checked={sentenceRewriteTarget === "all"}
                          onChange={() => {
                            setSentenceRewriteTarget("all");
                            setSentenceSuggestionPreview(null);
                          }}
                        />
                        <span>Rewrite all matching sentences</span>
                      </label>
                    </fieldset>
                  )}
                  <div className="suggestion-editor-actions">
                    <button
                      type="submit"
                      disabled={
                        !suggestionDraft.trim() ||
                        (rewriteEntireSentence && !sentenceRewriteTarget)
                      }
                    >
                      Add suggestion
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSuggestionTarget(null);
                        setSuggestionDraft("");
                        setRewriteEntireSentence(false);
                        setSentenceRewriteTarget("");
                        setSentenceSuggestionPreview(null);
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>
          );
        })
      )}
      {trackedChanges.length > 0 && (
        <section className="tracked-changes-panel" aria-label="Tracked changes">
          <h3>Tracked Changes</h3>
          {trackedChanges.map((change) => (
            <div key={change.id} className="tracked-change-card">
              <p>
                {change.rewritesEntireSentence
                  ? `Rewrite sentence as “${change.replacement}”`
                  : `Replace ${change.replacedValues.join(", ")} with ${change.replacement}`}
                {change.occurrenceCount > 1
                  ? ` (${change.occurrenceCount} occurrences)`
                  : ""}
              </p>
              <div className="tracked-change-actions">
                <button type="button" onClick={() => finishTrackedChange(change, "accept")}>
                  Accept
                </button>
                <button type="button" onClick={() => finishTrackedChange(change, "reject")}>
                  Reject
                </button>
              </div>
            </div>
          ))}
        </section>
      )}
    </aside>
  </div>   
  );
}

function OffscreenMarker({
  direction,
  marker,
  onClick,
}: {
  direction: "above" | "below";
  marker: OffscreenInconsistency;
  onClick: () => void;
}) {
  const category = INCONSISTENCY_CATEGORY_PRESENTATION[marker.category];
  const factTheme = getFactThemePresentation(marker.predicate);
  const label = `${factTheme.label}: ${category.label}, ${direction === "above" ? "above" : "below"} the visible editor area`;

  return (
    <button
      type="button"
      className={`offscreen-inconsistency-marker offscreen-inconsistency-marker--${direction} offscreen-inconsistency-marker--${marker.severity}`}
      style={{
        left: `${marker.edgeOffset}px`,
        "--marker-opacity": marker.opacity,
      } as React.CSSProperties}
      onClick={onClick}
      aria-label={`${label}. Scroll to this inconsistency.`}
    >
      <span className="offscreen-inconsistency-marker-icon" aria-hidden="true">{factTheme.emoji}</span>
      <span className="offscreen-inconsistency-tooltip" aria-hidden="true">
        <strong>{factTheme.label}</strong>
        <span>{category.label}</span>
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
    analyzing
}:{
    onTextLoad: (text:string) => void;
    onHtmlLoad: (text:string) => void;
    onExampleLoad: () => void;
    onAnalyze: () => void;
    analyzing: boolean;
}) {
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
  const renderAsActiveSentence =
    belongsToActiveSentence && !belongsToActiveScope;
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
    children = <del className="tracked-deletion">{children}</del>;
  } else if (leaf.changeType === "insertion") {
    children = <ins className="tracked-insertion">{children}</ins>;
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
        leaf.replayVersion &&
        !belongsToActiveScope &&
        !isHidden &&
        !suppressJitter
          ? {
              animationName:
                leaf.replayVersion % 2 === 0
                  ? "inconsistency-jitter-replay-a"
                  : "inconsistency-jitter-replay-b",
              animationDelay: "0ms",
            }
          : undefined
      }
      {...attributes}
      data-suggestion-preview={leaf.suggestionPreview || undefined}
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
      className={
        leaf.suggestionPreview
          ? "sentence-suggestion-preview"
          : isHidden
          ? undefined
          : renderAsActiveSentence
          ? [
              "inconsistency-sentence",
              "inconsistency-sentence--active",
            ].join(" ")
          : leaf.inconsistencyRole === "conflict"
          ? [
              "inconsistent-text",
              `inconsistent-text--${
                leaf.inconsistencySeverity ?? "medium"
              }`,
              belongsToActiveScope ? "inconsistency-scope-active" : "",
              belongsToActiveScope
                ? `inconsistency-scope-active--${activeInconsistencyImpact}`
                : "",
              belongsToActiveScope ? "inconsistency-scope-active--conflict" : "",
              suppressJitter ? "inconsistent-text--no-jitter" : "",
            ].filter(Boolean).join(" ")
          : leaf.inconsistencyRole === "context"
            ? [
                "inconsistency-context",
                belongsToActiveScope
                  ? "inconsistency-context--active"
                  : "",
                belongsToActiveScope ? "inconsistency-scope-active" : "",
                belongsToActiveScope
                  ? `inconsistency-scope-active--${activeInconsistencyImpact}`
                  : "",
                belongsToActiveScope ? "inconsistency-scope-active--context" : "",
              ].filter(Boolean).join(" ")
            : leaf.inconsistencyRole === "sentence"
              ? [
                  "inconsistency-sentence",
                  belongsToActiveScope
                    ? "inconsistency-sentence--active"
                    : "",
                ].filter(Boolean).join(" ")
              : undefined
      }
      onMouseEnter={
        leaf.inconsistencyRole === "conflict" && !isHidden
          ? () => onConflictHoverChange(
              leaf.conflictInconsistencyIds?.[0] ?? null
            )
          : undefined
      }
      onMouseLeave={
        leaf.inconsistencyRole === "conflict" && !isHidden
          ? () => onConflictHoverChange(null)
          : undefined
      }
    >
      {children}
    </span>
  );
}
