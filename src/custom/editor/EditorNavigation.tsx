import { useMemo } from "react";
import { Node, type Descendant,Element as SlateElement } from "slate";
import type { InconsistencySeverity } from "../../ai/consistencyChecker";
import './../../assets/css/editorNav.css';

type NavigationSegment = {
  path: number[];
  characterCount: number;
  inconsistencySeverity?: InconsistencySeverity;
  inconsistencies: InconsistentPath["inconsistencies"];
};

export type InconsistentPath = {
  path: number[];
  severity: InconsistencySeverity;
  inconsistencies: Array<{
    index: number;
    severity: InconsistencySeverity;
    predicate: string;
  }>;
};

type EditorNavigationProps = {
  document: Descendant[];
  inconsistentPaths: InconsistentPath[];
  onNavigate: (path: number[]) => void;
  onNavigateInconsistency: (index: number) => void;
};

const MIN_HEIGHT = 24;
const MAX_HEIGHT = 240;
const HEIGHT_PER_CHARACTER = 0.36;

function getSegmentHeight(characterCount: number): number {
  return Math.min(
    MAX_HEIGHT,
    Math.max(
      MIN_HEIGHT,
      characterCount * HEIGHT_PER_CHARACTER
    )
  );
}

function getNodeText(node: Descendant): string {
  return Node.string(node).replace(/\s+/g, " ").trim();
}

function createNavigationSegments(
  document: Descendant[],
  inconsistentPaths: InconsistentPath[]
): NavigationSegment[] {
  const inconsistentPathDetails = new Map(
    inconsistentPaths.map((details) =>
      [details.path.join("."), details]
    )
  );

  const items: NavigationSegment[] = [];

  document.forEach((node, index) => {
    if (!SlateElement.isElement(node)) {
      return;
    }

    if (
      node.type !== "paragraph" &&
      node.type !== "heading-one"
    ) {
      return;
    }

    const text = getNodeText(node);
    const path = [index];

    items.push({
      path,
      characterCount: text.length,
      inconsistencySeverity: inconsistentPathDetails.get(path.join("."))?.severity,
      inconsistencies: inconsistentPathDetails.get(path.join("."))?.inconsistencies ?? [],
    });
  });

  return items;
}
export default function EditorNavigation({
  document,
  inconsistentPaths,
  onNavigate,
  onNavigateInconsistency,
}: EditorNavigationProps) {
  const items = useMemo(
    () =>
      createNavigationSegments(
        document,
        inconsistentPaths
      ),
    [document, inconsistentPaths]
  );

  return (
    <nav
      className="editor-navigation"
      aria-label="Dokumentübersicht"
    >
      <div className="editor-navigation-header">
      Document Overview
      </div>
      <div className="editor-navigation-items">
        {items.map((item) => {
          const height = getSegmentHeight(
            item.characterCount
          );

          const visibleInconsistencies = item.inconsistencies.slice(0, 2);
          const hiddenCount = Math.max(0, item.inconsistencies.length - 2);
          const tooltip = item.inconsistencies.length > 0
            ? [
                `${item.inconsistencies.length} inconsistenc${item.inconsistencies.length === 1 ? "y" : "ies"}`,
                ...item.inconsistencies.map(
                  ({ predicate, severity }) => `${getPredicateTheme(predicate)} · ${severity}`
                ),
              ].join("\n")
            : undefined;

          return (
            <div
              key={item.path.join("-")}
              className="editor-navigation-segment-wrapper"
              style={{
                height: `${height}px`,
              }}
              title={tooltip}
            >
              <button
                type="button"
                className={[
                  "editor-navigation-segment",
                  item.inconsistencySeverity
                    ? `has-inconsistency has-inconsistency--${item.inconsistencySeverity}`
                    : "",
                ].filter(Boolean).join(" ")}
                onClick={() => onNavigate(item.path)}
                aria-label={tooltip ?? "Navigate to paragraph"}
              />
              {item.inconsistencies.length > 0 && (
                <span className="editor-navigation-conflicts">
                  {visibleInconsistencies.map((inconsistency) => (
                    <button
                      key={inconsistency.index}
                      type="button"
                      className={`editor-navigation-conflict-dot editor-navigation-conflict-dot--${inconsistency.severity}`}
                      onClick={() => onNavigateInconsistency(inconsistency.index)}
                      aria-label={`${getPredicateTheme(inconsistency.predicate)}, ${inconsistency.severity} inconsistency`}
                      title={`${getPredicateTheme(inconsistency.predicate)} · ${inconsistency.severity}`}
                    />
                  ))}
                  {hiddenCount > 0 && (
                    <button
                      type="button"
                      className="editor-navigation-conflict-more"
                      onClick={() => onNavigateInconsistency(item.inconsistencies[2].index)}
                      aria-label={`${hiddenCount} more inconsistencies`}
                    >
                      +{hiddenCount}
                    </button>
                  )}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </nav>
  );
}

function getPredicateTheme(predicate: string): string {
  if (["born_in", "lives_in", "located_in"].includes(predicate)) return "📍 Location";
  if (["age", "younger_than", "older_than"].includes(predicate)) return "🎂 Age";
  if (["works_at", "occupation"].includes(predicate)) return "💼 Work";
  if (["parent_of", "child_of", "sibling_of"].includes(predicate)) return "👪 Family";
  if (predicate === "married_to") return "💍 Partnership";
  if (predicate === "friend_of") return "🤝 Friendship";
  if (["owns", "has"].includes(predicate)) return "📦 Possession";
  if (predicate === "gender") return "👤 Identity";
  if (predicate === "participates_in") return "🎭 Event";
  return "⚠️ General fact";
}
