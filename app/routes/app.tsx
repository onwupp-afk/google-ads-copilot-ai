import type {
  HeadersFunction,
  LoaderFunctionArgs,
} from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Outlet, useLoaderData, useLocation, useRouteError } from "@remix-run/react";
import { boundary } from "@shopify/shopify-app-remix/server";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import { Provider as AppBridgeProvider } from "@shopify/app-bridge-react";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import { Frame, TopBar } from "@shopify/polaris";
import { useCallback, useMemo, useState } from "react";

import { authenticate } from "../shopify.server";
import SidebarNav from "../components/SidebarNav";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const host = url.searchParams.get("host") ?? undefined;
  const shopFromQuery = url.searchParams.get("shop") ?? undefined;
  const shop = shopFromQuery || session?.shop;

  if (!shop) {
    throw redirect("/auth/login");
  }

  if (!host) {
    throw redirect(`/auth/login?shop=${encodeURIComponent(shop)}`);
  }

  return json({
    apiKey: process.env.SHOPIFY_API_KEY || "",
    host,
    shop,
  });
};

export type AppContext = {
  host: string;
  shop: string;
};

export default function App() {
  const { apiKey, host, shop } = useLoaderData<typeof loader>();
  const location = useLocation();
  const [isMobileNavActive, setIsMobileNavActive] = useState(false);
  const skipToContentTarget = "AppFrameContent";

  const handleNavigationToggle = useCallback(() => {
    setIsMobileNavActive((current) => !current);
  }, []);

  const handleNavigationDismiss = useCallback(() => {
    setIsMobileNavActive(false);
  }, []);

  const topBarMarkup = useMemo(
    () => (
      <TopBar showNavigationToggle onNavigationToggle={handleNavigationToggle} />
    ),
    [handleNavigationToggle],
  );

  const navigationMarkup = useMemo(
    () => (
      <SidebarNav
        activePath={`${location.pathname}${location.search}`}
        host={host}
        shop={shop}
        onNavigate={handleNavigationDismiss}
      />
    ),
    [handleNavigationDismiss, host, location.pathname, location.search, shop],
  );

  return (
    <AppProvider isEmbeddedApp apiKey={apiKey}>
      <AppBridgeProvider
        config={{
          apiKey,
          host,
          forceRedirect: true,
        }}
      >
        <Frame
          topBar={topBarMarkup}
          navigation={navigationMarkup}
          skipToContentTarget={skipToContentTarget}
          showMobileNavigation={isMobileNavActive}
          onNavigationDismiss={handleNavigationDismiss}
        >
          <div id={skipToContentTarget} style={{ minHeight: "100%" }}>
            <Outlet context={{ host, shop }} />
          </div>
        </Frame>
      </AppBridgeProvider>
    </AppProvider>
  );
}

// Shopify needs Remix to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
