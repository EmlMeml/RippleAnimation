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
  inconsistencyRole: "conflict" | "context";
  inconsistencySeverity?: InconsistencySeverity;
  inconsistencyIds: string[];
  conflictInconsistencyIds: string[];
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
      inconsistencyRole?: "conflict" | "context";
      inconsistencySeverity?: InconsistencySeverity;
      inconsistencyIds?: string[];
      conflictInconsistencyIds?: string[];
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
  const [activeInconsistencyId, setActiveInconsistencyId] =
    useState<string | null>(null);
  const [selectedInconsistencyId, setSelectedInconsistencyId] =
    useState<string | null>(null);
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

  const [, setAnalysis] =
    useState<FactExtraction | null>(null);

  const [analyzing, setAnalyzing] = useState(false);

  const [, setAnalysisError] = useState("");

  const [document, setDocument] = useState<Descendant[]>(initialValue);

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

        segments.push({
          anchor: { path, offset: start },
          focus: { path, offset: end },
          inconsistent: true,
          inconsistencyRole: conflictRanges.length > 0 ? "conflict" : "context",
          inconsistencySeverity: severity,
          inconsistencyIds: Array.from(new Set(
            coveringRanges.flatMap((range) => range.inconsistencyIds)
          )),
          conflictInconsistencyIds: Array.from(new Set(
            conflictRanges.flatMap((range) => range.conflictInconsistencyIds)
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

  function focusInconsistency(index: number) {
    const inconsistencyId = `inconsistency-${index}`;

    if (selectedInconsistencyId === inconsistencyId) {
      setSelectedInconsistencyId(null);
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

    setActiveInconsistencyId(inconsistencyId ?? selectedInconsistencyId);
  }

  const updateOffscreenMarkers = useCallback(() => {
    const scrollContainer = editorScrollRef.current;

    if (!scrollContainer) {
      return;
    }

    const viewport = scrollContainer.getBoundingClientRect();
    const positions = inconsistencies.map((inconsistency, index) => {
      const id = `inconsistency-${index}`;
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
  }, [inconsistencies]);

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

    if (!scrollContainer || !activeInconsistencyId) {
      setOffscreenFactPreviews([]);
      return;
    }

    const viewport = scrollContainer.getBoundingClientRect();
    const contextElements = Array.from(
      scrollContainer.querySelectorAll<HTMLElement>("[data-inconsistency-ids]")
    ).filter((element) =>
      element.dataset.inconsistencyIds?.split(" ").includes(activeInconsistencyId) &&
      !element.dataset.conflictInconsistencyIds?.split(" ").includes(activeInconsistencyId)
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

function getInconsistentTextRanges(
  editor: Editor,
  inconsistencies: Inconsistency[]
): InconsistentTextRange[] {
  const ranges: InconsistentTextRange[] = [];

  for (const [index, inconsistency] of inconsistencies.entries()) {
    const inconsistencyId = `inconsistency-${index}`;
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

          const existingRange = ranges.find((range) =>
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
     
      const result = useExampleFactsRef.current
        ? EXAMPLE_FACTS
        : await extractFacts(text,context);

      setAnalysis(result);

      const foundInconsistencies =
        checkConsistency(result);

      setInconsistencies(foundInconsistencies);

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

  const activeInconsistencyIndex = activeInconsistencyId
    ? Number(activeInconsistencyId.replace("inconsistency-", ""))
    : -1;
  const activeInconsistencyImpact =
    inconsistencies[activeInconsistencyIndex]?.impact ?? null;

  return (
    <div className="content-container">
      <div className="editor-navigation-container">
        <EditorNavigation
        document={document}
        inconsistentPaths={inconsistentPaths}
        onNavigate={(path) => {
          try {
            const point = Editor.start(editor, path);

            Transforms.select(editor, {
              anchor: point,
              focus: point,
            });

            ReactEditor.focus(editor);

            const element = ReactEditor.toDOMNode(
              editor,
              Editor.node(editor, path)[0]
            );

            element.scrollIntoView({
              behavior: "smooth",
              block: "center",
            });
          } catch (error) {
            console.error(
              "Navigation zum Absatz fehlgeschlagen:",
              error
            );
          }
        }}
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
          <div ref={editorScrollRef} className="editor-scroll-container" style={{minHeight:"200px"}}>
            <Editable
            className={`editor${activeInconsistencyId ? " editor--scope-active" : ""}`}
            placeholder="Text eingeben ..."
            renderElement={renderElement}
            renderLeaf={(props) => renderLeaf({
              ...props,
              activeInconsistencyId,
              activeInconsistencyImpact,
              jitterSuppressedIds,
              onConflictHoverChange: handleInconsistencyHover,
            })}
            decorate={decorateInconsistencies}
            spellCheck
            />
          </div>
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
        
      </Slate>
    </div>
    <aside className="conflict-list" aria-label="Found inconsistencies">
      <h2>Inconsistencies</h2>
      {inconsistencies.length === 0 ? (
        <p className="conflict-list-empty">
          No Inconsistencies found.
        </p>
      ) : (
        inconsistencies.map((inconsistency, index) => {
          const severity = inconsistency.severity ?? "medium";
          const category = INCONSISTENCY_CATEGORY_PRESENTATION[inconsistency.category];
          const factTheme = getFactThemePresentation(inconsistency.predicate);
          const presentationLabel = `${factTheme.label} · ${category.label}`;

          return (
            <button
              key={index}
              type="button"
              className={[
                "conflict-card",
                `conflict-card--${severity}`,
                selectedInconsistencyId === `inconsistency-${index}`
                  ? "conflict-card--selected"
                  : "",
              ].filter(Boolean).join(" ")}
              onClick={() => focusInconsistency(index)}
              aria-pressed={selectedInconsistencyId === `inconsistency-${index}`}
              onMouseEnter={() => handleInconsistencyHover(`inconsistency-${index}`)}
              onMouseLeave={() => handleInconsistencyHover(null)}
            >
              <span
                className="conflict-card-category-emoji"
                role="img"
                aria-label={presentationLabel}
                title={presentationLabel}
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
          );
        })
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
        opacity: marker.opacity,
      }}
      onClick={onClick}
      aria-label={`${label}. Scroll to this inconsistency.`}
      title={label}
    >
      <span aria-hidden="true">{factTheme.emoji}</span>
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
      style={{color:'#252b45'}}
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
  onConflictHoverChange,
}: any) {
  const belongsToActiveScope =
    activeInconsistencyId !== null &&
    leaf.inconsistencyIds?.includes(activeInconsistencyId);
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

  return (
    <span
      style={
        leaf.inconsistencyRole === "conflict" &&
        leaf.replayVersion &&
        !belongsToActiveScope &&
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
      data-inconsistency-ids={
        leaf.inconsistencyRole
          ? leaf.inconsistencyIds?.join(" ")
          : undefined
      }
      data-conflict-inconsistency-ids={
        leaf.inconsistencyRole === "conflict"
          ? leaf.conflictInconsistencyIds?.join(" ")
          : undefined
      }
      className={
        leaf.inconsistencyRole === "conflict"
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
            : undefined
      }
      onMouseEnter={
        leaf.inconsistencyRole === "conflict"
          ? () => onConflictHoverChange(leaf.inconsistencyIds?.[0] ?? null)
          : undefined
      }
      onMouseLeave={
        leaf.inconsistencyRole === "conflict"
          ? () => onConflictHoverChange(null)
          : undefined
      }
    >
      {children}
    </span>
  );
}
