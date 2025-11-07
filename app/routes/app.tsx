import type { HeadersFunction, LoaderFunctionArgs } from "@remix-run/node";
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
  Button,
  Frame,
  Navigation,
  Text,
  TopBar,
} from "@shopify/polaris";
import { useMemo, useState } from "react";
import { authenticate } from "../shopify.server";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

function buildLoginRedirect(url: URL) {
  const shopParam =
    url.searchParams.get("shop") ?? process.env.SHOP_DOMAIN ?? undefined;
  if (shopParam) {
    return redirect(`/auth/login?shop=${shopParam}`);
  }
  throw new Response("Missing shop parameter", { status: 400 });
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const searchParams = new URLSearchParams(url.searchParams);
  let authResult: Awaited<ReturnType<typeof authenticate.admin>>;

  try {
    authResult = await authenticate.admin(request);
  } catch (error) {
    return buildLoginRedirect(url);
  }

  const { session } = authResult;
  const host = searchParams.get("host") ?? undefined;
  const embedded = searchParams.get("embedded") ?? undefined;
  const sessionToken = searchParams.get("session_token") ?? undefined;
  const shop = session?.shop;

  if (!shop) {
    return buildLoginRedirect(url);
  }

  if (!host) {
    return buildLoginRedirect(url);
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
  const { apiKey, host, shop, embedded, sessionToken, persistentSearch } =
    useLoaderData<typeof loader>();
  const location = useLocation();
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  const persistentParams = useMemo(() => {
    if (persistentSearch && persistentSearch.length > 0) {
      return persistentSearch;
    }
    const params = new URLSearchParams({ host, shop });
    if (embedded) params.set("embedded", embedded);
    if (sessionToken) params.set("session_token", sessionToken);
    return params.toString();
  }, [embedded, host, persistentSearch, sessionToken, shop]);

  const withParams = (path: string) => {
    if (!persistentParams) return path;
    return `${path}?${persistentParams}`;
  };

  const navigationMarkup = (
    <Navigation location={location.pathname}>
      <Navigation.Section
        items={[
          { label: "Dashboard", url: withParams("/app"), exactMatch: true },
          { label: "Scan", url: withParams("/app/scans") },
          { label: "Settings", url: withParams("/app/settings") },
        ]}
      />
    </Navigation>
  );

  const topBarMarkup = (
    <TopBar
      showNavigationToggle
      onNavigationToggle={() => setIsMobileNavOpen((state) => !state)}
      contextControl={
        <Text as="span" variant="headingSm">
          {shop.replace(".myshopify.com", "")}
        </Text>
      }
      secondaryMenu={<Button url={withParams("/app/settings")}>Upgrade</Button>}
    />
  );

  return (
    <AppProvider isEmbeddedApp apiKey={apiKey}>
      <Frame
        navigation={navigationMarkup}
        topBar={topBarMarkup}
        showMobileNavigation={isMobileNavOpen}
        onNavigationDismiss={() => setIsMobileNavOpen(false)}
      >
        <Outlet
          context={{
            host,
            shop,
            persistentSearch: persistentParams || null,
          }}
        />
      </Frame>
    </AppProvider>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
