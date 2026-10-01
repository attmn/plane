/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
// constants
import type { EPageAccess } from "@plane/constants";
import type { TPage } from "@plane/types";
// ui
import { Dialog, DialogContent } from "@makeplane/propel/components/dialog";
// hooks
import { useAppRouter } from "@/hooks/use-app-router";
// plane web hooks
import type { EPageStoreType } from "@/hooks/store";
import { usePageStore } from "@/hooks/store";
// local imports
import { PageTemplateSelect } from "../dropdowns/new-page-menu";
import { PageForm } from "./page-form";

type Props = {
  workspaceSlug: string;
  projectId: string;
  isModalOpen: boolean;
  pageAccess?: EPageAccess;
  handleModalClose: () => void;
  redirectionEnabled?: boolean;
  storeType: EPageStoreType;
  parentPageId?: string;
  onCreated?: (page: Partial<TPage>) => void;
};

export function CreatePageModal(props: Props) {
  const {
    workspaceSlug,
    projectId,
    isModalOpen,
    pageAccess,
    handleModalClose,
    redirectionEnabled = false,
    storeType,
    parentPageId,
    onCreated,
  } = props;
  // states
  const [pageFormData, setPageFormData] = useState<Partial<TPage>>({
    id: undefined,
    name: "",
    logo_props: undefined,
  });
  // router
  const router = useAppRouter();
  // store hooks
  const { createPage, createPageFromTemplate } = usePageStore(storeType);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const handlePageFormData = <T extends keyof TPage>(key: T, value: TPage[T]) =>
    setPageFormData((prev) => ({ ...prev, [key]: value }));

  // update page access in form data when page access from the store changes
  useEffect(() => {
    setPageFormData((prev) => ({ ...prev, access: pageAccess }));
  }, [pageAccess]);

  const handleStateClear = () => {
    setPageFormData({ id: undefined, name: "", access: pageAccess });
    setTemplateId(null);
    handleModalClose();
  };

  const handleFormSubmit = async () => {
    if (!workspaceSlug || !projectId) return;

    try {
      const pageData = templateId
        ? await createPageFromTemplate(
            templateId,
            {
              name: pageFormData.name,
              parent: parentPageId ?? null,
              access: pageFormData.access,
              logo_props: pageFormData.logo_props,
            },
            projectId
          )
        : await createPage({ ...pageFormData, parent: parentPageId });
      if (pageData) {
        onCreated?.(pageData);
        handleStateClear();
        if (redirectionEnabled) router.push(`/${workspaceSlug}/projects/${projectId}/pages/${pageData.id}`);
      }
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <Dialog
      open={isModalOpen}
      onOpenChange={(open) => {
        if (!open) handleStateClear();
      }}
    >
      <DialogContent size="md">
        <PageForm
          formData={pageFormData}
          handleFormData={handlePageFormData}
          handleModalClose={handleStateClear}
          handleFormSubmit={handleFormSubmit}
          extraField={<PageTemplateSelect projectId={projectId} value={templateId} onChange={setTemplateId} />}
        />
      </DialogContent>
    </Dialog>
  );
}
