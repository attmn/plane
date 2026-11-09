# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest
from rest_framework import status

from plane.db.models import Page, Project, ProjectMember, ProjectPage, User


@pytest.fixture(autouse=True)
def page_transaction_delay(mocker):
    return mocker.patch("plane.api.views.page.page_transaction.delay")


@pytest.fixture(autouse=True)
def track_page_version_delay(mocker):
    return mocker.patch("plane.api.views.page.track_page_version.delay")


@pytest.fixture
def project(db, workspace, create_user):
    project = Project.objects.create(name="Pages", identifier="PG", workspace=workspace, created_by=create_user)
    ProjectMember.objects.create(project=project, member=create_user, role=20, is_active=True)
    return project


@pytest.fixture
def other_user(db):
    return User.objects.create(email="other@plane.so", username="other-user")


def make_page(project, owner, **kwargs):
    page = Page.objects.create(
        workspace=project.workspace, owned_by=owner, name=kwargs.pop("name", "A page"), **kwargs
    )
    ProjectPage.objects.create(workspace=project.workspace, project=project, page=page)
    return page


def list_url(workspace, project):
    return f"/api/v1/workspaces/{workspace.slug}/projects/{project.id}/pages/"


def detail_url(workspace, project, page):
    return f"{list_url(workspace, project)}{page.id}/"


@pytest.mark.contract
class TestProjectPageCreate:
    @pytest.mark.django_db
    def test_creates_a_page_linked_to_the_project(self, api_key_client, workspace, project, create_user):
        response = api_key_client.post(
            list_url(workspace, project),
            {"name": "Links", "description_html": '<h2>Docs</h2><p><a href="https://example.com">A</a></p>'},
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED
        page = Page.objects.get(pk=response.data["id"])
        assert page.owned_by == create_user
        assert page.description_binary is None
        assert "<h2>Docs</h2>" in response.data["description_html"]
        assert "https://example.com" in response.data["description_html"]
        assert ProjectPage.objects.filter(project=project, page=page).exists()

    @pytest.mark.django_db
    def test_strips_scripts_from_the_body(self, api_key_client, workspace, project):
        response = api_key_client.post(
            list_url(workspace, project),
            {"name": "Unsafe", "description_html": "<p>ok</p><script>alert(1)</script>"},
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert "<script" not in Page.objects.get(pk=response.data["id"]).description_html

    @pytest.mark.django_db
    def test_nests_under_a_parent_in_the_project(self, api_key_client, workspace, project, create_user):
        parent = make_page(project, create_user)

        response = api_key_client.post(
            list_url(workspace, project),
            {"name": "Child", "description_html": "<p>x</p>", "parent_id": str(parent.id)},
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert str(response.data["parent_id"]) == str(parent.id)

    @pytest.mark.django_db
    def test_refuses_a_parent_from_another_project(self, api_key_client, workspace, project, create_user):
        other = Project.objects.create(name="Other", identifier="OT", workspace=workspace, created_by=create_user)
        parent = make_page(other, create_user)

        response = api_key_client.post(
            list_url(workspace, project),
            {"name": "Child", "description_html": "<p>x</p>", "parent_id": str(parent.id)},
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @pytest.mark.django_db
    def test_guest_cannot_create(self, api_key_client, workspace, project):
        ProjectMember.objects.filter(project=project).update(role=5)

        response = api_key_client.post(list_url(workspace, project), {"name": "No"}, format="json")

        assert response.status_code == status.HTTP_403_FORBIDDEN

    @pytest.mark.django_db
    def test_non_member_is_refused(self, api_key_client, workspace, project):
        ProjectMember.objects.filter(project=project).update(is_active=False)

        response = api_key_client.get(list_url(workspace, project))

        assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.contract
class TestProjectPageRead:
    @pytest.mark.django_db
    def test_list_hides_other_peoples_private_pages_and_other_projects(
        self, api_key_client, workspace, project, create_user, other_user
    ):
        mine = make_page(project, create_user, name="mine", access=Page.PRIVATE_ACCESS)
        public = make_page(project, other_user, name="public")
        make_page(project, other_user, name="hidden", access=Page.PRIVATE_ACCESS)
        other = Project.objects.create(name="Other", identifier="OT", workspace=workspace, created_by=create_user)
        make_page(other, create_user, name="elsewhere")

        response = api_key_client.get(list_url(workspace, project))

        assert response.status_code == status.HTTP_200_OK
        assert {str(row["id"]) for row in response.data["results"]} == {str(mine.id), str(public.id)}

    @pytest.mark.django_db
    def test_restricted_guest_lists_only_their_own(self, api_key_client, workspace, project, create_user, other_user):
        ProjectMember.objects.filter(project=project).update(role=5)
        mine = make_page(project, create_user)
        make_page(project, other_user)

        response = api_key_client.get(list_url(workspace, project))

        assert [str(row["id"]) for row in response.data["results"]] == [str(mine.id)]

    @pytest.mark.django_db
    def test_retrieve_returns_the_body(self, api_key_client, workspace, project, create_user):
        page = make_page(project, create_user, description_html="<p>body</p>")

        response = api_key_client.get(detail_url(workspace, project, page))

        assert response.status_code == status.HTTP_200_OK
        assert response.data["description_html"] == "<p>body</p>"

    @pytest.mark.django_db
    def test_a_page_of_another_project_is_not_reachable(self, api_key_client, workspace, project, create_user):
        other = Project.objects.create(name="Other", identifier="OT", workspace=workspace, created_by=create_user)
        page = make_page(other, create_user)

        response = api_key_client.get(detail_url(workspace, project, page))

        assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.contract
class TestProjectPageUpdate:
    @pytest.mark.django_db
    def test_new_body_resets_the_stored_document_and_records_a_version(
        self, api_key_client, workspace, project, create_user, page_transaction_delay, track_page_version_delay
    ):
        page = make_page(project, create_user, description_html="<p>old</p>", description_binary=b"stale")

        response = api_key_client.put(
            detail_url(workspace, project, page), {"description_html": "<p>new</p>"}, format="json"
        )

        assert response.status_code == status.HTTP_200_OK
        page.refresh_from_db()
        assert page.description_html == "<p>new</p>"
        assert page.description_binary is None
        page_transaction_delay.assert_called_once()
        track_page_version_delay.assert_called_once()

    @pytest.mark.django_db
    def test_rename_keeps_the_stored_document(
        self, api_key_client, workspace, project, create_user, track_page_version_delay
    ):
        page = make_page(project, create_user, description_binary=b"keep")

        response = api_key_client.patch(detail_url(workspace, project, page), {"name": "Renamed"}, format="json")

        assert response.status_code == status.HTTP_200_OK
        page.refresh_from_db()
        assert page.name == "Renamed"
        assert bytes(page.description_binary) == b"keep"
        track_page_version_delay.assert_not_called()

    @pytest.mark.django_db
    def test_locked_page_is_refused(self, api_key_client, workspace, project, create_user):
        page = make_page(project, create_user, is_locked=True)

        response = api_key_client.patch(detail_url(workspace, project, page), {"name": "No"}, format="json")

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @pytest.mark.django_db
    def test_only_the_owner_changes_access(self, api_key_client, workspace, project, other_user):
        page = make_page(project, other_user)

        response = api_key_client.patch(
            detail_url(workspace, project, page), {"access": Page.PRIVATE_ACCESS}, format="json"
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
