/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { Editor } from "@tiptap/react";
import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
// components
import { LinkEditView, LinkPreview } from "@/components/links";
import { normalizePlaneLinkHref } from "@/extensions/custom-link/helpers/normalize-plane-link";

export type LinkViews = "LinkPreview" | "LinkEditView";

export type LinkViewProps = {
  view?: LinkViews;
  editor: Editor;
  from: number;
  to: number;
  url: string;
  text?: string;
  closeLinkView: () => void;
};

export function LinkView(props: LinkViewProps & { style: CSSProperties }) {
  const viewProps = {
    ...props,
    url: normalizePlaneLinkHref(props.url, typeof window === "undefined" ? "" : window.location.origin),
  };
  const [currentView, setCurrentView] = useState<LinkViews>(props.view ?? "LinkPreview");
  const [prevFrom, setPrevFrom] = useState(props.from);

  const switchView = (view: LinkViews) => {
    setCurrentView(view);
  };

  useEffect(() => {
    if (props.from !== prevFrom) {
      setCurrentView("LinkPreview");
      setPrevFrom(props.from);
    }
  }, [prevFrom, props.from]);

  return (
    <>
      {currentView === "LinkPreview" && <LinkPreview viewProps={viewProps} switchView={switchView} />}
      {currentView === "LinkEditView" && <LinkEditView viewProps={viewProps} switchView={switchView} />}
    </>
  );
}
