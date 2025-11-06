import type {
  HeadersFunction,
  LoaderFunctionArgs,
} from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import {
  Outlet,
  useLoaderData,
  useLocation,
  useRouteError,
} from "@remix-run/react";
import { boundary } from "@shopify/shopify-app-remix/server";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import {
  Badge,
  Frame,
  InlineStack,
  Text,
  TopBar,
} from "@shopify/polaris";
import { useCallback, useMemo, useState } from "react";

import { authenticate } from "../shopify.server";
import SidebarNav from "../components/SidebarNav";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const forwardedHost =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const forwardedProto =
    request.headers.get("x-forwarded-proto") ?? "https";
  const url = new URL(request.url);
  console.info("[app.loader] start", { path: url.pathname, search: url.search });

  const searchParams = new URLSearchParams(url.searchParams);
  let authResult: Awaited<ReturnType<typeof authenticate.admin>>;
  try {
    authResult = await authenticate.admin(request);
  } catch (error) {
    if (error instanceof Response) {
      const cloned = error.clone();
      let body: string | undefined;
      try {
        body = await cloned.text();
      } catch (bodyError) {
        body = `[body read error: ${bodyError instanceof Error ? bodyError.message : bodyError}]`;
      }
      const locationHeader = cloned.headers.get("location");
      if (locationHeader && forwardedHost) {
        try {
          const locationUrl = new URL(locationHeader, `${forwardedProto}://${forwardedHost}`);
          const reloadParam = locationUrl.searchParams.get("shopify-reload");
          if (reloadParam) {
            const reloadUrl = new URL(reloadParam);
            const expectedOrigin = `${forwardedProto}://${forwardedHost}`;
            if (reloadUrl.origin !== expectedOrigin) {
              reloadUrl.protocol = forwardedProto;
              reloadUrl.host = forwardedHost;
              locationUrl.searchParams.set(
                "shopify-reload",
                reloadUrl.toString(),
              );
              const newLocation = `${locationUrl.pathname}?${locationUrl.searchParams.toString()}`;
              const headers = new Headers(cloned.headers);
              headers.set("location", newLocation);
              throw new Response(null, {
                status: cloned.status,
                statusText: cloned.statusText,
                headers,
              });
            }
          }
        } catch (locationError) {
          console.error("[app.loader] failed to adjust location header", locationError);
        }
      }
      console.error("[app.loader] authenticate.admin failed (response)", {
        status: cloned.status,
        statusText: cloned.statusText,
        headers: Object.fromEntries(cloned.headers.entries()),
        body,
      });
    } else {
      console.error("[app.loader] authenticate.admin failed", {
        message: error instanceof Error ? error.message : String(error),
      });
    }
    throw error;
  }
  const { session } = authResult;

  const host = searchParams.get("host") ?? undefined;
  const shopFromQuery = searchParams.get("shop") ?? undefined;
  const shop = shopFromQuery || session?.shop;
  const embedded = searchParams.get("embedded") ?? undefined;
  const sessionToken = searchParams.get("session_token") ?? undefined;

  // Log request context to aid diagnosing embedded auth issues in production.
  console.info("[app.loader] request", {
    path: url.pathname,
    hostParamPresent: Boolean(host),
    shopFromQuery: shopFromQuery ?? null,
    sessionShop: session?.shop ?? null,
    embedded,
    sessionTokenPresent: Boolean(sessionToken),
  });

  if (!shop) {
    throw redirect("/auth/login");
  }

  if (!host) {
    searchParams.set("shop", shop);
    throw redirect(`/auth/login?shop=${encodeURIComponent(shop)}`);
  }

  const persistentSearch = searchParams.toString();

  return json({
    apiKey: process.env.SHOPIFY_API_KEY || "",
    host,
    shop,
    embedded,
    sessionToken,
    persistentSearch,
  });
};

export type AppContext = {
  host: string;
  shop: string;
  persistentSearch: string | null;
};

export default function App() {
  const {
    apiKey,
    host,
    shop,
    embedded,
    sessionToken,
    persistentSearch,
  } = useLoaderData<typeof loader>();
  const location = useLocation();
  const [isMobileNavActive, setIsMobileNavActive] = useState(false);
  const skipToContentTarget = "AppFrameContent";
  const storeBadgeLabel = useMemo(
    () => (shop.endsWith(".myshopify.com") ? shop.replace(".myshopify.com", "") : shop),
    [shop],
  );
  const persistentParams = useMemo(() => {
    if (persistentSearch && persistentSearch.length > 0) {
      return persistentSearch;
    }
    const params = new URLSearchParams({ host, shop });
    if (embedded) params.set("embedded", embedded);
    if (sessionToken) params.set("session_token", sessionToken);
    return params.toString();
  }, [embedded, host, persistentSearch, sessionToken, shop]);

  const handleNavigationToggle = useCallback(() => {
    setIsMobileNavActive((current) => !current);
  }, []);

  const handleNavigationDismiss = useCallback(() => {
    setIsMobileNavActive(false);
  }, []);

  const topBarMarkup = useMemo(
    () => (
      <TopBar
        showNavigationToggle
        onNavigationToggle={handleNavigationToggle}
        contextControl={
          <InlineStack gap="200" blockAlign="center">
            <Text variant="headingSm" as="span">
              Google Ads Policy Copilot AI
            </Text>
            <Badge tone="attention">{storeBadgeLabel}</Badge>
          </InlineStack>
        }
        secondaryMenu={
          <Text as="span" tone="subdued">
            Embedded app connected
          </Text>
        }
      />
    ),
    [handleNavigationToggle, storeBadgeLabel],
  );

  const navigationMarkup = useMemo(
    () => (
      <SidebarNav
        activePath={`${location.pathname}${location.search}`}
        persistentSearch={persistentParams}
        onNavigate={handleNavigationDismiss}
      />
    ),
    [handleNavigationDismiss, location.pathname, location.search, persistentParams],
  );

  return (
    <AppProvider isEmbeddedApp apiKey={apiKey}>
      <Frame
        topBar={topBarMarkup}
        navigation={navigationMarkup}
        skipToContentTarget={skipToContentTarget}
        showMobileNavigation={isMobileNavActive}
        onNavigationDismiss={handleNavigationDismiss}
      >
        <div id={skipToContentTarget} style={{ minHeight: "100%" }}>
          <Outlet
            context={{
              host,
              shop,
              persistentSearch: persistentParams || null,
            }}
          />
        </div>
      </Frame>
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
