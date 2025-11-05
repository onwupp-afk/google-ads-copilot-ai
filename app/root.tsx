import type { LinksFunction } from "@remix-run/node";
import React from "react";
import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useRouteError,
} from "@remix-run/react";
import customMediaStyles from "./styles/custom-media.css?url";

export const links: LinksFunction = () => [
  { rel: "stylesheet", href: customMediaStyles },
];

function Document({
  children,
  title,
}: {
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <html>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <link rel="preconnect" href="https://cdn.shopify.com/" />
        <link
          rel="stylesheet"
          href="https://cdn.shopify.com/static/fonts/inter/v4/styles.css"
        />
        {title ? <title>{title}</title> : null}
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return (
    <Document>
      <Outlet />
    </Document>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  // eslint-disable-next-line no-console
  console.error("Remix application error", error);
  const message = isRouteErrorResponse(error)
    ? error.data || error.statusText
    : error instanceof Error
      ? error.message
      : null;

  return (
    <Document title="App initializing — please wait">
      <main
        style={{
          display: "grid",
          placeItems: "center",
          minHeight: "100vh",
          padding: "4rem 2rem",
          textAlign: "center",
          gap: "1.5rem",
        }}
      >
        <section style={{ maxWidth: "32rem" }}>
          <h1
            style={{
              fontSize: "2rem",
              lineHeight: 1.2,
              marginBottom: "0.75rem",
            }}
          >
            App initializing — please wait
          </h1>
          <p style={{ margin: 0, fontSize: "1.1rem", lineHeight: 1.5 }}>
            We&apos;re reconnecting to your Shopify store. This usually takes a
            few seconds—try refreshing shortly if the page doesn&apos;t load
            automatically.
          </p>
          {message && process.env.NODE_ENV === "development" ? (
            <pre
              style={{
                marginTop: "1.5rem",
                padding: "1rem",
                background: "#f6f6f7",
                borderRadius: "0.75rem",
                overflowX: "auto",
                fontSize: "0.9rem",
              }}
            >
              {message}
            </pre>
          ) : null}
        </section>
      </main>
    </Document>
  );
}
