/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useState } from "react";
import { sortBy } from "lodash-es";
import { observer } from "mobx-react";
import { Button } from "@makeplane/propel/components/button";
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogHeading,
  DialogMain,
  DialogTitle,
} from "@makeplane/propel/components/dialog";
import { Select } from "@plane/blocks/select";
import { setToast } from "@plane/blocks/toast";
import { getPageName } from "@plane/utils";
import { ProjectSelect } from "@/components/dropdowns/project/project-select";
import { EPageStoreType, usePageStore } from "@/hooks/store";
import { useUser } from "@/hooks/store/user/user-user";
import { useAppRouter } from "@/hooks/use-app-router";
import type { TPageInstance } from "@/store/pages/base-page";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  page: TPageInstance;
  projectId: string;
  workspaceSlug: string;
};

type ParentOption = { id: string; label: string };

export const MovePageModal = observer(function MovePageModal({
  isOpen,
  onClose,
  page,
  projectId,
  workspaceSlug,
}: Props) {
  const [targetProjectId, setTargetProjectId] = useState(projectId);
  const [parentId, setParentId] = useState<string | null>(null);
  const [isMoving, setIsMoving] = useState(false);
  const { projectsWithCreatePermissions } = useUser();
  const { fetchPagesList, getCurrentProjectPageIds, getPageById, movePage } = usePageStore(EPageStoreType.PROJECT);
  const router = useAppRouter();

  useEffect(() => {
    if (!isOpen) return;
    setTargetProjectId(projectId);
    setParentId(null);
  }, [isOpen, projectId]);

  useEffect(() => {
    if (isOpen && targetProjectId) {
      void fetchPagesList(workspaceSlug, targetProjectId).catch(() => {
        setToast({ type: "error", title: "Could not load pages", message: "Please try another project." });
      });
    }
  }, [isOpen, targetProjectId, workspaceSlug, fetchPagesList]);

  const parentOptions = useMemo(() => {
    const options: ParentOption[] = [{ id: "", label: "Top level" }];
    for (const id of getCurrentProjectPageIds(targetProjectId)) {
      const candidate = getPageById(id);
      if (!candidate?.id || candidate.archived_at || candidate.is_locked) continue;
      if (candidate.access === 1 && !candidate.isCurrentUserOwner) continue;
      if (targetProjectId === projectId) {
        const seen = new Set<string>();
        let ancestor: string | null | undefined = candidate.id;
        while (ancestor && !seen.has(ancestor)) {
          if (ancestor === page.id) break;
          seen.add(ancestor);
          ancestor = getPageById(ancestor)?.parent;
        }
        if (ancestor === page.id) continue;
      }
      options.push({ id: candidate.id, label: getPageName(candidate.name) });
    }
    return [options[0], ...sortBy(options.slice(1), (option) => option.label.toLocaleLowerCase())];
  }, [getCurrentProjectPageIds, getPageById, targetProjectId, projectId, page.id]);

  const handleMove = async () => {
    if (!page.id || !targetProjectId) return;
    setIsMoving(true);
    try {
      await movePage(workspaceSlug, projectId, page.id, targetProjectId, parentId);
      onClose();
      setToast({ type: "success", title: "Page moved", message: "The page and its subpages were moved." });
      router.push(`/${workspaceSlug}/projects/${targetProjectId}/pages/${page.id}`);
    } catch (error) {
      const message =
        error && typeof error === "object" && "error" in error ? String(error.error) : "Please try again.";
      setToast({ type: "error", title: "Could not move page", message });
    } finally {
      setIsMoving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="md">
        <DialogMain>
          <DialogHeader>
            <DialogHeading>
              <DialogTitle>Move page</DialogTitle>
            </DialogHeading>
          </DialogHeader>
          <DialogBody>
            <div className="space-y-4">
              <p className="text-13 text-secondary">Move {getPageName(page.name)} and all its subpages.</p>
              <div className="space-y-2">
                <p className="block text-13 font-medium text-primary">Project</p>
                <ProjectSelect
                  value={targetProjectId}
                  onChange={(id) => {
                    if (id) {
                      setTargetProjectId(id);
                      setParentId(null);
                    }
                  }}
                  variant="pill-md"
                  filterOption={(id) => !!projectsWithCreatePermissions?.[id]}
                />
              </div>
              <div className="space-y-2">
                <p className="block text-13 font-medium text-primary">Place under</p>
                <Select<ParentOption>
                  getValues={() => parentOptions}
                  value={parentOptions.find((option) => option.id === (parentId ?? "")) ?? parentOptions[0]}
                  onChange={(id) => setParentId(id || null)}
                  getOptionValue={(option) => option.id}
                  getOptionLabel={(option) => option.label}
                  placeholder="Top level"
                  pinSelected={false}
                >
                  <Select.Trigger variant="select-md" className="w-full">
                    <Select.Value />
                  </Select.Trigger>
                </Select>
              </div>
            </div>
          </DialogBody>
        </DialogMain>
        <DialogActions>
          <Button variant="secondary" size="md" stretch="auto" label="Cancel" onClick={onClose} />
          <Button
            variant="primary"
            size="md"
            stretch="auto"
            label={isMoving ? "Moving" : "Move page"}
            onClick={handleMove}
            loading={isMoving}
            disabled={!targetProjectId || (targetProjectId === projectId && parentId === (page.parent ?? null))}
          />
        </DialogActions>
      </DialogContent>
    </Dialog>
  );
});
