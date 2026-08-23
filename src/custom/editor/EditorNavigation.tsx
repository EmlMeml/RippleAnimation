import { useMemo } from "react";
import { Node, type Descendant,Element as SlateElement } from "slate";
import type { InconsistencySeverity } from "../../ai/consistencyChecker";
import './../../assets/css/editorNav.css';

type NavigationSegment = {
  path: number[];
  characterCount: number;
  inconsistencySeverity?: InconsistencySeverity;
};

export type InconsistentPath = {
  path: number[];
  severity: InconsistencySeverity;
};

type EditorNavigationProps = {
  document: Descendant[];
  inconsistentPaths: InconsistentPath[];
  onNavigate: (path: number[]) => void;
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
  const inconsistentPathSeverities = new Map(
    inconsistentPaths.map(({ path, severity }) =>
      [path.join("."), severity]
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
      inconsistencySeverity: inconsistentPathSeverities.get(
        path.join(".")
      ),
    });
  });

  return items;
}
export default function EditorNavigation({
  document,
  inconsistentPaths,
  onNavigate,
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

          return (
            <button
              key={item.path.join("-")}
              type="button"
              className={[
                "editor-navigation-segment",
                item.inconsistencySeverity
                  ? `has-inconsistency has-inconsistency--${item.inconsistencySeverity}`
                  : "",
              ]
                .filter(Boolean)
                .join(" ")}
              style={{
                height: `${height}px`,
              }}
              onClick={() => onNavigate(item.path)}
            />
          );
        })}
      </div>
    </nav>
  );
}
