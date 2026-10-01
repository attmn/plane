/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { DOMSerializer } from "@tiptap/pm/model";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { Editor } from "@tiptap/react";
// constants
import { CORE_EXTENSIONS } from "@/constants/extension";
// types
import type { IEditorPropsExtended } from "@/types";

const MAX_PAGE_TITLE_LENGTH = 255;

// Uploaded files belong to the page they were uploaded to, so they can't be moved into another page.
const NON_MOVABLE_NODE_TYPES = new Set<string>([CORE_EXTENSIONS.IMAGE, CORE_EXTENSIONS.CUSTOM_IMAGE]);

const getSelectedBlock = (editor: Editor): { node: ProseMirrorNode; pos: number } | null => {
  const { selection } = editor.state;
  const node = selection.content().content.firstChild;
  if (!node || !node.isBlock) return null;
  return { node, pos: selection.from };
};

export const canTurnBlockIntoPage = (editor: Editor): boolean => {
  const block = getSelectedBlock(editor);
  if (!block) return false;
  let hasNonMovableNode = NON_MOVABLE_NODE_TYPES.has(block.node.type.name);
  block.node.descendants((child) => {
    if (NON_MOVABLE_NODE_TYPES.has(child.type.name)) hasNonMovableNode = true;
    return !hasNonMovableNode;
  });
  return !hasNonMovableNode;
};

const getTitleText = (node: ProseMirrorNode): string => {
  if (node.isTextblock) return node.textContent.trim();
  let text = "";
  node.descendants((child) => {
    if (text) return false;
    if (child.isTextblock) {
      text = child.textContent.trim();
      return false;
    }
    return true;
  });
  return text;
};

const serializeBlock = (editor: Editor, node: ProseMirrorNode): string => {
  const container = document.createElement("div");
  container.appendChild(DOMSerializer.fromSchema(editor.schema).serializeNode(node));
  return container.innerHTML;
};

// Finds the block again after the page was created, since collaborators may have edited the doc meanwhile.
const findBlockPosition = (editor: Editor, node: ProseMirrorNode, originalPos: number): number | null => {
  const { doc } = editor.state;
  if (doc.nodeAt(originalPos)?.eq(node)) return originalPos;
  let foundPos: number | null = null;
  doc.descendants((child, pos) => {
    if (foundPos !== null) return false;
    if (child.eq(node)) {
      foundPos = pos;
      return false;
    }
    return true;
  });
  return foundPos;
};

/**
 * Moves the selected block into a new subpage and replaces it with a link to that page.
 * A short text block becomes the page title, like Notion; any other block becomes the page body.
 */
export const turnBlockIntoPage = async (
  editor: Editor,
  onTurnBlockIntoPage: NonNullable<IEditorPropsExtended["onTurnBlockIntoPage"]>
): Promise<void> => {
  const block = getSelectedBlock(editor);
  if (!block) return;
  const { node, pos } = block;

  const titleText = getTitleText(node);
  const title = titleText.slice(0, MAX_PAGE_TITLE_LENGTH) || "Untitled";
  const isTitleOnly = node.isTextblock && titleText.length <= MAX_PAGE_TITLE_LENGTH;
  const descriptionHTML = isTitleOnly ? "<p></p>" : serializeBlock(editor, node);

  const page = await onTurnBlockIntoPage({ title, descriptionHTML });
  if (!page || editor.isDestroyed) return;

  const linkParagraph = {
    type: CORE_EXTENSIONS.PARAGRAPH,
    content: [
      {
        type: "text",
        text: page.title || title,
        marks: [{ type: CORE_EXTENSIONS.CUSTOM_LINK, attrs: { href: page.href, target: "_self" } }],
      },
    ],
  };

  const currentPos = findBlockPosition(editor, node, pos);
  if (currentPos === null) {
    // The block was edited or removed meanwhile: keep whatever is there and add the link at its old position.
    editor.chain().insertContentAt(Math.min(pos, editor.state.doc.content.size), linkParagraph).run();
    return;
  }
  editor
    .chain()
    .insertContentAt({ from: currentPos, to: currentPos + node.nodeSize }, linkParagraph)
    .run();
};
