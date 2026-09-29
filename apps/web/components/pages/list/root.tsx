/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
// types
import type { TPageNavigationTabs } from "@plane/types";
// components
import { ListLayout } from "@/components/core/list";
// plane web hooks
import type { EPageStoreType } from "@/hooks/store";
import { usePageStore } from "@/hooks/store";
// local imports
import { PageListBlock } from "./block";

type TPagesListRoot = {
  pageType: TPageNavigationTabs;
  storeType: EPageStoreType;
};

export const PagesListRoot = observer(function PagesListRoot(props: TPagesListRoot) {
  const { pageType, storeType } = props;
  // store hooks
  const { filters, getCurrentProjectFilteredPageIdsByTab, getPageById } = usePageStore(storeType);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [collapsedRootIds, setCollapsedRootIds] = useState<Set<string>>(new Set());
  // derived values
  const filteredPageIds = getCurrentProjectFilteredPageIdsByTab(pageType);

  if (!filteredPageIds) return <></>;

  const visibleIds = new Set(filteredPageIds);
  const childrenByParent = new Map<string, string[]>();
  const rootIds: string[] = [];
  for (const pageId of filteredPageIds) {
    const parentId = getPageById(pageId)?.parent;
    if (parentId && visibleIds.has(parentId) && parentId !== pageId) {
      const children = childrenByParent.get(parentId) ?? [];
      children.push(pageId);
      childrenByParent.set(parentId, children);
    } else {
      rootIds.push(pageId);
    }
  }

  const searching = Boolean(filters.searchQuery.trim());
  const rows: { id: string; depth: number; hasChildren: boolean; isExpanded: boolean }[] = [];
  const visited = new Set<string>();
  const addPage = (pageId: string, depth: number) => {
    if (visited.has(pageId)) return;
    visited.add(pageId);
    const children = childrenByParent.get(pageId) ?? [];
    const isExpanded = searching || (depth === 0 ? !collapsedRootIds.has(pageId) : expandedIds.has(pageId));
    rows.push({ id: pageId, depth, hasChildren: children.length > 0, isExpanded });
    if (isExpanded) children.forEach((childId) => addPage(childId, depth + 1));
  };
  rootIds.forEach((pageId) => addPage(pageId, 0));
  const togglePage = (pageId: string, depth: number) => {
    if (depth === 0) {
      setCollapsedRootIds((current) => {
        const next = new Set(current);
        if (next.has(pageId)) next.delete(pageId);
        else next.add(pageId);
        return next;
      });
    } else {
      setExpandedIds((current) => {
        const next = new Set(current);
        if (next.has(pageId)) next.delete(pageId);
        else next.add(pageId);
        return next;
      });
    }
  };
  return (
    <ListLayout>
      {rows.map(({ id, depth, hasChildren, isExpanded }) => (
        <PageListBlock
          key={id}
          pageId={id}
          storeType={storeType}
          depth={depth}
          hasChildren={hasChildren}
          isExpanded={isExpanded}
          onToggle={() => togglePage(id, depth)}
        />
      ))}
    </ListLayout>
  );
});
