/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { getAttributes } from "@tiptap/core";
import type { MarkType } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { normalizePlaneLinkHref } from "./normalize-plane-link";

type ClickHandlerOptions = {
  type: MarkType;
};

export function clickHandler(options: ClickHandlerOptions): Plugin {
  return new Plugin({
    key: new PluginKey("handleClickLink"),
    props: {
      handleClick: (view, pos, event) => {
        if (event.button !== 0) {
          return false;
        }

        const link = (event.target as Element).closest("a[href]") as HTMLAnchorElement | null;
        if (!link || !view.dom.contains(link)) return false;
        const attrs = getAttributes(view.state, options.type.name);
        const href = normalizePlaneLinkHref(link.href || attrs.href);
        const target = link.target || attrs.target;

        if (link && href) {
          // Defence-in-depth: link.href is the browser-resolved URL (whitespace
          // already stripped by the browser's WHATWG URL parser), so a protocol
          // check here is sufficient to catch any dangerous URI that slipped past
          // the editor's parse/render-time guards. Matches the blocked-scheme list
          // in isValidHttpUrl (javascript:, data:, vbscript:, file:, about:)
          // to keep the policy consistent (GHSA-v2vv-7wq3-8w2j).
          if (/^(javascript|data|vbscript|file|about):/i.test(href)) {
            return false;
          }

          event.preventDefault();
          if (target === "_self" || new URL(href, window.location.href).origin === window.location.origin) {
            window.location.assign(href);
          } else {
            window.open(href, target);
          }

          return true;
        }

        return false;
      },
    },
  });
}
