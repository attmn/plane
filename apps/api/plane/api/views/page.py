# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import json

from django.core.serializers.json import DjangoJSONEncoder
from django.db.models import Q
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from plane.api.serializers import PageAPIDetailSerializer, PageAPISerializer
from plane.app.permissions import ProjectPagePermission
from plane.app.serializers import PageDetailSerializer, PageSerializer
from plane.bgtasks.page_transaction_task import page_transaction
from plane.bgtasks.page_version_task import track_page_version
from plane.db.models import Page, Project, ProjectMember
from plane.utils.content_validator import validate_html_content

from .base import BaseAPIView

GUEST_ROLE = 5
EMPTY_DESCRIPTION_HTML = "<p></p>"


def clean_description_html(html):
    if not isinstance(html, str):
        raise ValidationError({"description_html": "Must be a string."})
    is_valid, error, clean_html = validate_html_content(html)
    if not is_valid:
        raise ValidationError({"description_html": error})
    return clean_html or EMPTY_DESCRIPTION_HTML


class ProjectPageBaseEndpoint(BaseAPIView):
    model = Page
    permission_classes = [ProjectPagePermission]

    def get_queryset(self):
        slug = self.kwargs.get("slug")
        project_id = self.kwargs.get("project_id")
        user = self.request.user

        queryset = (
            Page.objects.filter(
                workspace__slug=slug,
                project_pages__project_id=project_id,
                project_pages__deleted_at__isnull=True,
                project_pages__project__archived_at__isnull=True,
            )
            .filter(Q(owned_by=user) | Q(access=Page.PUBLIC_ACCESS))
            .select_related("workspace", "owned_by")
        )

        is_restricted_guest = (
            ProjectMember.objects.filter(
                workspace__slug=slug, project_id=project_id, member=user, role=GUEST_ROLE, is_active=True
            ).exists()
            and not Project.objects.get(pk=project_id).guest_view_all_features
        )
        return queryset.filter(owned_by=user) if is_restricted_guest else queryset


class ProjectPageListCreateAPIEndpoint(ProjectPageBaseEndpoint):
    serializer_class = PageAPISerializer

    def get(self, request, slug, project_id):
        return self.paginate(
            request=request,
            queryset=self.get_queryset(),
            on_results=lambda pages: PageAPISerializer(pages, many=True).data,
        )

    def post(self, request, slug, project_id):
        payload = {key: request.data[key] for key in ("name", "access", "color", "is_locked") if key in request.data}
        if request.data.get("parent_id"):
            payload["parent"] = request.data["parent_id"]

        description_html = clean_description_html(request.data.get("description_html", EMPTY_DESCRIPTION_HTML))
        serializer = PageSerializer(
            data=payload,
            context={
                "project_id": project_id,
                "owned_by_id": request.user.id,
                "request": request,
                "description_json": {},
                "description_binary": None,
                "description_html": description_html,
            },
        )
        serializer.is_valid(raise_exception=True)
        page = serializer.save()

        page_transaction.delay(
            new_description_html=description_html,
            old_description_html=None,
            page_id=str(page.id),
        )
        return Response(PageAPIDetailSerializer(page).data, status=status.HTTP_201_CREATED)


class ProjectPageDetailAPIEndpoint(ProjectPageBaseEndpoint):
    serializer_class = PageAPIDetailSerializer

    def get(self, request, slug, project_id, page_id):
        return Response(PageAPIDetailSerializer(self.get_queryset().get(pk=page_id)).data)

    def patch(self, request, slug, project_id, page_id):
        page = self.get_queryset().get(pk=page_id)
        if page.is_locked or page.archived_at:
            return Response({"error": "A locked or archived page cannot be updated."}, status=status.HTTP_400_BAD_REQUEST)

        payload = {key: request.data[key] for key in ("name", "access", "color") if key in request.data}
        if payload.get("access", page.access) != page.access and page.owned_by_id != request.user.id:
            return Response(
                {"error": "Only the page owner can change its access."}, status=status.HTTP_400_BAD_REQUEST
            )

        old_description_html = page.description_html
        save_kwargs = {}
        if "description_html" in request.data:
            payload["description_html"] = clean_description_html(request.data["description_html"])
            # The editor loads the stored document first and rebuilds it from the HTML only when it
            # is empty, so keeping it would leave the old text on screen. Someone with the page open
            # at this moment still holds the old document, and their next edit saves over this one.
            save_kwargs["description_binary"] = None

        serializer = PageDetailSerializer(
            page, data=payload, partial=True, context={"project_id": project_id, "request": request}
        )
        serializer.is_valid(raise_exception=True)
        page = serializer.save(**save_kwargs)

        if "description_html" in payload:
            page_transaction.delay(
                new_description_html=payload["description_html"],
                old_description_html=old_description_html,
                page_id=str(page.id),
            )
            track_page_version.delay(
                page_id=str(page.id),
                existing_instance=json.dumps({"description_html": old_description_html}, cls=DjangoJSONEncoder),
                user_id=str(request.user.id),
            )
        return Response(PageAPIDetailSerializer(page).data)

    def put(self, request, slug, project_id, page_id):
        return self.patch(request, slug, project_id, page_id)
