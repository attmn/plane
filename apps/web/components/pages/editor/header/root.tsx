/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { ReactionOutline } from "@makeplane/propel/icons";
import { Button } from "@makeplane/propel/components/button";
// plane imports
import { EmojiPicker } from "@plane/blocks/emoji-icon-picker";
import { cn } from "@plane/utils";
import { EPageStoreType, usePageStore } from "@/hooks/store";
import { useAppRouter } from "@/hooks/use-app-router";
// store
import type { TPageInstance } from "@/store/pages/base-page";
// local imports
import { PageEditorHeaderLogoPicker } from "./logo-picker";

type Props = {
  page: TPageInstance;
  projectId?: string;
};

export const PageEditorHeaderRoot = observer(function PageEditorHeaderRoot(props: Props) {
  const { page, projectId } = props;
  // states
  const [isLogoPickerOpen, setIsLogoPickerOpen] = useState(false);
  const [isCreatingChild, setIsCreatingChild] = useState(false);
  const { createPage } = usePageStore(EPageStoreType.PROJECT);
  const router = useAppRouter();
  // derived values
  const { id, isContentEditable, logo_props, name, updatePageLogo } = page;
  const isLogoSelected = !!logo_props?.in_use;
  const isTitleEmpty = !name || name.trim() === "";

  return (
    <>
      {projectId && isContentEditable && id && (
        <div className="flex items-center justify-end gap-3 text-13">
          <Button
            variant="secondary"
            size="sm"
            stretch="auto"
            label="New subpage"
            loading={isCreatingChild}
            onClick={async () => {
              setIsCreatingChild(true);
              try {
                const child = await createPage({ name: "Untitled", parent: id, access: page.access });
                if (child?.id) router.push(`${page.getRedirectionLink().replace(/\/[^/]+$/, "")}/${child.id}`);
              } finally {
                setIsCreatingChild(false);
              }
            }}
          />
        </div>
      )}
      <div className="flex h-[48px] items-end text-left">
        {!isLogoSelected && (
          <div
            className={cn("opacity-0 transition-all duration-200 group-hover/page-header:opacity-100", {
              "opacity-100": isTitleEmpty,
            })}
          >
            <EmojiPicker
              isOpen={isLogoPickerOpen}
              handleToggle={(val) => setIsLogoPickerOpen(val)}
              className="flex items-center justify-center"
              buttonClassName="flex items-center justify-center"
              label={
                <button
                  type="button"
                  className={cn(
                    "flex items-center gap-1 rounded-sm p-1 text-13 font-medium text-tertiary transition-colors outline-none hover:bg-layer-1",
                    {
                      "bg-layer-1": isLogoPickerOpen,
                    }
                  )}
                >
                  <ReactionOutline className="size-4 flex-shrink-0" />
                  Icon
                </button>
              }
              onChange={updatePageLogo}
              defaultIconColor={
                logo_props?.in_use && logo_props.in_use === "icon" ? logo_props?.icon?.color : undefined
              }
              defaultOpen={logo_props?.in_use && logo_props?.in_use === "emoji" ? "emoji" : "icon"}
              disabled={!isContentEditable}
            />
          </div>
        )}
      </div>
      <PageEditorHeaderLogoPicker className="mt-2 flex w-full flex-shrink-0" page={page} />
    </>
  );
});
