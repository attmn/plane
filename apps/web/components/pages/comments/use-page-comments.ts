/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useMemo } from "react";
import useSWR from "swr";
// plane imports
import { setToast } from "@plane/blocks/toast";
import { EFileAssetType, EIssueCommentAccessSpecifier } from "@plane/types";
import type { TCommentsOperations, TIssueComment, TPageComment } from "@plane/types";
// hooks
import { useEditorAsset } from "@/hooks/store/use-editor-asset";
// services
import { ProjectPageCommentService } from "@/services/page";
import type { TCreatePageCommentPayload } from "@/services/page";

const pageCommentService = new ProjectPageCommentService();

export type TPageCommentThread = {
  root: TPageComment;
  replies: TPageComment[];
};

/**
 * The shared comment card and composer render work-item comments; page comments carry the fields they read.
 */
export const toCardComment = (comment: TPageComment): TIssueComment =>
  ({
    ...comment,
    edited_at: comment.edited_at ?? undefined,
    access: EIssueCommentAccessSpecifier.INTERNAL,
    attachments: [],
    comment_reactions: [],
  }) as unknown as TIssueComment;

const errorMessage = (error: unknown, fallback: string) => (error as { error?: string } | undefined)?.error ?? fallback;

export const usePageComments = (args: { workspaceSlug: string; projectId: string | undefined; pageId: string }) => {
  const { workspaceSlug, projectId, pageId } = args;
  const { uploadEditorAsset, duplicateEditorAsset } = useEditorAsset();

  const swrKey = projectId && pageId ? `PAGE_COMMENTS_${pageId}` : null;
  const {
    data: comments,
    mutate,
    isLoading,
  } = useSWR(swrKey, () => pageCommentService.list(workspaceSlug, projectId!, pageId));

  const threads = useMemo<TPageCommentThread[]>(() => {
    const all = comments ?? [];
    const repliesByThread = new Map<string, TPageComment[]>();
    for (const comment of all) {
      if (!comment.parent) continue;
      repliesByThread.set(comment.parent, [...(repliesByThread.get(comment.parent) ?? []), comment]);
    }
    return all.filter((c) => !c.parent).map((root) => ({ root, replies: repliesByThread.get(root.id) ?? [] }));
  }, [comments]);

  const createComment = useCallback(
    async (data: TCreatePageCommentPayload) => {
      if (!projectId) return undefined;
      try {
        const comment = await pageCommentService.create(workspaceSlug, projectId, pageId, data);
        await mutate((current) => [...(current ?? []), comment], { revalidate: false });
        return comment;
      } catch (error) {
        setToast({ type: "error", title: "Error!", message: errorMessage(error, "The comment could not be added.") });
        throw error;
      }
    },
    [mutate, pageId, projectId, workspaceSlug]
  );

  const setResolved = useCallback(
    async (threadId: string, resolved: boolean) => {
      if (!projectId) return;
      try {
        const thread = resolved
          ? await pageCommentService.resolve(workspaceSlug, projectId, pageId, threadId)
          : await pageCommentService.reopen(workspaceSlug, projectId, pageId, threadId);
        await mutate((current) => (current ?? []).map((c) => (c.id === thread.id ? thread : c)), {
          revalidate: false,
        });
      } catch (error) {
        setToast({
          type: "error",
          title: "Error!",
          message: errorMessage(
            error,
            resolved ? "The thread could not be resolved." : "The thread could not be reopened."
          ),
        });
      }
    },
    [mutate, pageId, projectId, workspaceSlug]
  );

  /**
   * Operations for the shared comment card and composer. Page comments have no reactions or comment links.
   * `newCommentFields` sets the thread or anchor that a new comment from this composer belongs to.
   */
  const getCommentOperations = useCallback(
    (newCommentFields: Partial<Pick<TPageComment, "parent" | "anchor_id">> = {}): TCommentsOperations => ({
      copyCommentLink: () => undefined,
      createComment: async (data) => {
        const comment = await createComment({ comment_html: data.comment_html ?? "", ...newCommentFields });
        return comment ? toCardComment(comment) : undefined;
      },
      updateComment: async (commentId, data) => {
        if (!projectId || data.comment_html === undefined) return;
        try {
          const comment = await pageCommentService.update(workspaceSlug, projectId, pageId, commentId, {
            comment_html: data.comment_html,
          });
          await mutate((current) => (current ?? []).map((c) => (c.id === comment.id ? comment : c)), {
            revalidate: false,
          });
        } catch (error) {
          setToast({ type: "error", title: "Error!", message: errorMessage(error, "The comment could not be saved.") });
        }
      },
      removeComment: async (commentId) => {
        if (!projectId) return;
        try {
          await pageCommentService.remove(workspaceSlug, projectId, pageId, commentId);
          // deleting a thread's first comment deletes its replies
          await mutate((current) => (current ?? []).filter((c) => c.id !== commentId && c.parent !== commentId), {
            revalidate: false,
          });
        } catch (error) {
          setToast({
            type: "error",
            title: "Error!",
            message: errorMessage(error, "The comment could not be deleted."),
          });
        }
      },
      // images in page comments are stored with the page, like images in the page itself
      uploadCommentAsset: async (blockId, file) => {
        if (!projectId) throw new Error("Missing project");
        return uploadEditorAsset({
          blockId,
          data: { entity_identifier: pageId, entity_type: EFileAssetType.PAGE_DESCRIPTION },
          file,
          projectId,
          workspaceSlug,
        });
      },
      duplicateCommentAsset: async (assetId) => {
        if (!projectId) throw new Error("Missing project");
        return duplicateEditorAsset({
          assetId,
          entityId: pageId,
          entityType: EFileAssetType.PAGE_DESCRIPTION,
          projectId,
          workspaceSlug,
        });
      },
      addCommentReaction: async () => undefined,
      deleteCommentReaction: async () => undefined,
      react: async () => undefined,
      reactionIds: () => undefined,
      userReactions: () => [],
      getReactionUsers: () => "",
    }),
    [createComment, duplicateEditorAsset, mutate, pageId, projectId, uploadEditorAsset, workspaceSlug]
  );

  return { comments: comments ?? [], threads, isLoading, createComment, setResolved, getCommentOperations };
};
