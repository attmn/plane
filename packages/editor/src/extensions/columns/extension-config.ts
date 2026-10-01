/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Node, mergeAttributes } from "@tiptap/core";
import type { MarkdownSerializerState } from "@tiptap/pm/markdown";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
// constants
import { CORE_EXTENSIONS } from "@/constants/extension";

export const MIN_COLUMNS = 2;
export const MAX_COLUMNS = 3;

export const COLUMN_LIST_BLOCK_TYPE = "column-list";
export const COLUMN_BLOCK_TYPE = "column";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    [CORE_EXTENSIONS.COLUMN_LIST]: {
      insertColumns: (count: number) => ReturnType;
    };
  }
}

// Markdown and plain exports read columns as sequential content.
const serializeAsSequentialContent = {
  markdown: {
    serialize(state: MarkdownSerializerState, node: ProseMirrorNode) {
      state.renderContent(node);
    },
  },
};

export const ColumnListExtensionConfig = Node.create({
  name: CORE_EXTENSIONS.COLUMN_LIST,
  group: "block",
  content: `${CORE_EXTENSIONS.COLUMN}{${MIN_COLUMNS},${MAX_COLUMNS}}`,
  isolating: true,
  defining: true,

  addStorage() {
    return serializeAsSequentialContent;
  },

  parseHTML() {
    return [{ tag: `div[data-block-type="${COLUMN_LIST_BLOCK_TYPE}"]` }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-block-type": COLUMN_LIST_BLOCK_TYPE,
        "data-columns": String(node.childCount),
        class: "editor-column-list",
      }),
      0,
    ];
  },
});

export const ColumnExtensionConfig = Node.create({
  name: CORE_EXTENSIONS.COLUMN,
  content: "block+",
  isolating: true,
  defining: true,

  addStorage() {
    return serializeAsSequentialContent;
  },

  parseHTML() {
    return [{ tag: `div[data-block-type="${COLUMN_BLOCK_TYPE}"]` }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-block-type": COLUMN_BLOCK_TYPE, class: "editor-column" }),
      0,
    ];
  },
});
