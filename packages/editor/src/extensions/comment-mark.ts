/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Mark, mergeAttributes } from "@tiptap/core";
// constants
import { CORE_EXTENSIONS } from "@/constants/extension";

export const COMMENT_MARK_ID_ATTRIBUTE = "data-comment-id";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    [CORE_EXTENSIONS.COMMENT]: {
      /**
       * Anchor a comment thread to the given range
       * @param range the text the thread is about
       * @param commentId the thread's anchor id
       */
      setCommentMark: (range: { from: number; to: number }, commentId: string) => ReturnType;
    };
  }
}

/**
 * Marks the text an inline page comment thread is anchored to. The mark only carries the anchor id;
 * the app decides how open and resolved threads look and what a click does.
 */
export const CommentMarkExtension = Mark.create({
  name: CORE_EXTENSIONS.COMMENT,

  // parse before TextStyle, whose rule takes every <span>
  priority: 1000,

  // typing at either edge of the commented text does not extend the comment
  inclusive: false,
  // a range can hold several threads
  excludes: "",

  addAttributes() {
    return {
      commentId: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute(COMMENT_MARK_ID_ATTRIBUTE),
        renderHTML: (attributes: { commentId?: string | null }) =>
          attributes.commentId ? { [COMMENT_MARK_ID_ATTRIBUTE]: attributes.commentId } : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: `span[${COMMENT_MARK_ID_ATTRIBUTE}]` }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes({ class: "editor-comment-mark" }, HTMLAttributes), 0];
  },

  addCommands() {
    return {
      setCommentMark:
        (range, commentId) =>
        ({ tr, dispatch }) => {
          if (range.from >= range.to) return false;
          if (dispatch) tr.addMark(range.from, range.to, this.type.create({ commentId }));
          return true;
        },
    };
  },
});
