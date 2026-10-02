# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest
from rest_framework import status

from plane.db.models import FileAsset, Page, PageComment, Project, ProjectMember, ProjectPage, User


def move_url(slug, project_id, page_id):
    return f"/api/workspaces/{slug}/projects/{project_id}/pages/{page_id}/move/"


def make_project(workspace, user, identifier, role=20):
    project = Project.objects.create(workspace=workspace, name=identifier, identifier=identifier)
    if role is not None:
        ProjectMember.objects.create(workspace=workspace, project=project, member=user, role=role)
    return project


def make_page(workspace, project, user, name, parent=None):
    page = Page.objects.create(workspace=workspace, owned_by=user, name=name, parent=parent)
    ProjectPage.objects.create(workspace=workspace, project=project, page=page)
    return page


@pytest.mark.contract
@pytest.mark.django_db
class TestPageMove:
    def test_moves_entire_tree_and_reparents_root(self, session_client, workspace, create_user):
        source = make_project(workspace, create_user, "SRC")
        target = make_project(workspace, create_user, "DST", role=15)
        old_parent = make_page(workspace, source, create_user, "Old parent")
        new_parent = make_page(workspace, target, create_user, "New parent")
        root = make_page(workspace, source, create_user, "Root", parent=old_parent)
        child = make_page(workspace, source, create_user, "Child", parent=root)
        grandchild = make_page(workspace, source, create_user, "Grandchild", parent=child)
        comment = PageComment.objects.create(
            project=source, page=child, actor=create_user, comment_html="<p>Keep this discussion</p>"
        )

        response = session_client.post(
            move_url(workspace.slug, source.id, root.id),
            {"new_project_id": str(target.id), "parent_id": str(new_parent.id)},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert set(response.json()["moved_page_ids"]) == {str(root.id), str(child.id), str(grandchild.id)}
        root.refresh_from_db()
        child.refresh_from_db()
        grandchild.refresh_from_db()
        assert root.parent_id == new_parent.id
        assert child.parent_id == root.id
        assert grandchild.parent_id == child.id
        comment.refresh_from_db()
        assert comment.project_id == target.id
        for page in (root, child, grandchild):
            assert page.moved_to_project == target.id
            assert ProjectPage.objects.filter(page=page, project=target, deleted_at__isnull=True).exists()
            assert not ProjectPage.objects.filter(page=page, project=source, deleted_at__isnull=True).exists()

        location = session_client.get(f"/api/workspaces/{workspace.slug}/pages/{child.id}/location/")
        assert location.status_code == status.HTTP_200_OK
        assert location.json()["project_id"] == str(target.id)

    def test_rejects_destination_without_membership(self, session_client, workspace, create_user):
        source = make_project(workspace, create_user, "SRC")
        target = make_project(workspace, create_user, "DST", role=None)
        root = make_page(workspace, source, create_user, "Root")

        response = session_client.post(
            move_url(workspace.slug, source.id, root.id), {"new_project_id": str(target.id)}, format="json"
        )

        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert ProjectPage.objects.filter(page=root, project=source, deleted_at__isnull=True).exists()

    def test_rejects_parent_cycle(self, session_client, workspace, create_user):
        project = make_project(workspace, create_user, "SRC")
        root = make_page(workspace, project, create_user, "Root")
        child = make_page(workspace, project, create_user, "Child", parent=root)

        response = session_client.post(
            move_url(workspace.slug, project.id, root.id),
            {"new_project_id": str(project.id), "parent_id": str(child.id)},
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        root.refresh_from_db()
        assert root.parent_id is None

    def test_rejects_locked_descendant(self, session_client, workspace, create_user):
        source = make_project(workspace, create_user, "SRC")
        target = make_project(workspace, create_user, "DST")
        root = make_page(workspace, source, create_user, "Root")
        child = make_page(workspace, source, create_user, "Child", parent=root)
        child.is_locked = True
        child.save(update_fields=["is_locked"])

        response = session_client.post(
            move_url(workspace.slug, source.id, root.id), {"new_project_id": str(target.id)}, format="json"
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert ProjectPage.objects.filter(page=child, project=source, deleted_at__isnull=True).exists()

    def test_page_images_follow_destination_access(self, api_client, mocker, workspace, create_user):
        source = make_project(workspace, create_user, "SRC")
        target = make_project(workspace, create_user, "DST")
        page = make_page(workspace, source, create_user, "Root")
        asset = FileAsset.objects.create(
            workspace=workspace,
            project=source,
            page=page,
            asset="test/page-image.png",
            entity_type=FileAsset.EntityTypeContext.PAGE_DESCRIPTION,
            is_uploaded=True,
        )
        old_member = User.objects.create(email="old-member@plane.so", username="old-member")
        new_member = User.objects.create(email="new-member@plane.so", username="new-member")
        ProjectMember.objects.create(workspace=workspace, project=source, member=old_member, role=15)
        ProjectMember.objects.create(workspace=workspace, project=target, member=new_member, role=15)

        api_client.force_authenticate(user=create_user)
        move = api_client.post(
            move_url(workspace.slug, source.id, page.id), {"new_project_id": str(target.id)}, format="json"
        )
        assert move.status_code == status.HTTP_200_OK

        storage = mocker.patch("plane.app.views.asset.v2.S3Storage")
        storage.return_value.generate_presigned_url.return_value = "https://example.com/page-image.png"
        old_asset_url = f"/api/assets/v2/workspaces/{workspace.slug}/projects/{source.id}/{asset.id}/"
        new_asset_url = f"/api/assets/v2/workspaces/{workspace.slug}/projects/{target.id}/{asset.id}/"
        new_download_url = f"/api/assets/v2/workspaces/{workspace.slug}/projects/{target.id}/download/{asset.id}/"

        api_client.force_authenticate(user=new_member)
        assert api_client.get(new_asset_url).status_code == status.HTTP_302_FOUND
        assert api_client.get(new_download_url).status_code == status.HTTP_302_FOUND

        api_client.force_authenticate(user=old_member)
        assert api_client.get(old_asset_url).status_code == status.HTTP_403_FORBIDDEN
