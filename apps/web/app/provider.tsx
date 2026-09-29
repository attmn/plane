/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { lazy, Suspense, useEffect } from "react";
import { useNavigate } from "react-router";
import { SWRConfig } from "swr";
// Plane Imports
import { WEB_SWR_CONFIG } from "@plane/constants";
import { TranslationProvider } from "@plane/i18n";
import { PlaneToastProvider } from "@plane/blocks/toast";
// mobx store provider
import { StoreProvider } from "@/lib/store-context";
import { ensureTrailingSlash } from "./compat/next/helper";

// lazy imports
const AppProgressBar = lazy(function AppProgressBar() {
  return import("@/lib/b-progress/AppProgressBar");
});

const StoreWrapper = lazy(function StoreWrapper() {
  return import("@/lib/wrappers/store-wrapper");
});

const InstanceWrapper = lazy(function InstanceWrapper() {
  return import("@/lib/wrappers/instance-wrapper");
});

export interface IAppProvider {
  children: React.ReactNode;
}

export function AppProvider(props: IAppProvider) {
  const { children } = props;
  const navigate = useNavigate();

  useEffect(() => {
    const handleInternalLinkNavigation = (event: Event) => {
      const navigationEvent = event as CustomEvent<{ href?: string }>;
      const href = navigationEvent.detail?.href;
      if (!href?.startsWith("/")) return;
      navigationEvent.preventDefault();
      navigate(ensureTrailingSlash(href));
    };
    window.addEventListener("plane:internal-link-navigation", handleInternalLinkNavigation);
    return () => window.removeEventListener("plane:internal-link-navigation", handleInternalLinkNavigation);
  }, [navigate]);

  return (
    <StoreProvider>
      <>
        <AppProgressBar />
        <TranslationProvider>
          {/* The toast viewport is a provider that calls `useTranslation`, so it sits inside
              TranslationProvider and wraps everything that can raise a toast. */}
          <PlaneToastProvider>
            <StoreWrapper>
              <InstanceWrapper>
                <Suspense>
                  <SWRConfig value={WEB_SWR_CONFIG}>{children}</SWRConfig>
                </Suspense>
              </InstanceWrapper>
            </StoreWrapper>
          </PlaneToastProvider>
        </TranslationProvider>
      </>
    </StoreProvider>
  );
}
