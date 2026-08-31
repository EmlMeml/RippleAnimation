import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Node, type Descendant } from "slate";
import type { InconsistencySeverity } from "../../ai/consistencyChecker";
import './../../assets/css/editorNav.css';

export type InconsistentPath = {
  path: number[];
  severity: InconsistencySeverity;
  inconsistencies: Array<{ index: number; severity: InconsistencySeverity; predicate: string }>;
};

export type NavigationTextHighlight = {
  key: string;
  sourceElementIndex: number;
  sourceType: "mark" | "change";
  index: number;
  page: number;
  x: number;
  y: number;
  width: number;
  severity: InconsistencySeverity;
  predicate: string;
  success: boolean;
};

type Props = {
  document: Descendant[];
  inconsistentPaths: InconsistentPath[];
  pageLineWidths: number[][];
  pageLineTops: number[][];
  pageLineLefts: number[][];
  blockPageIndices: number[];
  inconsistencyPageIndices: number[];
  textHighlights: NavigationTextHighlight[];
  activeInconsistencyIndex: number | null;
  successfulInconsistencyIndex: number | null;
  hiddenInconsistencyIndices: ReadonlySet<number>;
  pageCount: number;
  currentPage: number;
  onNavigatePage: (page: number) => void;
  onNavigateTextHighlight: (highlight: NavigationTextHighlight) => void;
  onHoverTextHighlight: (highlight: NavigationTextHighlight | null) => void;
};

function buildPages(document: Descendant[], paths: InconsistentPath[], pageCount: number, measuredLines: number[][], blockPageIndices: number[], inconsistencyPageIndices: number[]) {
  const texts = document.map((node) => Node.string(node).trim());
  const total = Math.max(1, texts.reduce((sum, text) => sum + text.length + 1, 0));
  const perPage = Math.max(1, Math.ceil(total / pageCount));
  const pages = Array.from({ length: pageCount }, () => ({
    lineWidths: [] as number[],
    inconsistencies: [] as InconsistentPath["inconsistencies"],
  }));
  let offset = 0;

  texts.forEach((text) => {
    const words = text.split(/\s+/).filter(Boolean);
    let length = 0;
    words.forEach((word, wordIndex) => {
      const nextLength = length + word.length + (length ? 1 : 0);
      if (nextLength > 58) {
        const page = Math.min(pageCount - 1, Math.floor((offset + wordIndex * 6) / perPage));
        pages[page].lineWidths.push(Math.min(100, Math.max(24, length / 58 * 100)));
        length = word.length;
      } else length = nextLength;
    });
    if (length) {
      const page = Math.min(pageCount - 1, Math.floor(offset / perPage));
      pages[page].lineWidths.push(Math.min(100, Math.max(24, length / 58 * 100)));
    }
    offset += text.length + 1;
  });
  const uniqueInconsistencies = new Map<number, { detail: InconsistentPath["inconsistencies"][number]; fallbackPage: number }>();
  paths.forEach(({ path, inconsistencies }) => {
    inconsistencies.forEach((detail) => {
      if (!uniqueInconsistencies.has(detail.index)) {
        uniqueInconsistencies.set(detail.index, {
          detail,
          fallbackPage: blockPageIndices[path[0]] ?? 0,
        });
      }
    });
  });
  uniqueInconsistencies.forEach(({ detail, fallbackPage }) => {
    const page = Math.min(pageCount - 1, Math.max(0, inconsistencyPageIndices[detail.index] ?? fallbackPage));
    pages[page].inconsistencies.push(detail);
  });
  measuredLines.forEach((lines, page) => {
    if (pages[page] && lines.length > 0) pages[page].lineWidths = lines;
  });
  return pages;
}

function formatPredicate(predicate: string): string {
  if (predicate.startsWith("character:")) {
    const category = predicate.slice("character:".length).replaceAll("_", " ");
    return `Character · ${category.charAt(0).toUpperCase()}${category.slice(1)}`;
  }
  if (predicate === "age" || ["younger_than", "older_than"].includes(predicate)) return "Age";
  if (["born_in", "lives_in", "located_in"].includes(predicate)) return "Location";
  if (predicate === "occupation") return "Occupation";
  if (predicate === "works_at") return "Work";
  if (["parent_of", "child_of", "sibling_of"].includes(predicate)) return "Family";
  if (predicate === "married_to") return "Partnership";
  if (predicate === "friend_of") return "Friendship";
  if (["owns", "has"].includes(predicate)) return "Possession";
  if (predicate === "gender") return "Identity";
  if (predicate === "participates_in") return "Event";
  return "General fact";
}

function formatSeverity(severity: InconsistencySeverity): string {
  return ({ low: "Low", medium: "Medium", high: "High", critical: "Critical" } as const)[severity];
}

function getPredicateIcon(predicate: string): string {
  if (predicate.startsWith("character:")) {
    const categoryIcons: Record<string, string> = {
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
    return categoryIcons[predicate.slice("character:".length)] ?? "🧠";
  }
  if (["born_in", "lives_in", "located_in"].includes(predicate)) return "📍";
  if (["age", "younger_than", "older_than"].includes(predicate)) return "🎂";
  if (["works_at", "occupation"].includes(predicate)) return "💼";
  if (["parent_of", "child_of", "sibling_of"].includes(predicate)) return "👪";
  if (predicate === "married_to") return "💍";
  if (predicate === "friend_of") return "🤝";
  if (["owns", "has"].includes(predicate)) return "📦";
  return "⚠️";
}

export default function EditorNavigation({ document, inconsistentPaths, pageLineWidths, pageLineTops, pageLineLefts, blockPageIndices, inconsistencyPageIndices, textHighlights, activeInconsistencyIndex, successfulInconsistencyIndex, hiddenInconsistencyIndices, pageCount, currentPage, onNavigatePage, onNavigateTextHighlight, onHoverTextHighlight }: Props) {
  const [hoveredMarker, setHoveredMarker] = useState<{
    inconsistency: InconsistentPath["inconsistencies"][number];
    highlightKey: string;
    left: number;
    top: number;
  } | null>(null);
  const pages = useMemo(
    () => buildPages(document, inconsistentPaths, pageCount, pageLineWidths, blockPageIndices, inconsistencyPageIndices),
    [document, inconsistentPaths, pageCount, pageLineWidths, blockPageIndices, inconsistencyPageIndices],
  );
  return (
    <>
      <nav className="editor-navigation" aria-label="Seitenübersicht">
      <div className="editor-navigation-header">Pages</div>
      <div className="editor-navigation-items">
        {pages.map((page, index) => (
          <div className="editor-page-preview-wrapper" key={index}>
            <button type="button" className={`editor-page-preview${currentPage === index ? " is-active" : ""}`}
              onClick={() => onNavigatePage(index)} aria-label={`Zu Seite ${index + 1} von ${pageCount}`}
              aria-current={currentPage === index ? "page" : undefined}>
              <span className="editor-page-preview-lines" aria-hidden="true">
                {page.lineWidths.slice(0, 28).map((width, line) => <span key={line} style={{
                  left: `${pageLineLefts[index]?.[line] ?? 0}%`,
                  top: `${pageLineTops[index]?.[line] ?? 0}%`,
                  width: `${width}%`,
                }} />)}
              </span>
              <span className="editor-page-preview-number">{index + 1}</span>
            </button>
            {textHighlights.filter((highlight) => highlight.page === index).map((highlight) => {
              const isHidden = hiddenInconsistencyIndices.has(highlight.index);
              return (
                <span className="editor-page-conflict-position" key={highlight.key}
                  style={{
                    left: `calc(16px + (100% - 32px) * ${highlight.x / 100})`,
                    top: `calc(20px + (100% - 50px) * ${highlight.y / 100})`,
                    width: `max(8px, calc((100% - 32px) * ${highlight.width / 100}))`,
                  }}>
                  <button type="button" className={`editor-page-conflict-line editor-page-conflict-line--${highlight.severity}${activeInconsistencyIndex === highlight.index ? " is-active" : ""}${activeInconsistencyIndex === highlight.index && hoveredMarker !== null && hoveredMarker.inconsistency.index !== highlight.index ? " is-hover-suppressed" : ""}${hoveredMarker?.inconsistency.index === highlight.index ? " is-related-hover" : ""}${highlight.success || successfulInconsistencyIndex === highlight.index ? " is-success" : ""}${isHidden ? " is-hidden" : ""}`}
                    onClick={() => onNavigateTextHighlight(highlight)}
                    onMouseEnter={(event) => {
                      const rect = event.currentTarget.getBoundingClientRect();
                      setHoveredMarker({ inconsistency: { index: highlight.index, severity: highlight.severity, predicate: highlight.predicate }, highlightKey: highlight.key, left: rect.right + 10, top: rect.top + rect.height / 2 });
                      onHoverTextHighlight(highlight);
                    }}
                    onMouseLeave={() => { setHoveredMarker(null); onHoverTextHighlight(null); }}
                    onFocus={(event) => {
                      const rect = event.currentTarget.getBoundingClientRect();
                      setHoveredMarker({ inconsistency: { index: highlight.index, severity: highlight.severity, predicate: highlight.predicate }, highlightKey: highlight.key, left: rect.right + 10, top: rect.top + rect.height / 2 });
                      onHoverTextHighlight(highlight);
                    }}
                    onBlur={() => { setHoveredMarker(null); onHoverTextHighlight(null); }}
                    aria-label={`${formatPredicate(highlight.predicate)}, Schweregrad ${highlight.severity}${isHidden ? ", im Editor ausgeblendet" : ""}`}>
                    <span className="visually-hidden">{getPredicateIcon(highlight.predicate)}</span>
                  </button>
                </span>
              );
            })}
          </div>
        ))}
      </div>
      </nav>
      {hoveredMarker && createPortal(
        <span
          className={`editor-page-conflict-tooltip editor-page-conflict-tooltip--portal editor-page-conflict-tooltip--${hoveredMarker.inconsistency.severity}`}
          style={{ left: hoveredMarker.left, top: hoveredMarker.top }}
          role="tooltip"
        >
          <strong className="editor-page-conflict-tooltip-title">
            <span className="editor-page-conflict-tooltip-dot" aria-hidden="true" />
            {formatPredicate(hoveredMarker.inconsistency.predicate)}
          </strong>
          <span className="editor-page-conflict-tooltip-meta">
            {hiddenInconsistencyIndices.has(hoveredMarker.inconsistency.index) ? "Hidden · " : ""}
            {formatSeverity(hoveredMarker.inconsistency.severity)}
          </span>
        </span>,
        window.document.body,
      )}
    </>
  );
}
