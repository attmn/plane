/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { Link } from "react-router";
import { PagesOutline } from "@makeplane/propel/icons";
// plane imports
import { Logo } from "@plane/blocks/emoji-icon-picker";
import type { TPage } from "@plane/types";
import { getPageName } from "@plane/utils";
// hooks
import { EPageStoreType, usePageStore } from "@/hooks/store";
// services
import { ProjectPageService } from "@/services/page";

const projectPageService = new ProjectPageService();

type Props = {
  id: string;
};

/**
 * A link to another page, showing that page's current icon and title. Modelled on EditorUserMention.
 */
export const EditorPageMention = observer(function EditorPageMention(props: Props) {
  const { id } = props;
  const { workspaceSlug, projectId } = useParams();
  // store hooks
  const { getPageById } = usePageStore(EPageStoreType.PROJECT);
  const storePage = getPageById(id);
  // pages outside the store are fetched once without touching the store's loaders
  const [fetchedPage, setFetchedPage] = useState<TPage | null | undefined>(undefined);
  useEffect(() => {
    if (storePage || fetchedPage !== undefined || !workspaceSlug || !projectId) return;
    let isCancelled = false;
    const fetchPage = async () => {
      try {
        const page = await projectPageService.fetchById(workspaceSlug.toString(), projectId.toString(), id, false);
        if (!isCancelled) setFetchedPage(page ?? null);
      } catch {
        if (!isCancelled) setFetchedPage(null);
      }
    };
    void fetchPage();
    return () => {
      isCancelled = true;
    };
  }, [fetchedPage, id, projectId, storePage, workspaceSlug]);

  const page = storePage ?? fetchedPage;

  if (page === undefined) {
    return <span className="not-prose inline rounded-sm bg-layer-1 px-1 py-0.5 text-tertiary">@…</span>;
  }

  if (!page || page.deleted_at) {
    return (
      <span className="not-prose inline rounded-sm bg-layer-1 px-1 py-0.5 text-tertiary no-underline">
        @page unavailable
      </span>
    );
  }

  const pageProjectId = page.project_ids?.[0] ?? projectId?.toString();
  return (
    <Link
      to={`/${workspaceSlug}/projects/${pageProjectId}/pages/${id}`}
      className="not-prose decoration-subtle inline-flex items-baseline gap-1 rounded-sm px-0.5 text-primary underline underline-offset-2 hover:bg-layer-1"
    >
      <span className="inline-flex size-4 flex-shrink-0 self-center">
        {page.logo_props?.in_use ? (
          <Logo logo={page.logo_props} size={14} type="lucide" />
        ) : (
          <PagesOutline className="size-3.5 text-tertiary" />
        )}
      </span>
      <span className={page.archived_at ? "text-tertiary line-through" : undefined}>{getPageName(page.name)}</span>
    </Link>
  );
});
