/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Columns2, Columns3, TableOfContents } from "lucide-react";
// types
import type { CommandProps } from "@/types";
// local imports
import type { TSlashCommandAdditionalOption } from "./slash-commands/root";

const insertColumns = (count: number) => (props: CommandProps) => {
  const { editor, range } = props;
  editor.chain().focus().deleteRange(range).insertColumns(count).run();
};

/**
 * Slash commands for blocks that exist only in the document (page) editor's schema.
 */
export const documentEditorSlashCommandOptions = (): TSlashCommandAdditionalOption[] => [
  {
    commandKey: "columns-2",
    key: "columns-2",
    title: "2 columns",
    description: "Place blocks side by side.",
    searchTerms: ["columns", "layout", "side by side", "split", "two"],
    icon: <Columns2 className="size-3.5" />,
    command: insertColumns(2),
    section: "general",
    pushAfter: "callout",
  },
  {
    commandKey: "columns-3",
    key: "columns-3",
    title: "3 columns",
    description: "Place blocks in three columns.",
    searchTerms: ["columns", "layout", "side by side", "split", "three"],
    icon: <Columns3 className="size-3.5" />,
    command: insertColumns(3),
    section: "general",
    pushAfter: "columns-2",
  },
  {
    commandKey: "table-of-contents",
    key: "table-of-contents",
    title: "Table of contents",
    description: "List this page's headings.",
    searchTerms: ["toc", "contents", "outline", "headings", "index"],
    icon: <TableOfContents className="size-3.5" />,
    command: ({ editor, range }: CommandProps) =>
      editor.chain().focus().deleteRange(range).insertTableOfContents().run(),
    section: "general",
    pushAfter: "columns-3",
  },
];
