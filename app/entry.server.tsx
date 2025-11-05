import { PassThrough } from "stream";
import { renderToPipeableStream } from "react-dom/server";
import { RemixServer } from "@remix-run/react";
import {
  createReadableStreamFromReadable,
  type EntryContext,
} from "@remix-run/node";
import { isbot } from "isbot";
import { addDocumentResponseHeaders } from "./shopify.server";

export const streamTimeout = 5000;

export default async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  remixContext: EntryContext,
) {
  try {
    addDocumentResponseHeaders(request, responseHeaders);
    const userAgent = request.headers.get("user-agent");
    const callbackName = isbot(userAgent ?? "") ? "onAllReady" : "onShellReady";

    return await new Promise<Response>((resolve, reject) => {
      const { pipe, abort } = renderToPipeableStream(
        <RemixServer context={remixContext} url={request.url} />,
        {
          [callbackName]: () => {
            const body = new PassThrough();
            const stream = createReadableStreamFromReadable(body);

            responseHeaders.set("Content-Type", "text/html");
            resolve(
              new Response(stream, {
                headers: responseHeaders,
                status: responseStatusCode,
              }),
            );
            pipe(body);
          },
          onShellError(error) {
            logServerError("shell", error);
            reject(renderFallbackResponse());
          },
          onError(error) {
            responseStatusCode = 500;
            logServerError("stream", error);
          },
        },
      );

      setTimeout(abort, streamTimeout + 1000);
    });
  } catch (error) {
    logServerError("unhandled", error);
    return renderFallbackResponse();
  }
}

function renderFallbackResponse() {
  const html = `<!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <title>App initializing — please wait</title>
        <style>
          body{display:grid;min-height:100vh;margin:0;font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f6f6f7;color:#202223;padding:4rem 1.5rem;place-items:center;text-align:center}
          main{max-width:32rem}
          h1{font-size:2rem;margin-bottom:1rem}
          p{font-size:1.05rem;line-height:1.6;margin:0}
        </style>
      </head>
      <body>
        <main>
          <h1>App initializing — please wait</h1>
          <p>We&apos;re reconnecting to your Shopify store. Please refresh in a moment.</p>
        </main>
      </body>
    </html>`;
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
    },
    status: 500,
  });
}

function logServerError(scope: string, error: unknown) {
  // eslint-disable-next-line no-console
  console.error(`Remix SSR ${scope} error`, error);
}
