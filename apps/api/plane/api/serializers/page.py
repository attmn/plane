# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from rest_framework import serializers

from plane.app.serializers import PageDetailSerializer, PageSerializer


class PageAPISerializer(PageSerializer):
    """A page as listed by the external API, with no body."""

    parent_id = serializers.UUIDField(read_only=True)

    class Meta(PageSerializer.Meta):
        fields = PageSerializer.Meta.fields + ["parent_id"]


class PageAPIDetailSerializer(PageDetailSerializer):
    """A single page returned by the external API, with its body."""

    parent_id = serializers.UUIDField(read_only=True)

    class Meta(PageDetailSerializer.Meta):
        fields = PageDetailSerializer.Meta.fields + ["parent_id"]
