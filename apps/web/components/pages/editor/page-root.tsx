/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { observer } from "mobx-react";
import { PagesOutline } from "@makeplane/propel/icons";
// plane imports
import type { CollaborationState, CommandProps, EditorRefApi, IEditorPropsExtended } from "@plane/editor";
import { useTranslation } from "@plane/i18n";
import type { TDocumentPayload, TPage, TPageVersion, TWebhookConnectionQueryParams } from "@plane/types";
// hooks
import { usePageFallback } from "@/hooks/use-page-fallback";
import type { PageUpdateHandler, TCustomEventHandlers } from "@/hooks/use-realtime-page-events";
import { usePagesPaneExtensions, useExtendedEditorProps } from "@/hooks/pages";
import type { EPageStoreType } from "@/hooks/store";
// store
import type { TPageInstance } from "@/store/pages/base-page";
// ui
import { Banner } from "@makeplane/propel/components/banner";
// local imports
import { PageNavigationPaneRoot } from "../navigation-pane";
import { CreatePageModal } from "../modals/create-page-modal";
import { PageVersionsOverlay } from "../version";
import { PagesVersionEditor } from "../version/editor";
import { PageEditorBody } from "./editor-body";
import type { TEditorBodyConfig, TEditorBodyHandlers } from "./editor-body";
import { PageEditorToolbarRoot } from "./toolbar";

export type TPageRootHandlers = {
  create: (payload: Partial<TPage>) => Promise<Partial<TPage> | undefined>;
  fetchAllVersions: (pageId: string) => Promise<TPageVersion[] | undefined>;
  fetchDescriptionBinary: () => Promise<ArrayBuffer>;
  fetchVersionDetails: (pageId: string, versionId: string) => Promise<TPageVersion | undefined>;
  restoreVersion: (pageId: string, versionId: string) => Promise<void>;
  updateDescription: (document: TDocumentPayload) => Promise<void>;
} & TEditorBodyHandlers;

export type TPageRootConfig = TEditorBodyConfig;

type TPageRootProps = {
  config: TPageRootConfig;
  handlers: TPageRootHandlers;
  page: TPageInstance;
  storeType: EPageStoreType;
  webhookConnectionParams: TWebhookConnectionQueryParams;
  projectId?: string;
  workspaceSlug: string;
  customRealtimeEventHandlers?: TCustomEventHandlers;
};

export const PageRoot = observer(function PageRoot(props: TPageRootProps) {
  const {
    config,
    handlers,
    page,
    projectId,
    storeType,
    webhookConnectionParams,
    workspaceSlug,
    customRealtimeEventHandlers,
  } = props;
  // states
  const [editorReady, setEditorReady] = useState(false);
  const [collaborationState, setCollaborationState] = useState<CollaborationState | null>(null);
  const [showContentTooLargeBanner, setShowContentTooLargeBanner] = useState(false);
  const [pendingPageLink, setPendingPageLink] = useState<{
    editor: CommandProps["editor"];
    position: number;
  } | null>(null);
  // translation
  const { t } = useTranslation();
  // refs
  const editorRef = useRef<EditorRefApi>(null);
  // derived values
  const {
    isContentEditable,
    editor: { setEditorRef },
  } = page;
  // page fallback
  const { isFetchingFallbackBinary } = usePageFallback({
    editorRef,
    fetchPageDescription: handlers.fetchDescriptionBinary,
    page,
    collaborationState,
    updatePageDescription: handlers.updateDescription,
  });

  const handleEditorReady = useCallback(
    (status: boolean) => {
      setEditorReady(status);
      if (editorRef.current && !page.editor.editorRef) {
        setEditorRef(editorRef.current);
      }
    },
    [page.editor.editorRef, setEditorRef]
  );

  useEffect(() => {
    const timer = setTimeout(() => setEditorRef(editorRef.current), 0);
    return () => clearTimeout(timer);
  }, [isContentEditable, setEditorRef]);

  // Get extensions and navigation logic from hook
  const {
    editorExtensionHandlers,
    navigationPaneExtensions,
    handleOpenNavigationPane,
    handleCloseNavigationPane,
    isNavigationPaneOpen,
  } = usePagesPaneExtensions({
    page,
    editorRef,
  });

  // Type-safe error handler for content too large errors
  const errorHandler: PageUpdateHandler<"error"> = (params) => {
    const { data } = params;

    // Check if it's content too large error
    if (data.error_code === "content_too_large") {
      setShowContentTooLargeBanner(true);
    }

    // Call original error handler if exists
    customRealtimeEventHandlers?.error?.(params);
  };

  const mergedCustomEventHandlers: TCustomEventHandlers = {
    ...customRealtimeEventHandlers,
    error: errorHandler,
  };

  const handleCreateSubpageCommand = useCallback(({ editor, range }: CommandProps) => {
    editor.commands.deleteRange(range);
    setPendingPageLink({ editor, position: range.from });
  }, []);

  const slashCommandAdditionalOptions = useMemo<NonNullable<IEditorPropsExtended["slashCommandAdditionalOptions"]>>(
    () =>
      projectId && page.id && isContentEditable
        ? [
            {
              commandKey: "page",
              key: "page",
              title: "Page",
              description: "Create a subpage in this page.",
              searchTerms: ["subpage", "child page"],
              icon: <PagesOutline className="size-3.5" />,
              command: handleCreateSubpageCommand,
              section: "general",
              pushAfter: "text",
            },
          ]
        : [],
    [projectId, page.id, isContentEditable, handleCreateSubpageCommand]
  );

  // Get extended editor extensions configuration
  const extendedEditorProps = useExtendedEditorProps({
    workspaceSlug,
    page,
    storeType,
    fetchEntity: handlers.fetchEntity,
    getRedirectionLink: handlers.getRedirectionLink,
    extensionHandlers: editorExtensionHandlers,
    projectId,
    slashCommandAdditionalOptions,
  });

  const handleSubpageCreated = useCallback(
    (subpage: Partial<TPage>) => {
      if (!pendingPageLink || !subpage.id || !projectId || pendingPageLink.editor.isDestroyed) return;
      pendingPageLink.editor.commands.insertContentAt(pendingPageLink.position, {
        type: "text",
        text: subpage.name || "Untitled",
        marks: [
          {
            type: "link",
            attrs: {
              href: `/${workspaceSlug}/projects/${projectId}/pages/${subpage.id}`,
              target: "_self",
            },
          },
        ],
      });
      setPendingPageLink(null);
    },
    [pendingPageLink, projectId, workspaceSlug]
  );

  const handleRestoreVersion = useCallback(
    async (descriptionHTML: string) => {
      editorRef.current?.clearEditor();
      editorRef.current?.setEditorValue(descriptionHTML);
    },
    [editorRef]
  );

  // reset editor ref on unmount
  useEffect(
    () => () => {
      setEditorRef(null);
    },
    [setEditorRef]
  );

  return (
    <div className="relative flex size-full overflow-hidden transition-all duration-300 ease-in-out">
      <div className="flex size-full flex-col overflow-hidden">
        <PageVersionsOverlay
          editorComponent={PagesVersionEditor}
          fetchVersionDetails={handlers.fetchVersionDetails}
          handleRestore={handleRestoreVersion}
          pageId={page.id ?? ""}
          restoreEnabled={isContentEditable}
          storeType={storeType}
        />
        <PageEditorToolbarRoot
          handleOpenNavigationPane={handleOpenNavigationPane}
          isNavigationPaneOpen={isNavigationPaneOpen}
          page={page}
        />
        {showContentTooLargeBanner && (
          <Banner placement="page" variant="warning" title={t("page_content_limit_banner.message")} />
        )}
        <PageEditorBody
          config={config}
          customRealtimeEventHandlers={mergedCustomEventHandlers}
          editorReady={editorReady}
          editorForwardRef={editorRef}
          handleEditorReady={handleEditorReady}
          handleOpenNavigationPane={handleOpenNavigationPane}
          handlers={handlers}
          isNavigationPaneOpen={isNavigationPaneOpen}
          page={page}
          projectId={projectId}
          storeType={storeType}
          webhookConnectionParams={webhookConnectionParams}
          workspaceSlug={workspaceSlug}
          extendedEditorProps={extendedEditorProps}
          isFetchingFallbackBinary={isFetchingFallbackBinary}
          onCollaborationStateChange={setCollaborationState}
        />
        {projectId && page.id && (
          <CreatePageModal
            workspaceSlug={workspaceSlug}
            projectId={projectId}
            storeType={storeType}
            isModalOpen={pendingPageLink !== null}
            handleModalClose={() => setPendingPageLink(null)}
            pageAccess={page.access}
            parentPageId={page.id}
            onCreated={handleSubpageCreated}
          />
        )}
      </div>
      <PageNavigationPaneRoot
        storeType={storeType}
        handleClose={handleCloseNavigationPane}
        isNavigationPaneOpen={isNavigationPaneOpen}
        page={page}
        versionHistory={{
          fetchAllVersions: handlers.fetchAllVersions,
          fetchVersionDetails: handlers.fetchVersionDetails,
        }}
        extensions={navigationPaneExtensions}
      />
    </div>
  );
});
