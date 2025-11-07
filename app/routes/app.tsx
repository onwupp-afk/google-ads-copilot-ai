import type { HeadersFunction, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import {
  Outlet,
  useLoaderData,
  useRouteError,
  useSearchParams,
} from "@remix-run/react";
import { useMemo } from "react";
import { boundary } from "@shopify/shopify-app-remix/server";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import { TitleBar } from "@shopify/app-bridge-react/components/TitleBar";
import { NavMenu } from "@shopify/app-bridge-react/components/NavMenu";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import { Card, Frame, Page, Text } from "@shopify/polaris";
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

  const missingHost = !host;
  const persistentSearch = searchParams.toString();

  return json({
    apiKey: process.env.SHOPIFY_API_KEY || "",
    host,
    shop,
    embedded,
    sessionToken,
    persistentSearch,
    missingHost,
  });
};

export type AppContext = {
  host: string;
  shop: string;
  persistentSearch: string | null;
};

function useLinkWithParams(fallback: string | null) {
  const [params] = useSearchParams();
  const query = params.toString() || fallback || "";
  return useMemo(
    () =>
      (path: string) =>
        query.length ? `${path}?${query}` : path,
    [query],
  );
}

export default function App() {
  const {
    apiKey,
    host,
    shop,
    embedded,
    sessionToken,
    persistentSearch,
    missingHost,
  } = useLoaderData<typeof loader>();
  const linkWithParams = useLinkWithParams(persistentSearch);

  const persistentParams = useMemo(() => {
    if (persistentSearch && persistentSearch.length > 0) {
      return persistentSearch;
    }
    const params = new URLSearchParams({ host, shop });
    if (embedded) params.set("embedded", embedded);
    if (sessionToken) params.set("session_token", sessionToken);
    return params.toString();
  }, [embedded, host, persistentSearch, sessionToken, shop]);

  if (missingHost) {
    return (
      <Page title="Open from Shopify">
        <Card sectioned>
          <Text as="p">
            This app needs to be launched from Shopify Admin so it can load the store context. Return to Shopify and click Apps →
            Google Ads Policy & Local Laws Copilot → Open app to continue.
          </Text>
        </Card>
      </Page>
    );
  }

  return (
    <AppProvider isEmbeddedApp apiKey={apiKey}>
      <NavMenu>
        <a data-primary-nav-item href={linkWithParams("/app")}>Dashboard</a>
        <a data-primary-nav-item href={linkWithParams("/app/scans")}>Scans</a>
        <a data-primary-nav-item href={linkWithParams("/app/settings")}>Settings</a>
        <a
          data-secondary-nav-item
          href="https://aithorapp.co.uk/support"
          target="_blank"
          rel="noopener noreferrer"
        >
          Support
        </a>
      </NavMenu>
      <Frame>
        <TitleBar
          title="Google Ads Policy & Local Laws Copilot"
          primaryAction={{
            content: "Upgrade",
            url: linkWithParams("/app/settings"),
          }}
        />
        <Page>
          <Outlet
            context={{
              host,
              shop,
              persistentSearch: persistentParams || null,
            }}
          />
        </Page>
      </Frame>
    </AppProvider>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
