/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { NodeViewProps } from "@tiptap/react";
import { NodeViewWrapper } from "@tiptap/react";
import { useEffect, useState } from "react";
import { cn } from "@plane/utils";
// constants
import { CORE_EXTENSIONS } from "@/constants/extension";
// helpers
import { scrollSummary } from "@/helpers/scroll-to-node";
// types
import type { IMarking } from "@/types";

const getHeadings = (editor: NodeViewProps["editor"]): IMarking[] =>
  ((editor.storage[CORE_EXTENSIONS.HEADINGS_LIST]?.headings ?? []) as IMarking[]).filter(
    (heading) => heading.level <= 3
  );

const LEVEL_CLASSNAME: Record<number, string> = {
  1: "pl-0 text-14",
  2: "pl-4 text-14",
  3: "pl-8 text-13",
};

/**
 * Renders the page's headings as links, kept in sync with the headings list extension (the same source as the
 * page outline pane).
 */
export function TableOfContentsBlock(props: NodeViewProps) {
  const { editor, selected } = props;
  const [headings, setHeadings] = useState<IMarking[]>(() => getHeadings(editor));

  useEffect(() => {
    const handleUpdate = () => {
      const next = getHeadings(editor);
      setHeadings((current) => (JSON.stringify(current) === JSON.stringify(next) ? current : next));
    };
    handleUpdate();
    editor.on("update", handleUpdate);
    return () => {
      editor.off("update", handleUpdate);
    };
  }, [editor]);

  return (
    <NodeViewWrapper
      className={cn("editor-table-of-contents-component my-2 rounded-lg border border-subtle px-3 py-2", {
        "ring-1 ring-accent-strong": selected,
      })}
      contentEditable={false}
    >
      {headings.length === 0 ? (
        <p className="text-13 text-placeholder">Add headings to build the table of contents.</p>
      ) : (
        <nav aria-label="Table of contents" className="flex flex-col">
          {headings.map((heading) => (
            <button
              key={`${heading.level}-${heading.sequence}`}
              type="button"
              className={cn(
                "w-full truncate py-0.5 text-left text-secondary underline-offset-2 transition-colors hover:text-accent-primary hover:underline",
                LEVEL_CLASSNAME[heading.level]
              )}
              onClick={() => scrollSummary(editor, heading)}
            >
              {heading.text || "Untitled heading"}
            </button>
          ))}
        </nav>
      )}
    </NodeViewWrapper>
  );
}
