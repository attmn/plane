# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.db.models import Q
from django.utils import timezone

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.app.permissions import ProjectPageCommentPermission, ROLE
from plane.app.serializers import PageCommentSerializer
from plane.db.models import Page, PageComment, ProjectMember
from ..base import BaseAPIView


class PageCommentEndpoint(BaseAPIView):
    """
    Comments on a project page. Threads are root comments (no parent); replies point at their root.
    Inline threads carry the anchor_id of the comment mark in the page content.
    """

    permission_classes = [ProjectPageCommentPermission]

    def get_page(self, slug, project_id, page_id):
        return Page.objects.filter(
            Q(owned_by=self.request.user) | Q(access=Page.PUBLIC_ACCESS),
            pk=page_id,
            workspace__slug=slug,
            projects__id=project_id,
            project_pages__deleted_at__isnull=True,
        ).first()

    def get(self, request, slug, project_id, page_id):
        page = self.get_page(slug, project_id, page_id)
        if page is None:
            return Response({"error": "Page not found"}, status=status.HTTP_404_NOT_FOUND)
        # replies of a deleted thread are soft-deleted by a background task; hide them meanwhile
        comments = (
            PageComment.objects.filter(page_id=page.id, project_id=project_id)
            .filter(Q(parent__isnull=True) | Q(parent__deleted_at__isnull=True))
            .order_by("created_at")
        )
        return Response(PageCommentSerializer(comments, many=True).data, status=status.HTTP_200_OK)

    def post(self, request, slug, project_id, page_id):
        page = self.get_page(slug, project_id, page_id)
        if page is None:
            return Response({"error": "Page not found"}, status=status.HTTP_404_NOT_FOUND)
        if page.archived_at:
            return Response({"error": "An archived page cannot be commented on"}, status=status.HTTP_400_BAD_REQUEST)

        parent_id = request.data.get("parent")
        anchor_id = request.data.get("anchor_id")
        if parent_id:
            parent = PageComment.objects.filter(
                pk=parent_id, page_id=page.id, project_id=project_id, parent__isnull=True
            ).first()
            if parent is None:
                return Response({"error": "Thread not found"}, status=status.HTTP_400_BAD_REQUEST)
            # replies belong to the thread, which holds the anchor
            anchor_id = None

        serializer = PageCommentSerializer(data={"comment_html": request.data.get("comment_html", "")})
        serializer.is_valid(raise_exception=True)
        if not serializer.validated_data.get("comment_html", "").strip():
            return Response({"error": "A comment cannot be empty"}, status=status.HTTP_400_BAD_REQUEST)
        serializer.save(
            page_id=page.id,
            project_id=project_id,
            parent_id=parent_id or None,
            anchor_id=anchor_id or None,
            actor=request.user,
        )
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class PageCommentDetailEndpoint(BaseAPIView):
    permission_classes = [ProjectPageCommentPermission]

    def get_comment(self, slug, project_id, page_id, comment_id):
        return PageComment.objects.filter(
            Q(page__owned_by=self.request.user) | Q(page__access=Page.PUBLIC_ACCESS),
            pk=comment_id,
            page_id=page_id,
            project_id=project_id,
            workspace__slug=slug,
        ).first()

    def patch(self, request, slug, project_id, page_id, comment_id):
        comment = self.get_comment(slug, project_id, page_id, comment_id)
        if comment is None:
            return Response({"error": "Comment not found"}, status=status.HTTP_404_NOT_FOUND)
        if comment.actor_id != request.user.id:
            return Response({"error": "Only the author can edit a comment"}, status=status.HTTP_403_FORBIDDEN)
        serializer = PageCommentSerializer(
            comment, data={"comment_html": request.data.get("comment_html", "")}, partial=True
        )
        serializer.is_valid(raise_exception=True)
        if not serializer.validated_data.get("comment_html", "").strip():
            return Response({"error": "A comment cannot be empty"}, status=status.HTTP_400_BAD_REQUEST)
        serializer.save(edited_at=timezone.now())
        return Response(serializer.data, status=status.HTTP_200_OK)

    def delete(self, request, slug, project_id, page_id, comment_id):
        comment = self.get_comment(slug, project_id, page_id, comment_id)
        if comment is None:
            return Response({"error": "Comment not found"}, status=status.HTTP_404_NOT_FOUND)
        is_admin = ProjectMember.objects.filter(
            project_id=project_id, member=request.user, is_active=True, role=ROLE.ADMIN.value
        ).exists()
        if comment.actor_id != request.user.id and not is_admin:
            return Response(
                {"error": "Only the author or a project admin can delete a comment"},
                status=status.HTTP_403_FORBIDDEN,
            )
        # deleting a thread's first comment deletes its replies too
        comment.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class PageCommentResolveEndpoint(BaseAPIView):
    permission_classes = [ProjectPageCommentPermission]

    def get_thread(self, slug, project_id, page_id, comment_id):
        return PageComment.objects.filter(
            Q(page__owned_by=self.request.user) | Q(page__access=Page.PUBLIC_ACCESS),
            pk=comment_id,
            page_id=page_id,
            project_id=project_id,
            workspace__slug=slug,
            parent__isnull=True,
        ).first()

    def post(self, request, slug, project_id, page_id, comment_id):
        thread = self.get_thread(slug, project_id, page_id, comment_id)
        if thread is None:
            return Response({"error": "Thread not found"}, status=status.HTTP_404_NOT_FOUND)
        thread.resolved_at = timezone.now()
        thread.resolved_by = request.user
        thread.save(update_fields=["resolved_at", "resolved_by", "updated_at", "updated_by"])
        return Response(PageCommentSerializer(thread).data, status=status.HTTP_200_OK)

    def delete(self, request, slug, project_id, page_id, comment_id):
        thread = self.get_thread(slug, project_id, page_id, comment_id)
        if thread is None:
            return Response({"error": "Thread not found"}, status=status.HTTP_404_NOT_FOUND)
        thread.resolved_at = None
        thread.resolved_by = None
        thread.save(update_fields=["resolved_at", "resolved_by", "updated_at", "updated_by"])
        return Response(PageCommentSerializer(thread).data, status=status.HTTP_200_OK)
