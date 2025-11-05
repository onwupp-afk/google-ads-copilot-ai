import { RemixBrowser } from "@remix-run/react";
import { StrictMode, startTransition } from "react";
import { hydrateRoot } from "react-dom/client";

function logClientError(scope: string, error: unknown, info?: unknown) {
  // eslint-disable-next-line no-console
  console.error(`Remix client ${scope} error`, error, info ?? "");
}

startTransition(() => {
  hydrateRoot(
    document,
    (
      <StrictMode>
        <RemixBrowser />
      </StrictMode>
    ),
    {
      onRecoverableError(error, info) {
        logClientError("recoverable", error, info);
      },
    },
  );
});

window.addEventListener("error", (event) => {
  logClientError("onerror", event.error ?? event.message);
});

window.addEventListener("unhandledrejection", (event) => {
  logClientError("unhandledrejection", event.reason);
});
