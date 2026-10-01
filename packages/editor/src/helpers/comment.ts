/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { Editor } from "@tiptap/core";
// types
import type { IEditorPropsExtended } from "@/types";

/**
 * Finds the range of the quoted text, preferring its original position, so a thread can still be anchored
 * after collaborators edited the page while the comment was being written.
 */
export const findQuoteRange = (
  editor: Editor,
  original: { from: number; to: number },
  quote: string
): { from: number; to: number } | null => {
  const { doc } = editor.state;
  const docSize = doc.content.size;
  if (original.to <= docSize && doc.textBetween(original.from, original.to, " ") === quote) return original;

  let found: { from: number; to: number } | null = null;
  doc.descendants((node, pos) => {
    if (found) return false;
    if (!node.isTextblock) return true;
    const index = node.textContent.indexOf(quote);
    if (index === -1) return false;
    // map the text offset to a document position by walking the block's inline content
    let offset = 0;
    node.forEach((child, childOffset) => {
      if (found) return;
      const length = child.isText ? (child.text?.length ?? 0) : 0;
      if (child.isText && index >= offset && index < offset + length) {
        const from = pos + 1 + childOffset + (index - offset);
        const range = { from, to: from + quote.length };
        if (doc.textBetween(range.from, range.to, " ") === quote) found = range;
      }
      offset += length;
    });
    return false;
  });
  return found;
};

export const createCommentFromSelection = (
  editor: Editor,
  onCreateComment: NonNullable<IEditorPropsExtended["onCreateComment"]>
) => {
  const { from, to, empty } = editor.state.selection;
  if (empty) return;
  const quote = editor.state.doc.textBetween(from, to, " ");
  if (!quote.trim()) return;
  onCreateComment({
    quote,
    applyAnchor: (anchorId) => {
      if (editor.isDestroyed) return false;
      const range = findQuoteRange(editor, { from, to }, quote);
      if (!range) return false;
      return editor.chain().setCommentMark(range, anchorId).run();
    },
  });
};
