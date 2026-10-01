# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Contract tests for page comments: threads, replies, edits, deletes, resolve and access rules."""

import uuid

import pytest
from rest_framework import status

from plane.db.models import Page, PageComment, Project, ProjectMember, ProjectPage, User


def _comments_url(slug, project_id, page_id, comment_id=None, resolve=False):
    url = f"/api/workspaces/{slug}/projects/{project_id}/pages/{page_id}/comments/"
    if comment_id:
        url = f"{url}{comment_id}/"
    if resolve:
        url = f"{url}resolve/"
    return url


def _make_page(workspace, project, owner, access=Page.PUBLIC_ACCESS):
    page = Page.objects.create(workspace=workspace, owned_by=owner, access=access, name="Wiki")
    ProjectPage.objects.create(workspace=workspace, project=project, page=page)
    return page


def _other_user(workspace, project, role):
    user = User.objects.create(email=f"{uuid.uuid4().hex[:8]}@plane.so", username=uuid.uuid4().hex[:12])
    ProjectMember.objects.create(workspace=workspace, project=project, member=user, role=role)
    return user


@pytest.mark.contract
class TestPageComments:
    def _setup(self, workspace, user, role=15):
        project = Project.objects.create(name="Docs", identifier="DOCS", workspace=workspace)
        ProjectMember.objects.create(workspace=workspace, project=project, member=user, role=role)
        return project

    @pytest.mark.django_db
    def test_thread_reply_resolve_and_list(self, session_client, workspace, create_user):
        project = self._setup(workspace, create_user)
        page = _make_page(workspace, project, create_user)
        url = _comments_url(workspace.slug, project.id, page.id)

        thread = session_client.post(url, {"comment_html": "<p>Is this right?</p>", "anchor_id": "a1"}, format="json")
        assert thread.status_code == status.HTTP_201_CREATED
        assert thread.json()["anchor_id"] == "a1"
        thread_id = thread.json()["id"]

        reply = session_client.post(
            url, {"comment_html": "<p>Yes</p>", "parent": thread_id, "anchor_id": "ignored"}, format="json"
        )
        assert reply.status_code == status.HTTP_201_CREATED
        assert reply.json()["anchor_id"] is None
        assert reply.json()["parent"] == thread_id

        resolved = session_client.post(_comments_url(workspace.slug, project.id, page.id, thread_id, resolve=True))
        assert resolved.status_code == status.HTTP_200_OK
        assert resolved.json()["resolved_at"] is not None

        reopened = session_client.delete(_comments_url(workspace.slug, project.id, page.id, thread_id, resolve=True))
        assert reopened.status_code == status.HTTP_200_OK
        assert reopened.json()["resolved_at"] is None

        listed = session_client.get(url)
        assert listed.status_code == status.HTTP_200_OK
        assert [c["id"] for c in listed.json()] == [thread_id, reply.json()["id"]]

    @pytest.mark.django_db
    def test_reply_to_a_reply_is_rejected(self, session_client, workspace, create_user):
        project = self._setup(workspace, create_user)
        page = _make_page(workspace, project, create_user)
        url = _comments_url(workspace.slug, project.id, page.id)
        thread = session_client.post(url, {"comment_html": "<p>A</p>"}, format="json").json()
        reply = session_client.post(url, {"comment_html": "<p>B</p>", "parent": thread["id"]}, format="json").json()

        nested = session_client.post(url, {"comment_html": "<p>C</p>", "parent": reply["id"]}, format="json")
        assert nested.status_code == status.HTTP_400_BAD_REQUEST

    @pytest.mark.django_db
    def test_deleting_a_thread_hides_its_replies(self, session_client, workspace, create_user, mocker):
        mocker.patch("plane.db.mixins.soft_delete_related_objects.delay")
        project = self._setup(workspace, create_user)
        page = _make_page(workspace, project, create_user)
        url = _comments_url(workspace.slug, project.id, page.id)
        thread = session_client.post(url, {"comment_html": "<p>A</p>"}, format="json").json()
        session_client.post(url, {"comment_html": "<p>B</p>", "parent": thread["id"]}, format="json")

        assert (
            session_client.delete(_comments_url(workspace.slug, project.id, page.id, thread["id"])).status_code == 204
        )
        assert session_client.get(url).json() == []

    @pytest.mark.django_db
    def test_empty_comment_is_rejected(self, session_client, workspace, create_user):
        project = self._setup(workspace, create_user)
        page = _make_page(workspace, project, create_user)
        response = session_client.post(
            _comments_url(workspace.slug, project.id, page.id), {"comment_html": "  "}, format="json"
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @pytest.mark.django_db
    def test_only_author_edits_and_member_cannot_delete_others(self, session_client, workspace, create_user):
        project = self._setup(workspace, create_user)
        other = _other_user(workspace, project, role=15)
        page = _make_page(workspace, project, other)
        comment = PageComment.objects.create(page=page, project=project, actor=other, comment_html="<p>Theirs</p>")
        detail = _comments_url(workspace.slug, project.id, page.id, comment.id)

        assert session_client.patch(detail, {"comment_html": "<p>Mine now</p>"}, format="json").status_code == 403
        assert session_client.delete(detail).status_code == 403

    @pytest.mark.django_db
    def test_author_edits_and_deletes_own_comment(self, session_client, workspace, create_user, mocker):
        mocker.patch("plane.db.mixins.soft_delete_related_objects.delay")
        project = self._setup(workspace, create_user)
        page = _make_page(workspace, project, create_user)
        url = _comments_url(workspace.slug, project.id, page.id)
        comment = session_client.post(url, {"comment_html": "<p>Draft</p>"}, format="json").json()
        detail = _comments_url(workspace.slug, project.id, page.id, comment["id"])

        edited = session_client.patch(detail, {"comment_html": "<p>Final</p>"}, format="json")
        assert edited.status_code == status.HTTP_200_OK
        assert edited.json()["comment_stripped"] == "Final"
        assert edited.json()["edited_at"] is not None

        assert session_client.delete(detail).status_code == status.HTTP_204_NO_CONTENT
        assert session_client.get(url).json() == []

    @pytest.mark.django_db
    def test_admin_deletes_others_comment(self, session_client, workspace, create_user, mocker):
        mocker.patch("plane.db.mixins.soft_delete_related_objects.delay")
        project = self._setup(workspace, create_user, role=20)
        other = _other_user(workspace, project, role=15)
        page = _make_page(workspace, project, other)
        comment = PageComment.objects.create(page=page, project=project, actor=other, comment_html="<p>Spam</p>")

        response = session_client.delete(_comments_url(workspace.slug, project.id, page.id, comment.id))
        assert response.status_code == status.HTTP_204_NO_CONTENT

    @pytest.mark.django_db
    def test_guest_reads_but_cannot_comment(self, session_client, workspace, create_user):
        project = self._setup(workspace, create_user, role=5)
        owner = _other_user(workspace, project, role=20)
        page = _make_page(workspace, project, owner)
        PageComment.objects.create(page=page, project=project, actor=owner, comment_html="<p>Hi</p>")
        url = _comments_url(workspace.slug, project.id, page.id)

        assert session_client.get(url).status_code == status.HTTP_200_OK
        assert session_client.post(url, {"comment_html": "<p>No</p>"}, format="json").status_code == 403

    @pytest.mark.django_db
    def test_someone_elses_private_page_is_denied(self, session_client, workspace, create_user):
        project = self._setup(workspace, create_user)
        owner = _other_user(workspace, project, role=20)
        page = _make_page(workspace, project, owner, access=Page.PRIVATE_ACCESS)

        response = session_client.get(_comments_url(workspace.slug, project.id, page.id))
        assert response.status_code == status.HTTP_403_FORBIDDEN

    @pytest.mark.django_db
    def test_other_project_page_is_denied(self, session_client, workspace, create_user):
        project = self._setup(workspace, create_user)
        other_project = Project.objects.create(name="Other", identifier="OTHR", workspace=workspace)
        owner = _other_user(workspace, other_project, role=20)
        page = _make_page(workspace, other_project, owner)

        response = session_client.get(_comments_url(workspace.slug, project.id, page.id))
        assert response.status_code == status.HTTP_403_FORBIDDEN
