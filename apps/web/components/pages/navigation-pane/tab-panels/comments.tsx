/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
// plane imports
import { Button } from "@makeplane/propel/components/button";
import { setToast } from "@plane/blocks/toast";
import { COMMENT_MARK_ID_ATTRIBUTE } from "@plane/editor";
import { cn } from "@plane/utils";
// components
import { CommentCard } from "@/components/comments/card/root";
import { CommentCreate } from "@/components/comments/comment-create";
import { usePageCommentsContext } from "@/components/pages/comments/context";
import type { TPageCommentThread } from "@/components/pages/comments/use-page-comments";
import { toCardComment } from "@/components/pages/comments/use-page-comments";

type TFilter = "open" | "resolved";

const getAnchoredText = (anchorId: string) =>
  Array.from(document.querySelectorAll(`.editor-container [${COMMENT_MARK_ID_ATTRIBUTE}="${CSS.escape(anchorId)}"]`))
    .map((element) => element.textContent ?? "")
    .join("");

function Quote(props: { text: string }) {
  return (
    <blockquote className="mb-2 truncate border-l-2 border-subtle pl-2 text-11 text-tertiary italic">
      {props.text}
    </blockquote>
  );
}

const PageCommentThreadCard = observer(function PageCommentThreadCard(props: { thread: TPageCommentThread }) {
  const { thread } = props;
  const context = usePageCommentsContext();
  const [isReplying, setIsReplying] = useState(false);
  const [quote, setQuote] = useState<string | null>(null);
  const { root, replies } = thread;
  const isActive = context?.activeThreadId === root.id;

  // the quoted text lives in the page, so it follows edits to the page
  useEffect(() => {
    if (root.anchor_id) setQuote(getAnchoredText(root.anchor_id));
  }, [root.anchor_id, context?.comments]);

  useEffect(() => {
    if (isActive) document.getElementById(`page-comment-thread-${root.id}`)?.scrollIntoView({ block: "nearest" });
  }, [isActive, root.id]);

  if (!context) return null;
  const { workspaceSlug, projectId, pageId, canComment, getCommentOperations, setResolved, setActiveThreadId } =
    context;
  const operations = getCommentOperations({ parent: root.id });
  const comments = [root, ...replies];

  const focusAnchor = () => {
    setActiveThreadId(root.id);
    if (!root.anchor_id) return;
    document
      .querySelector(`.editor-container [${COMMENT_MARK_ID_ATTRIBUTE}="${CSS.escape(root.anchor_id)}"]`)
      ?.scrollIntoView({ block: "center", behavior: "smooth" });
  };

  return (
    <div
      id={`page-comment-thread-${root.id}`}
      className={cn("rounded-lg border border-subtle p-2", { "border-accent-strong": isActive })}
    >
      {root.anchor_id && (
        <button type="button" className="block w-full text-left" onClick={focusAnchor}>
          <Quote text={quote || "The commented text was removed from the page."} />
        </button>
      )}
      {comments.map((comment, index) => (
        <CommentCard
          key={comment.id}
          workspaceSlug={workspaceSlug}
          entityId={pageId}
          comment={toCardComment(comment)}
          activityOperations={operations}
          ends={index === 0 ? "top" : index === comments.length - 1 ? "bottom" : undefined}
          showAccessSpecifier={false}
          showCopyLinkOption={false}
          enableReplies={false}
          showReactions={false}
          disabled={!canComment}
          projectId={projectId}
        />
      ))}
      {canComment && (
        <div className="mt-1 flex flex-col gap-2">
          {isReplying && (
            <CommentCreate
              workspaceSlug={workspaceSlug}
              entityId={pageId}
              composerId={`page_comment_reply_${root.id}`}
              projectId={projectId}
              activityOperations={operations}
              onSubmitCallback={() => setIsReplying(false)}
            />
          )}
          <div className="flex items-center gap-2">
            {!isReplying && !root.resolved_at && (
              <Button variant="secondary" size="sm" stretch="auto" label="Reply" onClick={() => setIsReplying(true)} />
            )}
            <Button
              variant="secondary"
              size="sm"
              stretch="auto"
              label={root.resolved_at ? "Reopen" : "Resolve"}
              onClick={() => void setResolved(root.id, !root.resolved_at)}
            />
          </div>
        </div>
      )}
    </div>
  );
});

const PendingInlineComment = observer(function PendingInlineComment() {
  const context = usePageCommentsContext();
  // one anchor id per comment being written; it is stored with the thread and on the page text
  const anchorId = useMemo(() => crypto.randomUUID(), [context?.pendingInlineComment]);
  if (!context?.pendingInlineComment || !context.canComment) return null;
  const { pendingInlineComment, workspaceSlug, projectId, pageId, getCommentOperations, cancelInlineComment } = context;

  return (
    <div className="rounded-lg border border-accent-strong p-2">
      <Quote text={pendingInlineComment.quote} />
      <CommentCreate
        workspaceSlug={workspaceSlug}
        entityId={pageId}
        composerId={`page_comment_inline_${anchorId}`}
        projectId={projectId}
        activityOperations={getCommentOperations({ anchor_id: anchorId })}
        showToolbarInitially
        onSubmitCallback={(threadId) => {
          if (!pendingInlineComment.applyAnchor(anchorId)) {
            setToast({
              type: "warning",
              title: "Comment added",
              message: "The selected text changed while you were writing, so the comment is not attached to it.",
            });
          }
          cancelInlineComment();
          context.setActiveThreadId(threadId);
        }}
      />
      <div className="mt-2">
        <Button variant="ghost" size="sm" stretch="auto" label="Cancel" onClick={cancelInlineComment} />
      </div>
    </div>
  );
});

export const PageNavigationPaneCommentsTabPanel = observer(function PageNavigationPaneCommentsTabPanel() {
  const context = usePageCommentsContext();
  const [filter, setFilter] = useState<TFilter>("open");
  if (!context) return null;
  const { threads, isLoading, canComment, workspaceSlug, projectId, pageId, getCommentOperations } = context;
  const visibleThreads = threads.filter(({ root }) => (filter === "open" ? !root.resolved_at : !!root.resolved_at));
  const resolvedCount = threads.filter(({ root }) => !!root.resolved_at).length;

  return (
    <div className="flex size-full flex-col gap-3 overflow-y-auto px-3.5">
      <div className="flex items-center gap-1">
        {(["open", "resolved"] as const).map((key) => (
          <button
            key={key}
            type="button"
            className={cn("rounded-md px-2 py-1 text-11 font-medium text-tertiary hover:bg-layer-1", {
              "bg-layer-1 text-primary": filter === key,
            })}
            onClick={() => setFilter(key)}
          >
            {key === "open" ? "Open" : `Resolved${resolvedCount ? ` (${resolvedCount})` : ""}`}
          </button>
        ))}
      </div>
      <PendingInlineComment />
      {!isLoading && visibleThreads.length === 0 && (
        <p className="text-11 text-tertiary">
          {filter === "open"
            ? "No open comments. Select text in the page and choose Comment, or comment on the whole page below."
            : "No resolved comments."}
        </p>
      )}
      {visibleThreads.map((thread) => (
        <PageCommentThreadCard key={thread.root.id} thread={thread} />
      ))}
      {canComment && filter === "open" && (
        <div className="mt-auto pb-2">
          <p className="mb-1 text-11 font-medium text-tertiary">Comment on this page</p>
          <CommentCreate
            workspaceSlug={workspaceSlug}
            entityId={pageId}
            composerId={`page_comment_${pageId}`}
            projectId={projectId}
            activityOperations={getCommentOperations()}
          />
        </div>
      )}
    </div>
  );
});
