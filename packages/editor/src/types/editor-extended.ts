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

export type IEditorPropsExtended = {
  slashCommandAdditionalOptions?: TSlashCommandAdditionalOption[];
  onTurnBlockIntoPage?: (payload: TTurnBlockIntoPagePayload) => Promise<TTurnBlockIntoPageResult | undefined>;
};

export type ICollaborativeDocumentEditorPropsExtended = unknown;

export type TExtendedEditorCommands = never;

export type TExtendedCommandExtraProps = unknown;

export type TExtendedEditorRefApi = unknown;
