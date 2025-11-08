import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";

import { authenticate } from "../shopify.server";
import {
  loadWorkspaceAnalysis,
  applyIssueFix,
  applyBulkIssueFixes,
  regenerateIssueSuggestion,
  fetchWorkspaceProduct,
  type FixScope,
  type WorkspaceIssue,
} from "../models/fixWorkspace.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const productId = url.searchParams.get("productId");
  const market = (url.searchParams.get("market") ?? "us").toLowerCase();
  const scope = (url.searchParams.get("scope") ?? "all") as FixScope;
  const scanId = url.searchParams.get("scanId") ?? undefined;

  if (!productId) {
    return json({ error: "productId is required" }, { status: 400 });
  }

  const { admin, session } = await authenticate.admin(request);
  try {
    const payload = await loadWorkspaceAnalysis({
      admin,
      session,
      shopDomain: session.shop,
      productId,
      market,
      scope,
      scanId,
    });
    return json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load AI workspace";
    return json({ error: message }, { status: 500 });
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const body = await parseBody(request);
  const intent = body.intent;
  if (!intent) {
    return json({ error: "intent is required" }, { status: 400 });
  }

  const { admin, session } = await authenticate.admin(request);
  const shopDomain = session.shop;
  const productId = body.productId;
  const market = (body.market ?? "us").toLowerCase();
  const scanId = body.scanId ?? undefined;
  const scope = (body.scope ?? "all") as FixScope;

  try {
    switch (intent) {
      case "applySingle": {
        const issue = body.issue as WorkspaceIssue | undefined;
        if (!productId || !issue) {
          return json({ error: "Missing product or issue" }, { status: 400 });
        }
        const result = await applyIssueFix({
          admin,
          session,
          shopDomain,
          productId,
          market,
          scanId,
          scope,
          issue,
        });
        return json(result, { status: result.success ? 200 : 422 });
      }
      case "applyBulk": {
        const issues = (body.issues as WorkspaceIssue[] | undefined) ?? [];
        if (!productId || !issues.length) {
          return json({ error: "No issues provided" }, { status: 400 });
        }
        const results = await applyBulkIssueFixes({
          admin,
          session,
          shopDomain,
          productId,
          market,
          scanId,
          scope,
          issues,
        });
        return json({ results });
      }
      case "regenerate": {
        if (!productId || !body.issue) {
          return json({ error: "Missing product or issue" }, { status: 400 });
        }
        const product = await fetchWorkspaceProduct(admin, productId);
        const updatedIssue = await regenerateIssueSuggestion({
          product,
          issue: body.issue,
          market,
        });
        return json({ issue: updatedIssue });
      }
      default:
        return json({ error: "Unsupported intent" }, { status: 400 });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to process request";
    return json({ error: message }, { status: 500 });
  }
};

async function parseBody(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return (await request.json()) as Record<string, any>;
  }
  const formData = await request.formData();
  return Object.fromEntries(formData);
}
