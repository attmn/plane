/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { observer } from "mobx-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { IconButton } from "@makeplane/propel/components/icon-button";
import { Icon } from "@makeplane/propel/components/icon";
import { AddOutline, ChevronDownOutline, ChevronRightOutline, PagesOutline } from "@makeplane/propel/icons";
// plane imports
import { Logo } from "@plane/blocks/emoji-icon-picker";
import { setToast } from "@plane/blocks/toast";
import { EPageAccess } from "@plane/types";
import { getPageName } from "@plane/utils";
// components
import { SidebarNavItem } from "@/components/sidebar/sidebar-navigation";
// hooks
import { EPageStoreType, usePageStore } from "@/hooks/store";
import { useAppRouter } from "@/hooks/use-app-router";
import useLocalStorage from "@/hooks/use-local-storage";
// store
import type { TProjectPage } from "@/store/pages/project-page";

type TProjectPagesTreeProps = {
  workspaceSlug: string;
  projectId: string;
  canCreatePages: boolean;
  onNavigate?: () => void;
};

type TTreeRow = { page: TProjectPage; depth: number; hasChildren: boolean; isExpanded: boolean };

const INDENT_PX = 12;

const byName = (a: TProjectPage, b: TProjectPage) =>
  getPageName(a.name).localeCompare(getPageName(b.name), undefined, { sensitivity: "base", numeric: true });

/**
 * Notion-style tree of a project's pages, shown under the project's "Pages" item in the sidebar.
 * Modelled on the nested Pages list (components/pages/list/root.tsx) and the sidebar nav items.
 */
export const ProjectPagesTree = observer(function ProjectPagesTree(props: TProjectPagesTreeProps) {
  const { workspaceSlug, projectId, canCreatePages, onNavigate } = props;
  const { pageId: routePageId } = useParams();
  const router = useAppRouter();
  // store hooks
  const { getCurrentProjectPageIds, getPageById, fetchPagesList, createPage } = usePageStore(EPageStoreType.PROJECT);
  // expanded pages, remembered per project
  const { storedValue: storedExpandedIds, setValue: setStoredExpandedIds } = useLocalStorage<string[]>(
    `sidebar_page_tree_expanded_${projectId}`,
    []
  );
  const expandedIds = useMemo(() => new Set(storedExpandedIds ?? []), [storedExpandedIds]);
  const [creatingParentId, setCreatingParentId] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    fetchPagesList(workspaceSlug, projectId).catch((error) => console.error(error));
  }, [fetchPagesList, workspaceSlug, projectId]);

  const pages = getCurrentProjectPageIds(projectId)
    .map((id) => getPageById(id))
    .filter((page): page is TProjectPage => !!page?.id && !page.archived_at);

  const pageIds = new Set(pages.map((page) => page.id));
  const childrenByParent = new Map<string, TProjectPage[]>();
  const rootPages: TProjectPage[] = [];
  for (const page of pages) {
    if (page.parent && page.parent !== page.id && pageIds.has(page.parent)) {
      const children = childrenByParent.get(page.parent) ?? [];
      children.push(page);
      childrenByParent.set(page.parent, children);
    } else {
      rootPages.push(page);
    }
  }

  // open the ancestors of the page being viewed, once per page so they can still be collapsed
  const activePageId = routePageId?.toString();
  const activePageParent = activePageId ? getPageById(activePageId)?.parent : undefined;
  const revealedPageIdRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!activePageId || !pageIds.has(activePageId) || revealedPageIdRef.current === activePageId) return;
    revealedPageIdRef.current = activePageId;
    const ancestors: string[] = [];
    const visited = new Set<string>();
    let parentId = getPageById(activePageId)?.parent;
    while (parentId && !visited.has(parentId)) {
      visited.add(parentId);
      ancestors.push(parentId);
      parentId = getPageById(parentId)?.parent;
    }
    const missing = ancestors.filter((id) => !expandedIds.has(id));
    if (missing.length > 0) setStoredExpandedIds([...expandedIds, ...missing]);
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- runs when the viewed page or its parent changes
  }, [activePageId, activePageParent, pageIds.size]);

  const toggle = useCallback(
    (pageId: string) => {
      const next = new Set(expandedIds);
      if (next.has(pageId)) next.delete(pageId);
      else next.add(pageId);
      setStoredExpandedIds([...next]);
    },
    [expandedIds, setStoredExpandedIds]
  );

  const handleCreate = async (parent: TProjectPage | null) => {
    if (creatingParentId !== undefined) return;
    setCreatingParentId(parent?.id ?? null);
    try {
      const page = await createPage(
        { name: "", parent: parent?.id ?? null, access: parent?.access ?? EPageAccess.PUBLIC },
        projectId
      );
      if (!page?.id) throw new Error("The page was not created.");
      if (parent?.id && !expandedIds.has(parent.id)) setStoredExpandedIds([...expandedIds, parent.id]);
      onNavigate?.();
      router.push(`/${workspaceSlug}/projects/${projectId}/pages/${page.id}`);
    } catch (error) {
      console.error(error);
      setToast({ type: "error", title: "Error!", message: "The page could not be created. Please try again." });
    } finally {
      setCreatingParentId(undefined);
    }
  };

  const rows: TTreeRow[] = [];
  const visited = new Set<string>();
  const addRow = (page: TProjectPage, depth: number) => {
    if (!page.id || visited.has(page.id)) return;
    visited.add(page.id);
    const children = [...(childrenByParent.get(page.id) ?? [])].sort(byName);
    const isExpanded = expandedIds.has(page.id);
    rows.push({ page, depth, hasChildren: children.length > 0, isExpanded });
    if (isExpanded) children.forEach((child) => addRow(child, depth + 1));
  };
  [...rootPages].sort(byName).forEach((page) => addRow(page, 0));

  return (
    <div className="flex flex-col gap-0.5" role="tree" aria-label="Pages">
      {rows.map(({ page, depth, hasChildren, isExpanded }) => {
        const pageName = getPageName(page.name);
        return (
          <div key={page.id} role="treeitem" aria-expanded={hasChildren ? isExpanded : undefined}>
            <Link href={`/${workspaceSlug}/projects/${projectId}/pages/${page.id}`} onClick={onNavigate}>
              <SidebarNavItem isActive={page.id === activePageId} className="py-0.5 pr-1">
                <div className="flex min-w-0 flex-1 items-center gap-1" style={{ paddingLeft: depth * INDENT_PX }}>
                  {hasChildren ? (
                    <button
                      type="button"
                      className="grid size-4 flex-shrink-0 place-items-center rounded-sm text-tertiary hover:bg-layer-1"
                      aria-label={`${isExpanded ? "Collapse" : "Expand"} ${pageName}`}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        toggle(page.id!);
                      }}
                    >
                      {isExpanded ? (
                        <ChevronDownOutline className="size-3.5" />
                      ) : (
                        <ChevronRightOutline className="size-3.5" />
                      )}
                    </button>
                  ) : (
                    <span className="size-4 flex-shrink-0" aria-hidden="true" />
                  )}
                  {page.logo_props?.in_use ? (
                    <Logo logo={page.logo_props} size={14} type="lucide" />
                  ) : (
                    <PagesOutline className="size-3.5 flex-shrink-0 text-tertiary" />
                  )}
                  <span className="truncate text-11 font-medium">{pageName}</span>
                </div>
                {canCreatePages && (
                  <span className="hidden flex-shrink-0 group-hover:inline-flex">
                    <IconButton
                      variant="ghost"
                      size="xs"
                      icon={<Icon icon={AddOutline} />}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        void handleCreate(page);
                      }}
                      disabled={creatingParentId !== undefined}
                      aria-label={`Add a page inside ${pageName}`}
                    />
                  </span>
                )}
              </SidebarNavItem>
            </Link>
          </div>
        );
      })}
      {canCreatePages && (
        <button
          type="button"
          className="flex items-center gap-1 rounded-md px-2 py-0.5 text-11 font-medium text-tertiary hover:bg-layer-transparent-hover"
          onClick={() => void handleCreate(null)}
          disabled={creatingParentId !== undefined}
        >
          <span className="size-4 flex-shrink-0" aria-hidden="true" />
          <AddOutline className="size-3.5 flex-shrink-0" />
          New page
        </button>
      )}
    </div>
  );
});
