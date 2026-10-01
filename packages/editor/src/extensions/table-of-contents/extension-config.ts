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

export const TABLE_OF_CONTENTS_BLOCK_TYPE = "table-of-contents";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    [CORE_EXTENSIONS.TABLE_OF_CONTENTS]: {
      insertTableOfContents: () => ReturnType;
    };
  }
}

/**
 * A live list of the page's headings. It stores nothing: the headings are read from the document when rendered,
 * so exports leave it out.
 */
export const TableOfContentsExtensionConfig = Node.create({
  name: CORE_EXTENSIONS.TABLE_OF_CONTENTS,
  group: "block",
  atom: true,

  addStorage() {
    return {
      markdown: {
        serialize(state: MarkdownSerializerState, node: ProseMirrorNode) {
          state.closeBlock(node);
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: `div[data-block-type="${TABLE_OF_CONTENTS_BLOCK_TYPE}"]` }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-block-type": TABLE_OF_CONTENTS_BLOCK_TYPE })];
  },
});
