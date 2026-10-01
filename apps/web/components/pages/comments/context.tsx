/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
// plane imports
import type { TCreateCommentPayload } from "@plane/editor";
// components
import { PAGE_NAVIGATION_PANE_TABS_QUERY_PARAM } from "@/components/pages/navigation-pane";
// hooks
import { useQueryParams } from "@/hooks/use-query-params";
// local imports
import { usePageComments } from "./use-page-comments";

type TPageCommentsContext = ReturnType<typeof usePageComments> & {
  workspaceSlug: string;
  projectId: string | undefined;
  pageId: string;
  canComment: boolean;
  // an inline comment being written for the text selected in the page
  pendingInlineComment: TCreateCommentPayload | null;
  startInlineComment: (payload: TCreateCommentPayload) => void;
  cancelInlineComment: () => void;
  activeThreadId: string | null;
  setActiveThreadId: (threadId: string | null) => void;
  openCommentsPane: () => void;
};

const PageCommentsContext = createContext<TPageCommentsContext | null>(null);

type Props = {
  workspaceSlug: string;
  projectId: string | undefined;
  pageId: string;
  canComment: boolean;
  children: ReactNode;
};

export function PageCommentsProvider(props: Props) {
  const { workspaceSlug, projectId, pageId, canComment, children } = props;
  const router = useRouter();
  const { updateQueryParams } = useQueryParams();
  const comments = usePageComments({ workspaceSlug, projectId, pageId });
  const [pendingInlineComment, setPendingInlineComment] = useState<TCreateCommentPayload | null>(null);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);

  const openCommentsPane = useCallback(() => {
    router.push(updateQueryParams({ paramsToAdd: { [PAGE_NAVIGATION_PANE_TABS_QUERY_PARAM]: "comments" } }));
  }, [router, updateQueryParams]);

  const startInlineComment = useCallback(
    (payload: TCreateCommentPayload) => {
      setPendingInlineComment(payload);
      setActiveThreadId(null);
      openCommentsPane();
    },
    [openCommentsPane]
  );

  const value = useMemo<TPageCommentsContext>(
    () => ({
      ...comments,
      workspaceSlug,
      projectId,
      pageId,
      canComment,
      pendingInlineComment,
      startInlineComment,
      cancelInlineComment: () => setPendingInlineComment(null),
      activeThreadId,
      setActiveThreadId,
      openCommentsPane,
    }),
    [
      comments,
      workspaceSlug,
      projectId,
      pageId,
      canComment,
      pendingInlineComment,
      startInlineComment,
      activeThreadId,
      openCommentsPane,
    ]
  );

  return <PageCommentsContext.Provider value={value}>{children}</PageCommentsContext.Provider>;
}

export const usePageCommentsContext = () => useContext(PageCommentsContext);
