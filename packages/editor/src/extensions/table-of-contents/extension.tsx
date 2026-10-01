/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { ReactNodeViewRenderer } from "@tiptap/react";
// local imports
import { TableOfContentsBlock } from "./block";
import { TableOfContentsExtensionConfig } from "./extension-config";

export const TableOfContentsExtension = TableOfContentsExtensionConfig.extend({
  selectable: true,
  draggable: true,

  addCommands() {
    return {
      insertTableOfContents:
        () =>
        ({ commands }) =>
          commands.insertContent({ type: this.name }),
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(TableOfContentsBlock);
  },
});
