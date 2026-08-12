import React, { useMemo, useState } from "react";
import {
  createEditor,
  type Descendant,
  Editor,
  Element as SlateElement,
  Transforms,
} from "slate";
import {
  Slate,
  Editable,
  withReact,
  useSlate,
} from "slate-react";
import { withHistory } from "slate-history";
import FileUploader from "./FileUploader";
import './../../assets/css/editor.css';

type CustomText = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
};

type ParagraphElement = {
  type: "paragraph";
  children: CustomText[];
};

type HeadingElement = {
  type: "heading-one";
  children: CustomText[];
};

type LinkElement = {
  type: "link";
  url: string;
  children: CustomText[];
};

type MarkFormat = Exclude<keyof CustomText, "text">;

type CustomElement =
  | ParagraphElement
  | HeadingElement
  | LinkElement;

declare module "slate" {
  interface CustomTypes {
    TextEditor: Editor;
    Element: CustomElement;
    Text: CustomText;
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

export default function RichTextEditor() {
  const editor = useMemo(
    () => withHistory(withReact(createEditor())),
    []
  );

  const [,setValue] = useState<Descendant[]>(initialValue);

  function deserialize(
    node: Node,
    marks: Partial<CustomText> = {}
    ): Descendant[] {
    if (node.nodeType === Node.TEXT_NODE) {
        return [
        {
            text: node.textContent ?? "",
            ...marks,
        },
        ];
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
        return [];
    }

    const element = node as HTMLElement;

    let currentMarks = { ...marks };

    if (element.tagName === "STRONG" || element.tagName === "B") {
        currentMarks.bold = true;
    }

    if (element.tagName === "EM" || element.tagName === "I") {
        currentMarks.italic = true;
    }

    if (element.tagName === "U") {
        currentMarks.underline = true;
    }
    
    const children = Array.from(element.childNodes)
    .flatMap((child) =>
      deserialize(child, currentMarks)
    );

    const textChildren: CustomText[] = children.filter(
    (child): child is CustomText =>
      "text" in child
    );

    switch (element.tagName) {
        case "H1":
        return [
            {
            type: "heading-one",
            children:
                textChildren.length > 0
                ? textChildren
                : [{ text: "" }],
            },
        ];

        case "P":
        return [
            {
            type: "paragraph",
            children:
                textChildren.length > 0
                ? textChildren
                : [{ text: "" }],
            },
        ];

        default:
        return children;
    }
}

  function htmlToSlate(html: string): Descendant[] {
    const parser = new DOMParser();
    const document = parser.parseFromString(html, "text/html");

    return Array.from(document.body.childNodes)
        .map((node) => deserialize(node))
        .flat();
    }

   function handleHtmlLoad(html: string) {
    const nodes = htmlToSlate(html);

    if (nodes.length === 0) {
        nodes.push({
        type: "paragraph",
        children: [{ text: "" }],
        });
    }

    editor.children = nodes;

    editor.selection = {
        anchor: {
        path: [0, 0],
        offset: 0,
        },
        focus: {
        path: [0, 0],
        offset: 0,
        },
    };

    editor.onChange();

    setValue(nodes);
    }

  function handleFileLoad(text: string) {
  const paragraphs: ParagraphElement[] = text
    .split(/\r?\n/)
    .map((line) => ({
      type: "paragraph",
      children: [{ text: line }],
    }));

  editor.children = paragraphs;

  editor.selection = {
    anchor: {
      path: [0, 0],
      offset: 0,
    },
    focus: {
      path: [0, 0],
      offset: 0,
    },
  };

  editor.onChange();

  setValue(paragraphs);
}

  return (
    <div className="editor-container">
        
        <Slate
            editor={editor}
            initialValue={initialValue}
            onChange={(newValue) => {
                setValue(newValue);
                }  
            }
        >
        <Toolbar  onTextLoad={handleFileLoad} onHtmlLoad={handleHtmlLoad}/>
        <div className="editor-scroll-container">
            <Editable
            className="editor"
            placeholder="Text eingeben ..."
            renderElement={renderElement}
            renderLeaf={renderLeaf}
            spellCheck
            />  
        </div>
        
      </Slate>
    </div>
  );
}

/* -----------------------------
   Toolbar
----------------------------- */

function Toolbar({
    onTextLoad,
    onHtmlLoad
}:{
    onTextLoad: (text:string) => void;
    onHtmlLoad: (text:string) => void;
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
          rel="noreferrer"
        >
          {children}
        </a>
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
    <span {...attributes}>
      {children}
    </span>
  );
}