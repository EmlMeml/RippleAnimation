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

type Props = {
  document: Descendant[];
  inconsistentPaths: InconsistentPath[];
  pageLineWidths: number[][];
  pageLineTops: number[][];
  blockPageIndices: number[];
  inconsistencyPageIndices: number[];
  inconsistencyPositions: Array<{ page: number; x: number; y: number }>;
  activeInconsistencyIndex: number | null;
  hiddenInconsistencyIndices: ReadonlySet<number>;
  pageCount: number;
  currentPage: number;
  onNavigatePage: (page: number) => void;
  onNavigateInconsistency: (index: number) => void;
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
  if (["born_in", "lives_in", "located_in"].includes(predicate)) return "📍";
  if (["age", "younger_than", "older_than"].includes(predicate)) return "🎂";
  if (["works_at", "occupation"].includes(predicate)) return "💼";
  if (["parent_of", "child_of", "sibling_of"].includes(predicate)) return "👪";
  if (predicate === "married_to") return "💍";
  if (predicate === "friend_of") return "🤝";
  if (["owns", "has"].includes(predicate)) return "📦";
  return "⚠️";
}

export default function EditorNavigation({ document, inconsistentPaths, pageLineWidths, pageLineTops, blockPageIndices, inconsistencyPageIndices, inconsistencyPositions, activeInconsistencyIndex, hiddenInconsistencyIndices, pageCount, currentPage, onNavigatePage, onNavigateInconsistency }: Props) {
  const [hoveredMarker, setHoveredMarker] = useState<{
    inconsistency: InconsistentPath["inconsistencies"][number];
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
                {page.lineWidths.slice(0, 28).map((width, line) => <span key={line} style={{ width: `${width}%` }} />)}
              </span>
              <span className="editor-page-preview-number">{index + 1}</span>
            </button>
            {page.inconsistencies.map((inconsistency) => {
              const isHidden = hiddenInconsistencyIndices.has(inconsistency.index);
              const position = inconsistencyPositions[inconsistency.index];
              const lineTops = pageLineTops[index] ?? [];
              const nearestLine = lineTops.reduce(
                (nearest, top, lineIndex) =>
                  Math.abs(top - (position?.y ?? 8)) < Math.abs((lineTops[nearest] ?? 0) - (position?.y ?? 8))
                    ? lineIndex
                    : nearest,
                0,
              );
              const lineWidth = page.lineWidths[nearestLine] ?? 45;
              return (
                <span className="editor-page-conflict-position" key={inconsistency.index}
                  style={{ left: "8px", top: `${10 + nearestLine * 3}px`, width: `calc((100% - 16px) * ${lineWidth / 100})` }}>
                  <button type="button" className={`editor-page-conflict-line editor-page-conflict-line--${inconsistency.severity}${activeInconsistencyIndex === inconsistency.index ? " is-active" : ""}${isHidden ? " is-hidden" : ""}`}
                    onClick={() => onNavigateInconsistency(inconsistency.index)}
                    onMouseEnter={(event) => {
                      const rect = event.currentTarget.getBoundingClientRect();
                      setHoveredMarker({ inconsistency, left: rect.right + 10, top: rect.top + rect.height / 2 });
                    }}
                    onMouseLeave={() => setHoveredMarker(null)}
                    onFocus={(event) => {
                      const rect = event.currentTarget.getBoundingClientRect();
                      setHoveredMarker({ inconsistency, left: rect.right + 10, top: rect.top + rect.height / 2 });
                    }}
                    onBlur={() => setHoveredMarker(null)}
                    aria-label={`${formatPredicate(inconsistency.predicate)}, Schweregrad ${inconsistency.severity}${isHidden ? ", im Editor ausgeblendet" : ""}`}>
                    <span className="visually-hidden">{getPredicateIcon(inconsistency.predicate)}</span>
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
