/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

const LEGACY_PLANE_HOST = "plane-proxy-production-6342.up.railway.app";

/** Keep links created before the custom domain on the domain currently serving Plane. */
export const normalizePlaneLinkHref = (href: string, currentOrigin = ""): string => {
  try {
    const url = new URL(href);
    if (url.hostname === LEGACY_PLANE_HOST && (url.protocol === "http:" || url.protocol === "https:")) {
      return `${currentOrigin}${url.pathname}${url.search}${url.hash}`;
    }
  } catch {
    // Relative links already resolve against the current Plane domain.
  }
  return href;
};
