/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Page.sort_order's default in the API; pages nobody has dragged all share it and fall back to A–Z
export const DEFAULT_PAGE_SORT_ORDER = 65535;
export const PAGE_SORT_ORDER_STEP = 1000;
const MIN_SORT_ORDER_GAP = 1e-6;

export type TSiblingOrder = { id: string; sortOrder: number };

export type TSortOrderPlan = {
  // sort_order for the moved page
  sortOrder: number;
  // siblings whose sort_order must change too, when their current order can't fit the moved page
  renumbered: TSiblingOrder[];
};

const isStrictlyIncreasing = (siblings: TSiblingOrder[]) =>
  siblings.every(
    (sibling, index) => index === 0 || sibling.sortOrder - siblings[index - 1].sortOrder > MIN_SORT_ORDER_GAP
  );

/**
 * Works out the sort_order for a page dropped at `insertIndex` among `siblings`.
 * `siblings` are in display order and exclude the moved page. When the displayed order isn't backed by distinct
 * sort_orders (untouched pages all share the default and sort by name), every sibling is renumbered so the order
 * people see is the order that gets saved.
 */
export const planSortOrder = (siblings: TSiblingOrder[], insertIndex: number): TSortOrderPlan => {
  const index = Math.max(0, Math.min(insertIndex, siblings.length));
  const prev = siblings[index - 1];
  const next = siblings[index];

  if (isStrictlyIncreasing(siblings)) {
    if (!prev && !next) return { sortOrder: DEFAULT_PAGE_SORT_ORDER, renumbered: [] };
    if (!prev) return { sortOrder: next.sortOrder - PAGE_SORT_ORDER_STEP, renumbered: [] };
    if (!next) return { sortOrder: prev.sortOrder + PAGE_SORT_ORDER_STEP, renumbered: [] };
    if (next.sortOrder - prev.sortOrder > 2 * MIN_SORT_ORDER_GAP)
      return { sortOrder: (prev.sortOrder + next.sortOrder) / 2, renumbered: [] };
  }

  const renumbered: TSiblingOrder[] = [];
  siblings.forEach((sibling, position) => {
    const sortOrder = (position + (position >= index ? 2 : 1)) * PAGE_SORT_ORDER_STEP;
    if (sortOrder !== sibling.sortOrder) renumbered.push({ id: sibling.id, sortOrder });
  });
  return { sortOrder: (index + 1) * PAGE_SORT_ORDER_STEP, renumbered };
};
