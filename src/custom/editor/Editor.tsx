import React, { useCallback, useMemo, useRef, useState } from "react";
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
import type { FactExtraction } from "./../../types/facts";
import { getEditorText } from "./getEditorText";
import {
  checkConsistency,
  type Inconsistency,
  type InconsistencySeverity,
} from './../../ai/consistencyChecker';
import EditorNavigation from "./EditorNavigation";

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
  replayVersion?: number;
};

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
  const [inconsistentPaths, setInconsistentPaths] = useState<number[][]>([]);
  const [inconsistentRanges, setInconsistentRanges] = useState<InconsistentTextRange[]>([]);
  const [activeInconsistencyId, setActiveInconsistencyId] =
    useState<string | null>(null);
  const animationReplayVersion = useRef(0);

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

      return inconsistentRanges.filter((range) =>
        Path.equals(range.anchor.path, path)
      );
    },
    [inconsistentRanges]
  );

  function focusInconsistency(index: number) {
    const inconsistencyId = `inconsistency-${index}`;
    const range = inconsistentRanges.find(
      (candidate) =>
        candidate.inconsistencyRole === "conflict" &&
        candidate.inconsistencyIds.includes(inconsistencyId)
    );

    if (!range) {
      return;
    }

    setActiveInconsistencyId(inconsistencyId);
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

function getInconsistentPaths(
  editor: Editor,
  inconsistencies: Inconsistency[]
): number[][] {
  const paths: number[][] = [];

  for (const inconsistency of inconsistencies) {
    const conflictingFact =
      inconsistency.facts
        .filter(
          (fact) =>
          normalizeSearchText(fact.subject) ===
            normalizeSearchText(
              inconsistency.subject
            ) &&
          normalizeSearchText(fact.predicate) ===
            normalizeSearchText(
              inconsistency.predicate
          )
        )
        .sort(
          (first, second) =>
            (first.source?.paragraphIndex ?? first.source?.start ?? -1) -
            (second.source?.paragraphIndex ?? second.source?.start ?? -1)
        )
        .at(-1);

    if (!conflictingFact) {
      continue;
    }

    const paragraphIndex =
      conflictingFact.source?.paragraphIndex;

    if (
      paragraphIndex !== undefined &&
      editor.children[paragraphIndex] !== undefined
    ) {
      paths.push([paragraphIndex]);
      continue;
    }

    const subject = normalizeSearchText(
      conflictingFact.subject
    );

    const object =
      conflictingFact.object !== undefined
        ? normalizeSearchText(
            conflictingFact.object
          )
        : "";

    /*
     * Suche den Absatz, in dem die inkonsistente
     * Aussage tatsächlich vorkommt.
     */
    for (
      let index = 0;
      index < editor.children.length;
      index++
    ) {
      const node = editor.children[index];

      if (!SlateElement.isElement(node)) {
        continue;
      }

      if (
        node.type !== "paragraph" &&
        node.type !== "heading-one"
      ) {
        continue;
      }

      const text = normalizeSearchText(
        getNodeText(node)
      );

      const hasSubject =
        subject !== "" &&
        text.includes(subject);

      const hasObject =
        object !== "" &&
        text.includes(object);

      /*
       * Bei einer Relation müssen beide
       * Entitäten im selben Absatz vorkommen.
       */
      if (
        hasSubject &&
        hasObject
      ) {
        const path = [index];

        if (
          !paths.some(
            (existingPath) =>
              existingPath.join(".") ===
              path.join(".")
          )
        ) {
          paths.push(path);
        }

        break;
      }
    }
  }

  return Array.from(
    new Map(paths.map((path) => [path.join("."), path])).values()
  );
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
    const conflictFact = [...inconsistency.facts].sort(
      (first, second) =>
        (first.source?.paragraphIndex ?? first.source?.start ?? 0) -
        (second.source?.paragraphIndex ?? second.source?.start ?? 0)
    ).at(-1);

    for (const fact of inconsistency.facts) {
      const pattern = getFactHighlightPattern(fact);
      if (!pattern) {
        continue;
      }

      for (const [node, path] of SlateNode.texts(editor)) {
        if (
          fact.source?.paragraphIndex !== undefined &&
          path[0] !== fact.source.paragraphIndex
        ) {
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

  async function handleAnalyze() {
    setAnalyzing(true);
    setAnalysisError("");

    try {
      const text = getEditorText(editor.children);
      console.log('editor-text: ',text);
      if (!text.trim()) {
        setAnalysisError("Der Editor ist leer.");
        return;
      }
     
      const result = await extractFacts(text,context);

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
          paths: getInconsistentPaths(editor, [inconsistency]),
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
          : "Unbekannter Fehler"
      );
    } finally {
      setAnalyzing(false);
    }
  }

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
      />
        
    </div>
    <div className="editor-container">
        <Slate
            editor={editor}
            initialValue={initialValue}
            onValueChange={(value) => {
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
        <Toolbar  onTextLoad={handleFileLoad} onHtmlLoad={handleHtmlLoad} onAnalyze={handleAnalyze} analyzing={analyzing} />
        <div className="editor-scroll-container" style={{minHeight:"200px"}}>
            <Editable
            className="editor"
            placeholder="Text eingeben ..."
            renderElement={renderElement}
            renderLeaf={(props) => renderLeaf({
              ...props,
              activeInconsistencyId,
              onConflictHoverChange: setActiveInconsistencyId,
            })}
            decorate={decorateInconsistencies}
            spellCheck
            />  
        </div>
        
      </Slate>
    </div>
    <aside className="conflict-list" aria-label="Gefundene Inkonsistenzen">
      <h2>Inconsistencies</h2>
      {inconsistencies.length === 0 ? (
        <p className="conflict-list-empty">
          No Inconsistencies found.
        </p>
      ) : (
        inconsistencies.map((inconsistency, index) => {
          const severity = inconsistency.severity ?? "medium";

          return (
            <button
              key={index}
              type="button"
              className={`conflict-card conflict-card--${severity}`}
              onClick={() => focusInconsistency(index)}
            >
              <span className="conflict-card-severity">{severity}</span>
              <span className="conflict-card-message">
                {inconsistency.message}
              </span>
            </button>
          );
        })
      )}
    </aside>
  </div>   
  );
}

/* -----------------------------
   Toolbar
----------------------------- */

function Toolbar({
    onTextLoad,
    onHtmlLoad,
    onAnalyze,
    analyzing
}:{
    onTextLoad: (text:string) => void;
    onHtmlLoad: (text:string) => void;
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
      style={{color:'#2b311c'}}
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
  onConflictHoverChange,
}: any) {
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
        leaf.inconsistencyRole === "conflict" && leaf.replayVersion
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
      className={
        leaf.inconsistencyRole === "conflict"
          ? [
              "inconsistent-text",
              `inconsistent-text--${
                leaf.inconsistencySeverity ?? "medium"
              }`,
            ].join(" ")
          : leaf.inconsistencyRole === "context"
            ? [
                "inconsistency-context",
                leaf.inconsistencyIds?.includes(activeInconsistencyId)
                  ? "inconsistency-context--active"
                  : "",
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
