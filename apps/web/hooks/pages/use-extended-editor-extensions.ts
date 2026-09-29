/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo } from "react";
import type { IEditorPropsExtended } from "@plane/editor";
import type { TSearchEntityRequestPayload, TSearchResponse } from "@plane/types";
import type { TPageInstance } from "@/store/pages/base-page";
import type { EPageStoreType } from "@/hooks/store";

export type TExtendedEditorExtensionsHookParams = {
  workspaceSlug: string;
  page: TPageInstance;
  storeType: EPageStoreType;
  fetchEntity: (payload: TSearchEntityRequestPayload) => Promise<TSearchResponse>;
  getRedirectionLink: (pageId?: string) => string;
  extensionHandlers?: Map<string, unknown>;
  projectId?: string;
  slashCommandAdditionalOptions?: IEditorPropsExtended["slashCommandAdditionalOptions"];
};

export type TExtendedEditorExtensionsConfig = IEditorPropsExtended;

export const useExtendedEditorProps = (params: TExtendedEditorExtensionsHookParams): TExtendedEditorExtensionsConfig =>
  useMemo(
    () => ({ slashCommandAdditionalOptions: params.slashCommandAdditionalOptions }),
    [params.slashCommandAdditionalOptions]
  );
