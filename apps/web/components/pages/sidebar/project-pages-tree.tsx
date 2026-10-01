/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import { draggable, dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { attachInstruction, extractInstruction } from "@atlaskit/pragmatic-drag-and-drop-hitbox/tree-item";
import { observer } from "mobx-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { IconButton } from "@makeplane/propel/components/icon-button";
import { Icon } from "@makeplane/propel/components/icon";
import { AddOutline, ChevronDownOutline, ChevronRightOutline, PagesOutline } from "@makeplane/propel/icons";
// plane imports
import { DropIndicator } from "@plane/blocks/common";
import { Logo } from "@plane/blocks/emoji-icon-picker";
import { setToast } from "@plane/blocks/toast";
import { EPageAccess } from "@plane/types";
import { cn, getPageName } from "@plane/utils";
// components
import { NewPageMenu } from "@/components/pages/dropdowns";
import { PageTemplateBadge } from "@/components/pages/list/template-badge";
import { SidebarNavItem } from "@/components/sidebar/sidebar-navigation";
// hooks
import { EPageStoreType, usePageStore } from "@/hooks/store";
import { useAppRouter } from "@/hooks/use-app-router";
import useLocalStorage from "@/hooks/use-local-storage";
// store
import type { TProjectPage } from "@/store/pages/project-page";
// local imports
import { DEFAULT_PAGE_SORT_ORDER, planSortOrder } from "./page-tree-order";

type TProjectPagesTreeProps = {
  workspaceSlug: string;
  projectId: string;
  canCreatePages: boolean;
  onNavigate?: () => void;
  // shows this page's subpages instead of the project's top-level pages
  rootPageId?: string;
};

type TTreeRow = { page: TProjectPage; depth: number; hasChildren: boolean; isExpanded: boolean };

const INDENT_PX = 12;

const byName = (a: TProjectPage, b: TProjectPage) =>
  getPageName(a.name).localeCompare(getPageName(b.name), undefined, { sensitivity: "base", numeric: true });

// dragged pages keep the position they were dropped at; pages nobody has moved share the default and sort A–Z
const byTreeOrder = (a: TProjectPage, b: TProjectPage) =>
  (a.sort_order ?? DEFAULT_PAGE_SORT_ORDER) - (b.sort_order ?? DEFAULT_PAGE_SORT_ORDER) || byName(a, b);

const PAGE_DRAG_TYPE = "SIDEBAR_PAGE";

type TPageDragData = { type: typeof PAGE_DRAG_TYPE; pageId: string; projectId: string };

const isPageDragData = (data: Record<string | symbol, unknown>): data is TPageDragData =>
  data.type === PAGE_DRAG_TYPE && typeof data.pageId === "string";

type TDropInstruction = "reorder-above" | "reorder-below" | "make-child";

export const isSidebarPinnedPage = (page: TProjectPage) => !!page.view_props?.sidebar_pinned && !page.archived_at;

const getVisibleProjectPages = (
  projectId: string,
  getCurrentProjectPageIds: (projectId: string) => string[],
  getPageById: (pageId: string) => TProjectPage | undefined
) =>
  getCurrentProjectPageIds(projectId)
    .map((id) => getPageById(id))
    .filter((page): page is TProjectPage => !!page?.id && !page.archived_at);

// the parent a page is shown under in the sidebar: pages whose parent isn't visible (archived, someone's private page)
// sit at the top level
const getTreeParentId = (page: TProjectPage, visiblePageIds: Set<string | undefined>) =>
  page.parent && page.parent !== page.id && visiblePageIds.has(page.parent) ? page.parent : null;

const isSameOrAncestor = (
  candidateId: string,
  pageId: string,
  getPageById: (pageId: string) => TProjectPage | undefined
) => {
  const visited = new Set<string>();
  let current: string | null | undefined = pageId;
  while (current && !visited.has(current)) {
    if (current === candidateId) return true;
    visited.add(current);
    current = getPageById(current)?.parent;
  }
  return false;
};

/**
 * Moves a page in the sidebar tree for everyone: under `parentId` (null = top level), before or after a sibling, or
 * last when no sibling is given. Siblings are renumbered when their saved order can't hold the new position.
 */
const usePageTreeMove = (projectId: string) => {
  const { getCurrentProjectPageIds, getPageById } = usePageStore(EPageStoreType.PROJECT);
  return useCallback(
    async (pageId: string, parentId: string | null, position: { beforeId?: string; afterId?: string } = {}) => {
      const page = getPageById(pageId);
      if (!page) return;
      if (parentId && isSameOrAncestor(pageId, parentId, getPageById)) return;
      const pages = getVisibleProjectPages(projectId, getCurrentProjectPageIds, getPageById);
      const visiblePageIds = new Set(pages.map((p) => p.id));
      const siblings = pages
        .filter(
          (p) =>
            p.id !== pageId &&
            getTreeParentId(p, visiblePageIds) === parentId &&
            !(parentId === null && isSidebarPinnedPage(p))
        )
        .sort(byTreeOrder);
      const anchorId = position.beforeId ?? position.afterId;
      const anchorIndex = anchorId ? siblings.findIndex((p) => p.id === anchorId) : -1;
      const insertIndex = anchorIndex === -1 ? siblings.length : position.beforeId ? anchorIndex : anchorIndex + 1;
      const plan = planSortOrder(
        siblings.map((p) => ({ id: p.id!, sortOrder: p.sort_order ?? DEFAULT_PAGE_SORT_ORDER })),
        insertIndex
      );
      const isNewParent = getTreeParentId(page, visiblePageIds) !== parentId;
      try {
        await Promise.all([
          page.updateTreePosition({ sort_order: plan.sortOrder, ...(isNewParent ? { parent: parentId } : {}) }),
          ...plan.renumbered.map((sibling) =>
            getPageById(sibling.id)?.updateTreePosition({ sort_order: sibling.sortOrder })
          ),
        ]);
      } catch (error) {
        console.error(error);
        setToast({ type: "error", title: "Error!", message: "The page could not be moved. Please try again." });
      }
    },
    [projectId, getCurrentProjectPageIds, getPageById]
  );
};

/**
 * Pages shown as their own items next to "Pages" in the project sidebar, for everyone in the project.
 */
export const useSidebarPinnedPages = (projectId: string): TProjectPage[] => {
  const { getCurrentProjectPageIds, getPageById } = usePageStore(EPageStoreType.PROJECT);
  return getVisibleProjectPages(projectId, getCurrentProjectPageIds, getPageById)
    .filter(isSidebarPinnedPage)
    .sort(byName);
};

/**
 * Returns the pinned page whose subtree holds the given page, if any.
 */
export const findPinnedAncestor = (
  pageId: string | undefined,
  getPageById: (pageId: string) => TProjectPage | undefined
): TProjectPage | undefined => {
  const visited = new Set<string>();
  let current = pageId ? getPageById(pageId) : undefined;
  while (current?.id && !visited.has(current.id)) {
    if (isSidebarPinnedPage(current)) return current;
    visited.add(current.id);
    current = current.parent ? getPageById(current.parent) : undefined;
  }
  return undefined;
};

/**
 * Notion-style tree of a project's pages, shown under the project's "Pages" item in the sidebar.
 * Modelled on the nested Pages list (components/pages/list/root.tsx) and the sidebar nav items.
 */
export const ProjectPagesTree = observer(function ProjectPagesTree(props: TProjectPagesTreeProps) {
  const { workspaceSlug, projectId, canCreatePages, onNavigate, rootPageId } = props;
  const { pageId: routePageId } = useParams();
  const router = useAppRouter();
  // store hooks
  const { getCurrentProjectPageIds, getPageById, createPage, createPageFromTemplate } = usePageStore(
    EPageStoreType.PROJECT
  );
  // expanded pages, remembered per project
  const { storedValue: storedExpandedIds, setValue: setStoredExpandedIds } = useLocalStorage<string[]>(
    `sidebar_page_tree_expanded_${projectId}`,
    []
  );
  const expandedIds = useMemo(() => new Set(storedExpandedIds ?? []), [storedExpandedIds]);
  const [creatingParentId, setCreatingParentId] = useState<string | null | undefined>(undefined);

  const pages = getVisibleProjectPages(projectId, getCurrentProjectPageIds, getPageById);

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

  const movePage = usePageTreeMove(projectId);
  const handleDrop = (pageId: string, target: TProjectPage, instruction: TDropInstruction) => {
    if (!target.id) return;
    if (instruction === "make-child") {
      if (!expandedIds.has(target.id)) setStoredExpandedIds([...expandedIds, target.id]);
      void movePage(pageId, target.id);
      return;
    }
    // a top-level row of a pinned page's subtree sits under that pinned page
    const parentId = rootPageId && target.parent === rootPageId ? rootPageId : getTreeParentId(target, pageIds);
    void movePage(pageId, parentId, instruction === "reorder-above" ? { beforeId: target.id } : { afterId: target.id });
  };

  const handleCreate = async (parentPage: TProjectPage | null, templateId: string | null) => {
    const parent = parentPage ?? (rootPageId ? (getPageById(rootPageId) ?? null) : null);
    if (creatingParentId !== undefined) return;
    setCreatingParentId(parent?.id ?? null);
    try {
      const pageData = { parent: parent?.id ?? null, access: parent?.access ?? EPageAccess.PUBLIC };
      const page = templateId
        ? await createPageFromTemplate(templateId, pageData, projectId)
        : await createPage({ ...pageData, name: "" }, projectId);
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
    const children = [...(childrenByParent.get(page.id) ?? [])].sort(byTreeOrder);
    const isExpanded = expandedIds.has(page.id);
    rows.push({ page, depth, hasChildren: children.length > 0, isExpanded });
    if (isExpanded) children.forEach((child) => addRow(child, depth + 1));
  };
  // pinned top-level pages have their own sidebar item, so the Pages tree leaves them out
  const treeRoots = rootPageId
    ? (childrenByParent.get(rootPageId) ?? [])
    : rootPages.filter((p) => !isSidebarPinnedPage(p));
  [...treeRoots].sort(byTreeOrder).forEach((page) => addRow(page, 0));

  return (
    <div className="flex flex-col gap-0.5" role="tree" aria-label={rootPageId ? "Subpages" : "Pages"}>
      {rows.map(({ page, depth, hasChildren, isExpanded }) => (
        <PageTreeRow
          key={page.id}
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          page={page}
          depth={depth}
          hasChildren={hasChildren}
          isExpanded={isExpanded}
          isActive={page.id === activePageId}
          canCreatePages={canCreatePages}
          isCreating={creatingParentId !== undefined}
          onToggle={toggle}
          onCreate={(parent, templateId) => void handleCreate(parent, templateId)}
          onDrop={handleDrop}
          onNavigate={onNavigate}
        />
      ))}
      {canCreatePages && (
        <NewPageMenu
          projectId={projectId}
          onSelect={(templateId) => void handleCreate(null, templateId)}
          trigger={
            <button
              type="button"
              className="flex items-center gap-1 rounded-md px-2 py-0.5 text-11 font-medium text-tertiary hover:bg-layer-transparent-hover"
              disabled={creatingParentId !== undefined}
            >
              <span className="size-4 flex-shrink-0" aria-hidden="true" />
              <AddOutline className="size-3.5 flex-shrink-0" />
              New page
            </button>
          }
        />
      )}
    </div>
  );
});

type TPageTreeRowProps = {
  workspaceSlug: string;
  projectId: string;
  page: TProjectPage;
  depth: number;
  hasChildren: boolean;
  isExpanded: boolean;
  isActive: boolean;
  canCreatePages: boolean;
  isCreating: boolean;
  onToggle: (pageId: string) => void;
  onCreate: (parent: TProjectPage, templateId: string | null) => void;
  onDrop: (pageId: string, target: TProjectPage, instruction: TDropInstruction) => void;
  onNavigate?: () => void;
};

/**
 * One page in the sidebar tree. Drag it to reorder (drop above or below a page) or to nest (drop onto a page).
 * Drag and drop is modelled on the sidebar's project list (workspace/sidebar/projects-list-item.tsx).
 */
const PageTreeRow = observer(function PageTreeRow(props: TPageTreeRowProps) {
  const {
    workspaceSlug,
    projectId,
    page,
    depth,
    hasChildren,
    isExpanded,
    isActive,
    canCreatePages,
    isCreating,
    onToggle,
    onCreate,
    onDrop,
    onNavigate,
  } = props;
  const rowRef = useRef<HTMLDivElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [instruction, setInstruction] = useState<TDropInstruction | undefined>(undefined);
  const { getPageById } = usePageStore(EPageStoreType.PROJECT);
  // moving a page changes the tree for everyone, so it needs edit rights; a locked page stays where it is
  const canDrag = page.canCurrentUserEditPage && !page.is_locked;
  const pageName = getPageName(page.name);

  useEffect(() => {
    const element = rowRef.current;
    if (!element || !page.id) return;
    const pageId = page.id;
    const readInstruction = (data: Record<string | symbol, unknown>): TDropInstruction | undefined => {
      const type = extractInstruction(data)?.type;
      return type === "reorder-above" || type === "reorder-below" || type === "make-child" ? type : undefined;
    };
    return combine(
      draggable({
        element,
        canDrag: () => canDrag,
        getInitialData: (): TPageDragData => ({ type: PAGE_DRAG_TYPE, pageId, projectId }),
        onDragStart: () => setIsDragging(true),
        onDrop: () => setIsDragging(false),
      }),
      dropTargetForElements({
        element,
        canDrop: ({ source }) =>
          isPageDragData(source.data) &&
          source.data.projectId === projectId &&
          !isSameOrAncestor(source.data.pageId, pageId, getPageById),
        // oxlint-disable-next-line no-shadow
        getData: ({ input, element }) =>
          attachInstruction(
            { pageId },
            {
              input,
              element,
              currentLevel: depth,
              indentPerLevel: INDENT_PX,
              mode: hasChildren && isExpanded ? "expanded" : "standard",
            }
          ),
        onDrag: ({ self }) => setInstruction(readInstruction(self.data)),
        onDragLeave: () => setInstruction(undefined),
        onDrop: ({ self, source }) => {
          setInstruction(undefined);
          const dropInstruction = readInstruction(self.data);
          if (dropInstruction && isPageDragData(source.data)) onDrop(source.data.pageId, page, dropInstruction);
        },
      })
    );
  }, [page, projectId, depth, hasChildren, isExpanded, canDrag, getPageById, onDrop]);

  return (
    <div
      ref={rowRef}
      role="treeitem"
      aria-expanded={hasChildren ? isExpanded : undefined}
      className={cn("relative", { "opacity-50": isDragging })}
    >
      <DropIndicator classNames="absolute top-0" isVisible={instruction === "reorder-above"} />
      <Link href={`/${workspaceSlug}/projects/${projectId}/pages/${page.id}`} onClick={onNavigate} draggable={false}>
        <SidebarNavItem
          isActive={isActive}
          className={cn("py-0.5 pr-1", { "ring-accent-primary ring-1": instruction === "make-child" })}
        >
          <div className="flex min-w-0 flex-1 items-center gap-1" style={{ paddingLeft: depth * INDENT_PX }}>
            {hasChildren ? (
              <button
                type="button"
                className="grid size-4 flex-shrink-0 place-items-center rounded-sm text-tertiary hover:bg-layer-1"
                aria-label={`${isExpanded ? "Collapse" : "Expand"} ${pageName}`}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (page.id) onToggle(page.id);
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
            {page.view_props?.is_template && <PageTemplateBadge />}
          </div>
          {canCreatePages && (
            // stays visible while its template menu is open
            <span className="hidden flex-shrink-0 group-hover:inline-flex has-[[data-popup-open]]:inline-flex">
              <NewPageMenu
                projectId={projectId}
                onSelect={(templateId) => onCreate(page, templateId)}
                trigger={
                  <IconButton
                    variant="ghost"
                    size="xs"
                    icon={<Icon icon={AddOutline} />}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    disabled={isCreating}
                    aria-label={`Add a page inside ${pageName}`}
                  />
                }
              />
            </span>
          )}
        </SidebarNavItem>
      </Link>
      <DropIndicator classNames="absolute bottom-0" isVisible={instruction === "reorder-below"} />
    </div>
  );
});

type TPinnedPageNavItemProps = {
  workspaceSlug: string;
  projectId: string;
  page: TProjectPage;
  canCreatePages: boolean;
  onNavigate?: () => void;
};

/**
 * A pinned page shown at the same level as "Pages", with its own subpage tree. Modelled on the "Pages" nav item.
 */
export const PinnedPageNavItem = observer(function PinnedPageNavItem(props: TPinnedPageNavItemProps) {
  const { workspaceSlug, projectId, page, canCreatePages, onNavigate } = props;
  const { pageId: routePageId } = useParams();
  const { getPageById } = usePageStore(EPageStoreType.PROJECT);
  const { storedValue: isOpen, setValue: setIsOpen } = useLocalStorage<boolean>(
    `sidebar_page_tree_open_page_${page.id}`,
    false
  );
  const activePageId = routePageId?.toString();
  const isActive = activePageId === page.id;
  const isInSubtree = !!activePageId && findPinnedAncestor(activePageId, getPageById)?.id === page.id;
  useEffect(() => {
    if (isInSubtree && !isActive && !isOpen) setIsOpen(true);
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- open when the user navigates into this subtree
  }, [isInSubtree, isActive]);

  // dropping a page onto the pinned item nests it as the pinned page's last subpage
  const movePage = usePageTreeMove(projectId);
  const itemRef = useRef<HTMLDivElement | null>(null);
  const [isDropTarget, setIsDropTarget] = useState(false);
  useEffect(() => {
    const element = itemRef.current;
    if (!element || !page.id) return;
    const pageId = page.id;
    return dropTargetForElements({
      element,
      canDrop: ({ source }) =>
        isPageDragData(source.data) &&
        source.data.projectId === projectId &&
        !isSameOrAncestor(source.data.pageId, pageId, getPageById),
      onDragEnter: () => setIsDropTarget(true),
      onDragLeave: () => setIsDropTarget(false),
      onDrop: ({ source }) => {
        setIsDropTarget(false);
        if (!isPageDragData(source.data)) return;
        if (!isOpen) setIsOpen(true);
        void movePage(source.data.pageId, pageId);
      },
    });
  }, [page.id, projectId, getPageById, movePage, isOpen, setIsOpen]);

  const pageName = getPageName(page.name);
  return (
    <>
      <div ref={itemRef}>
        <Link href={`/${workspaceSlug}/projects/${projectId}/pages/${page.id}`} onClick={onNavigate} draggable={false}>
          <SidebarNavItem isActive={isActive} className={cn({ "ring-accent-primary ring-1": isDropTarget })}>
            <div className="flex w-full items-center justify-between gap-1.5 py-[1px]">
              <div className="flex min-w-0 items-center gap-1.5">
                {page.logo_props?.in_use ? (
                  <Logo logo={page.logo_props} size={16} type="lucide" />
                ) : (
                  <PagesOutline className="size-4 flex-shrink-0 stroke-[1.5]" />
                )}
                <span className="truncate text-11 font-medium">{pageName}</span>
              </div>
              <button
                type="button"
                className="grid size-4 flex-shrink-0 place-items-center rounded-sm text-tertiary hover:bg-layer-1"
                aria-label={isOpen ? `Hide subpages of ${pageName}` : `Show subpages of ${pageName}`}
                aria-expanded={!!isOpen}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsOpen(!isOpen);
                }}
              >
                <ChevronRightOutline className={cn("size-3.5 transition-transform", { "rotate-90": isOpen })} />
              </button>
            </div>
          </SidebarNavItem>
        </Link>
      </div>
      {isOpen && (
        <ProjectPagesTree
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          canCreatePages={canCreatePages}
          onNavigate={onNavigate}
          rootPageId={page.id}
        />
      )}
    </>
  );
});
