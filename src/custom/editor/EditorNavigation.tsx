import { useMemo } from "react";
import { Node, type Descendant,Element as SlateElement } from "slate";
import './../../assets/css/editorNav.css';

type NavigationSegment = {
  path: number[];
  characterCount: number;
  hasInconsistency: boolean;
};

type EditorNavigationProps = {
  document: Descendant[];
  inconsistentPaths: number[][];
  onNavigate: (path: number[]) => void;
};

const MIN_HEIGHT = 12;
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
  inconsistentPaths: number[][]
): NavigationSegment[] {
  const inconsistentPathSet = new Set(
    inconsistentPaths.map((path) =>
      path.join(".")
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
      hasInconsistency: inconsistentPathSet.has(
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
                item.hasInconsistency
                  ? "has-inconsistency"
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