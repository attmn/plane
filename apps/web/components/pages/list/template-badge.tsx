/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Badge } from "@makeplane/propel/components/badge";

/**
 * Marks a page offered as a template, in the Pages list and the sidebar page tree.
 */
export function PageTemplateBadge() {
  return <Badge variant="neutral" size="xs" label="Template" />;
}
