/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback } from "react";
// plane editor
import { Avatar } from "@makeplane/propel/components/avatar";
import type { TMentionSection, TMentionSuggestion } from "@plane/editor";
// plane types
import type { TSearchEntityRequestPayload, TSearchResponse, TUserSearchResponse } from "@plane/types";
// helpers
import { getFileURL, getPageName } from "@plane/utils";
// hooks
import { EPageStoreType, usePageStore } from "@/hooks/store";
import { useMember } from "@/hooks/store/use-member";
// plane web hooks
import { useAdditionalEditorMention } from "@/hooks/use-additional-editor-mention";

type TArgs = {
  enableAdvancedMentions?: boolean;
  searchEntity: (payload: TSearchEntityRequestPayload) => Promise<TSearchResponse>;
};

export const useEditorMention = (args: TArgs) => {
  const { enableAdvancedMentions = false, searchEntity } = args;
  // additional mentions
  const { editorMentionTypes, updateAdditionalSections } = useAdditionalEditorMention({
    enableAdvancedMentions,
  });
  // store hooks
  const { getUserDetails } = useMember();
  const { getPageById } = usePageStore(EPageStoreType.PROJECT);
  // display text of a mention (copied text, markdown), for a user or a page
  const getMentionedEntityDetails = useCallback(
    (id: string) => {
      const userName = getUserDetails(id)?.display_name;
      if (userName) return { display_name: userName };
      const page = enableAdvancedMentions ? getPageById(id) : undefined;
      return { display_name: page ? getPageName(page.name) : "" };
    },
    [enableAdvancedMentions, getPageById, getUserDetails]
  );
  // fetch mentions handler
  const fetchMentions = useCallback(
    async (query: string): Promise<TMentionSection[]> => {
      try {
        const res = await searchEntity({
          count: 5,
          query_type: editorMentionTypes,
          query,
        });
        const suggestionSections: TMentionSection[] = [];
        if (!res) {
          throw new Error("No response found");
        }
        Object.keys(res).map((key) => {
          const responseKey = key as keyof TSearchResponse;
          const response = res[responseKey];
          if (responseKey === "user_mention" && response && response.length > 0) {
            const items: TMentionSuggestion[] = (response as TUserSearchResponse[]).map((user) => ({
              icon: (
                <Avatar
                  alt={user.member__display_name}
                  fallback={user.member__display_name?.[0]?.toUpperCase()}
                  src={getFileURL(user.member__avatar_url)}
                  size="xs"
                />
              ),
              id: user.member__id,
              entity_identifier: user.member__id,
              entity_name: "user_mention",
              title: user.member__display_name,
            }));
            suggestionSections.push({
              key: "users",
              title: "Users",
              items,
            });
          }
        });
        const { sections } = updateAdditionalSections({
          response: res,
        });
        return [...suggestionSections, ...sections];
      } catch (error) {
        console.error("Error in fetching mentions:", error);
        throw error;
      }
    },
    [editorMentionTypes, searchEntity, updateAdditionalSections]
  );

  return {
    fetchMentions,
    getMentionedEntityDetails,
  };
};
