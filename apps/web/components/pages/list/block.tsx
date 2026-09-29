/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useRef } from "react";
import { observer } from "mobx-react";
import { Logo } from "@plane/blocks/emoji-icon-picker";
import { ChevronDownOutline, ChevronRightOutline, PagesOutline } from "@makeplane/propel/icons";
// plane imports
import { getPageName } from "@plane/utils";
// components
import { ListItem } from "@/components/core/list";
import { BlockItemAction } from "@/components/pages/list/block-item-action";
// hooks
import { usePlatformOS } from "@/hooks/use-platform-os";
// plane web hooks
import type { EPageStoreType } from "@/hooks/store";
import { usePage } from "@/hooks/store";

type TPageListBlock = {
  pageId: string;
  storeType: EPageStoreType;
  depth?: number;
  hasChildren?: boolean;
  isExpanded?: boolean;
  onToggle?: () => void;
};

export const PageListBlock = observer(function PageListBlock(props: TPageListBlock) {
  const { pageId, storeType, depth = 0, hasChildren = false, isExpanded = false, onToggle } = props;
  // refs
  const parentRef = useRef(null);
  // hooks
  const page = usePage({
    pageId,
    storeType,
  });
  const { isMobile } = usePlatformOS();
  // handle page check
  if (!page) return null;
  // derived values
  const { name, logo_props, getRedirectionLink } = page;

  return (
    <div style={{ paddingLeft: `${depth * 16}px` }}>
      <ListItem
        leadingActionElement={
          hasChildren ? (
            <button
              type="button"
              className="grid size-5 flex-shrink-0 place-items-center rounded-sm text-tertiary hover:bg-layer-1"
              aria-label={`${isExpanded ? "Collapse" : "Expand"} ${getPageName(name)}`}
              aria-expanded={isExpanded}
              onClick={onToggle}
            >
              {isExpanded ? <ChevronDownOutline className="size-4" /> : <ChevronRightOutline className="size-4" />}
            </button>
          ) : (
            <span className="size-5 flex-shrink-0" aria-hidden="true" />
          )
        }
        prependTitleElement={
          <>
            {logo_props?.in_use ? (
              <Logo logo={logo_props} size={16} type="lucide" />
            ) : (
              <PagesOutline className="h-4 w-4 text-tertiary" />
            )}
          </>
        }
        title={getPageName(name)}
        itemLink={getRedirectionLink()}
        actionableItems={<BlockItemAction page={page} parentRef={parentRef} storeType={storeType} />}
        isMobile={isMobile}
        parentRef={parentRef}
      />
    </div>
  );
});
