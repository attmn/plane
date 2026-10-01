/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TSlashCommandAdditionalOption } from "@/extensions/slash-commands/root";

export type IEditorExtensionOptions = unknown;

export type TTurnBlockIntoPagePayload = {
  title: string;
  descriptionHTML: string;
};

export type TTurnBlockIntoPageResult = {
  href: string;
  title: string;
};

export type TCreateCommentPayload = {
  // the selected text the comment is about
  quote: string;
  // anchors the saved thread to the selection; false when that text has since changed
  applyAnchor: (anchorId: string) => boolean;
};

export type IEditorPropsExtended = {
  onCreateComment?: (payload: TCreateCommentPayload) => void;
  slashCommandAdditionalOptions?: TSlashCommandAdditionalOption[];
  onTurnBlockIntoPage?: (payload: TTurnBlockIntoPagePayload) => Promise<TTurnBlockIntoPageResult | undefined>;
};

export type ICollaborativeDocumentEditorPropsExtended = unknown;

export type TExtendedEditorCommands = never;

export type TExtendedCommandExtraProps = unknown;

export type TExtendedEditorRefApi = unknown;
