/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { Editor } from "@tiptap/core";
import { Fragment } from "@tiptap/pm/model";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";
// constants
import { CORE_EXTENSIONS } from "@/constants/extension";
// local imports
import { ColumnExtensionConfig, ColumnListExtensionConfig, MAX_COLUMNS, MIN_COLUMNS } from "./extension-config";

const isEmptyColumn = (column: ProseMirrorNode) =>
  column.childCount === 1 && !!column.firstChild?.isTextblock && column.firstChild.content.size === 0;

/**
 * Backspace at the start of an empty column removes that column. When one column would be left, the
 * column list unwraps into its remaining content; when every column is empty, it becomes a paragraph.
 */
const handleBackspaceInColumn = (editor: Editor): boolean => {
  const { state } = editor;
  const { $from, empty } = state.selection;
  if (!empty || $from.parentOffset !== 0) return false;

  let columnDepth = -1;
  for (let depth = $from.depth; depth > 0; depth--) {
    if ($from.node(depth).type.name === CORE_EXTENSIONS.COLUMN) {
      columnDepth = depth;
      break;
    }
  }
  if (columnDepth < 1) return false;

  const column = $from.node(columnDepth);
  const columnList = $from.node(columnDepth - 1);
  if (columnList.type.name !== CORE_EXTENSIONS.COLUMN_LIST || !isEmptyColumn(column)) return false;

  const listPos = $from.before(columnDepth - 1);
  const listEnd = listPos + columnList.nodeSize;
  const columnIndex = $from.index(columnDepth - 1);
  const remaining: ProseMirrorNode[] = [];
  columnList.forEach((child, _offset, index) => {
    if (index !== columnIndex) remaining.push(child);
  });

  const { tr, schema } = state;
  if (remaining.every(isEmptyColumn)) {
    tr.replaceWith(listPos, listEnd, schema.nodes[CORE_EXTENSIONS.PARAGRAPH].create());
    tr.setSelection(TextSelection.create(tr.doc, listPos + 1));
  } else if (remaining.length < MIN_COLUMNS) {
    let content = Fragment.empty;
    remaining.forEach((child) => (content = content.append(child.content)));
    tr.replaceWith(listPos, listEnd, content);
    tr.setSelection(TextSelection.near(tr.doc.resolve(listPos + 1)));
  } else {
    const columnPos = $from.before(columnDepth);
    tr.delete(columnPos, columnPos + column.nodeSize);
    const previousColumnEnd = Math.max(listPos + 1, columnPos - 1);
    tr.setSelection(TextSelection.near(tr.doc.resolve(previousColumnEnd), -1));
  }
  editor.view.dispatch(tr.scrollIntoView());
  return true;
};

export const ColumnListExtension = ColumnListExtensionConfig.extend({
  addCommands() {
    return {
      insertColumns:
        (count) =>
        ({ editor, state, dispatch, tr }) => {
          const columnCount = Math.min(MAX_COLUMNS, Math.max(MIN_COLUMNS, count));
          // columns don't nest
          if (editor.isActive(CORE_EXTENSIONS.COLUMN)) return false;
          const { schema } = state;
          const columns = Array.from({ length: columnCount }, () =>
            schema.nodes[CORE_EXTENSIONS.COLUMN].create(null, schema.nodes[CORE_EXTENSIONS.PARAGRAPH].create())
          );
          const columnList = schema.nodes[CORE_EXTENSIONS.COLUMN_LIST].create(null, columns);
          if (!dispatch) return true;

          const { $from } = tr.selection;
          const parent = $from.parent;
          const container = $from.node($from.depth - 1);
          const index = $from.index($from.depth - 1);
          // an empty paragraph is replaced in place; otherwise the columns go after the top-level block
          const canReplaceParent =
            parent.isTextblock &&
            parent.content.size === 0 &&
            container.canReplaceWith(index, index + 1, columnList.type);
          const insertPos = canReplaceParent ? $from.before() : $from.after(1);
          if (canReplaceParent) tr.replaceWith(insertPos, insertPos + parent.nodeSize, columnList);
          else tr.insert(insertPos, columnList);
          // cursor in the first column's paragraph: list open + column open + paragraph open
          tr.setSelection(TextSelection.create(tr.doc, insertPos + 3));
          dispatch(tr.scrollIntoView());
          return true;
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      Backspace: ({ editor }) => {
        try {
          return handleBackspaceInColumn(editor as Editor);
        } catch (error) {
          console.error("Error in performing backspace action on columns", error);
          return false;
        }
      },
    };
  },
});

export const ColumnExtension = ColumnExtensionConfig;
