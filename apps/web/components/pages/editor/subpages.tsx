/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import Link from "next/link";
import { observer } from "mobx-react";
import { PagesOutline } from "@makeplane/propel/icons";
import { Logo } from "@plane/blocks/emoji-icon-picker";
import { getPageName } from "@plane/utils";
import { EPageStoreType, usePageStore } from "@/hooks/store";
import type { TProjectPage } from "@/store/pages/project-page";

type Props = {
  pageId: string;
  projectId: string;
  className: string;
};

export const PageEditorSubpages = observer(function PageEditorSubpages({ pageId, projectId, className }: Props) {
  const { getCurrentProjectPageIds, getPageById } = usePageStore(EPageStoreType.PROJECT);
  const subpages = getCurrentProjectPageIds(projectId)
    .map((id) => getPageById(id))
    .filter((candidate): candidate is TProjectPage =>
      Boolean(candidate && candidate.parent === pageId && !candidate.archived_at && !candidate.deleted_at)
    )
    .sort((a, b) => getPageName(a.name).localeCompare(getPageName(b.name)));

  if (subpages.length === 0) return null;

  return (
    <section aria-label="Subpages" className={`${className} mt-6 mb-4`}>
      <h2 className="mb-2 text-13 font-medium text-secondary">Subpages</h2>
      <div className="flex flex-col gap-1">
        {subpages.map((subpage) => (
          <Link
            key={subpage.id}
            href={subpage.getRedirectionLink()}
            className="flex items-center gap-2 rounded-md px-2 py-2 text-primary hover:bg-layer-1"
          >
            {subpage.logo_props?.in_use ? (
              <Logo logo={subpage.logo_props} size={16} type="lucide" />
            ) : (
              <PagesOutline className="size-4 flex-shrink-0 text-tertiary" />
            )}
            <span className="truncate text-13">{getPageName(subpage.name)}</span>
          </Link>
        ))}
      </div>
    </section>
  );
});
