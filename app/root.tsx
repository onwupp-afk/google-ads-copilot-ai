import type {
  LinksFunction,
  LoaderFunctionArgs,
  MetaFunction,
} from "@remix-run/node";
import { json } from "@remix-run/node";
import {
  Links,
  LiveReload,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLoaderData,
} from "@remix-run/react";
import { AppProvider as PolarisProvider } from "@shopify/polaris";
import en from "@shopify/polaris/locales/en.json";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import { AppProvider as ShopifyAppProvider } from "@shopify/shopify-app-remix/react";

export const meta: MetaFunction = () => [
  { title: "AIthor App" },
  { name: "viewport", content: "width=device-width, initial-scale=1" },
];

export const links: LinksFunction = () => [
  { rel: "stylesheet", href: polarisStyles },
];

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  return json({
    apiKey: process.env.SHOPIFY_API_KEY,
    host: url.searchParams.get("host"),
    embedded: true,
  });
}

export default function Root() {
  const { apiKey, host, embedded } = useLoaderData<typeof loader>();
  return (
    <html lang="en">
      <head>
        <Meta />
        <Links />
      </head>
      <body>
        <ShopifyAppProvider apiKey={apiKey} host={host ?? undefined} isEmbeddedApp={embedded}>
          <PolarisProvider i18n={en}>
            <Outlet />
          </PolarisProvider>
        </ShopifyAppProvider>
        <ScrollRestoration />
        <Scripts />
        <LiveReload />
      </body>
    </html>
  );
}
