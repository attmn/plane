/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { HocuspocusProvider } from "@hocuspocus/provider";
import type { AnyExtension } from "@tiptap/core";
import { SlashCommands } from "@/extensions";
// local imports
import { ColumnExtension, ColumnListExtension } from "./columns";
import { documentEditorSlashCommandOptions } from "./document-slash-command-options";
import { TableOfContentsExtension } from "./table-of-contents";
// types
import type { IEditorProps, TExtensions, TUserDetails } from "@/types";

export type TDocumentEditorAdditionalExtensionsProps = Pick<
  IEditorProps,
  "disabledExtensions" | "flaggedExtensions" | "fileHandler" | "extendedEditorProps"
> & {
  isEditable: boolean;
  provider?: HocuspocusProvider;
  userDetails: TUserDetails;
};

export type TDocumentEditorAdditionalExtensionsRegistry = {
  isEnabled: (disabledExtensions: TExtensions[], flaggedExtensions: TExtensions[]) => boolean;
  getExtension: (props: TDocumentEditorAdditionalExtensionsProps) => AnyExtension;
};

const extensionRegistry: TDocumentEditorAdditionalExtensionsRegistry[] = [
  {
    isEnabled: (disabledExtensions) => !disabledExtensions.includes("slash-commands"),
    getExtension: ({ disabledExtensions, flaggedExtensions, extendedEditorProps }) =>
      SlashCommands({
        disabledExtensions,
        flaggedExtensions,
        additionalOptions: [
          ...documentEditorSlashCommandOptions(),
          ...(extendedEditorProps.slashCommandAdditionalOptions ?? []),
        ],
      }),
  },
  // layout blocks that only the document (page) editor's schema has
  { isEnabled: () => true, getExtension: () => ColumnListExtension },
  { isEnabled: () => true, getExtension: () => ColumnExtension },
  { isEnabled: () => true, getExtension: () => TableOfContentsExtension },
];

export function DocumentEditorAdditionalExtensions(props: TDocumentEditorAdditionalExtensionsProps) {
  const { disabledExtensions, flaggedExtensions } = props;

  const documentExtensions = extensionRegistry
    .filter((config) => config.isEnabled(disabledExtensions, flaggedExtensions))
    .map((config) => config.getExtension(props));

  return documentExtensions;
}
