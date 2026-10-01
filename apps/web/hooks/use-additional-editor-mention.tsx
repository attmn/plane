/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useMemo } from "react";
import { useParams } from "next/navigation";
import { PagesOutline } from "@makeplane/propel/icons";
// plane editor
import type { TMentionSection, TMentionSuggestion } from "@plane/editor";
// plane imports
import { Logo } from "@plane/blocks/emoji-icon-picker";
// plane types
import type { TPageSearchResponse, TSearchEntities, TSearchResponse } from "@plane/types";
import { getPageName } from "@plane/utils";
// hooks
import { EPageStoreType, usePageStore } from "@/hooks/store";

export type TUseAdditionalEditorMentionArgs = {
  enableAdvancedMentions: boolean;
};

export type TAdditionalEditorMentionHandlerArgs = {
  response: TSearchResponse;
};

export type TAdditionalEditorMentionHandlerReturnType = {
  sections: TMentionSection[];
};

export type TAdditionalParseEditorContentArgs = {
  id: string;
  entityType: TSearchEntities;
};

export type TAdditionalParseEditorContentReturnType =
  | {
      redirectionPath: string;
      textContent: string;
    }
  | undefined;

export const useAdditionalEditorMention = (args: TUseAdditionalEditorMentionArgs) => {
  const { enableAdvancedMentions } = args;
  const { workspaceSlug, projectId } = useParams();
  const { getPageById } = usePageStore(EPageStoreType.PROJECT);

  // pages are offered in the mention list of page editors, which turn on advanced mentions
  const updateAdditionalSections = useCallback(
    ({ response }: TAdditionalEditorMentionHandlerArgs): TAdditionalEditorMentionHandlerReturnType => {
      const pages = (response.page ?? []) as TPageSearchResponse[];
      if (!enableAdvancedMentions || pages.length === 0) return { sections: [] };
      const seenPageIds = new Set<string>();
      const items: TMentionSuggestion[] = [];
      for (const page of pages) {
        if (!page.id || seenPageIds.has(page.id)) continue;
        seenPageIds.add(page.id);
        items.push({
          icon: page.logo_props?.in_use ? (
            <Logo logo={page.logo_props} size={16} type="lucide" />
          ) : (
            <PagesOutline className="size-4 text-tertiary" />
          ),
          id: page.id,
          entity_identifier: page.id,
          entity_name: "page_mention",
          title: getPageName(page.name ?? ""),
        });
      }
      return { sections: [{ key: "pages", title: "Pages", items }] };
    },
    [enableAdvancedMentions]
  );

  const parseAdditionalEditorContent = useCallback(
    ({ id, entityType }: TAdditionalParseEditorContentArgs): TAdditionalParseEditorContentReturnType => {
      if (entityType !== "page_mention") return undefined;
      const page = getPageById(id);
      const pageProjectId = page?.project_ids?.[0] ?? projectId?.toString();
      return {
        redirectionPath: `${workspaceSlug}/projects/${pageProjectId}/pages/${id}`,
        textContent: page ? getPageName(page.name) : "page",
      };
    },
    [getPageById, projectId, workspaceSlug]
  );

  const editorMentionTypes: TSearchEntities[] = useMemo(
    () => (enableAdvancedMentions ? ["user_mention", "page"] : ["user_mention"]),
    [enableAdvancedMentions]
  );

  return {
    updateAdditionalSections,
    parseAdditionalEditorContent,
    editorMentionTypes,
  };
};
