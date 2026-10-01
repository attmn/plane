/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane types
import { API_BASE_URL } from "@plane/constants";
import type { TPageComment } from "@plane/types";
// services
import { APIService } from "@/services/api.service";

export type TCreatePageCommentPayload = Pick<TPageComment, "comment_html"> &
  Partial<Pick<TPageComment, "parent" | "anchor_id">>;

export class ProjectPageCommentService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  private url(workspaceSlug: string, projectId: string, pageId: string, commentId?: string) {
    const base = `/api/workspaces/${workspaceSlug}/projects/${projectId}/pages/${pageId}/comments/`;
    return commentId ? `${base}${commentId}/` : base;
  }

  async list(workspaceSlug: string, projectId: string, pageId: string): Promise<TPageComment[]> {
    return this.get(this.url(workspaceSlug, projectId, pageId))
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async create(
    workspaceSlug: string,
    projectId: string,
    pageId: string,
    data: TCreatePageCommentPayload
  ): Promise<TPageComment> {
    return this.post(this.url(workspaceSlug, projectId, pageId), data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async update(
    workspaceSlug: string,
    projectId: string,
    pageId: string,
    commentId: string,
    data: Pick<TPageComment, "comment_html">
  ): Promise<TPageComment> {
    return this.patch(this.url(workspaceSlug, projectId, pageId, commentId), data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async remove(workspaceSlug: string, projectId: string, pageId: string, commentId: string): Promise<void> {
    return this.delete(this.url(workspaceSlug, projectId, pageId, commentId))
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async resolve(workspaceSlug: string, projectId: string, pageId: string, threadId: string): Promise<TPageComment> {
    return this.post(`${this.url(workspaceSlug, projectId, pageId, threadId)}resolve/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async reopen(workspaceSlug: string, projectId: string, pageId: string, threadId: string): Promise<TPageComment> {
    return this.delete(`${this.url(workspaceSlug, projectId, pageId, threadId)}resolve/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
