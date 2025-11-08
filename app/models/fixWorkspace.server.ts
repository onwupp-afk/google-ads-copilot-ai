import { randomUUID } from "node:crypto";
import type { Session } from "@shopify/shopify-api";

import prisma from "../db.server";
import { openai } from "../utils/openai.server";
import type { SeverityLevel } from "./scan.server";

export type FixScope = "title" | "description" | "metadata" | "template" | "all";

export type WorkspaceIssue = {
  id: string;
  title: string;
  summary: string;
  severity: SeverityLevel;
  targetField: FixScope;
  metadataNamespace?: string;
  metadataKey?: string;
  policyReference?: string;
  sourceUrl?: string;
  confidence: number;
  suggestion: string;
  before?: string;
  after?: string;
  templateKey?: string;
  allowManualEdit?: boolean;
  status?: "pending" | "applied" | "error";
  errorMessage?: string;
};

export type WorkspacePayload = {
  product: WorkspaceProductContext;
  template?: TemplateContext | null;
  issues: WorkspaceIssue[];
  stats: {
    scope: FixScope;
    totalIssues: number;
    confidenceAvg: number;
  };
};

export type WorkspaceProductContext = {
  id: string;
  legacyResourceId?: string | null;
  title: string;
  descriptionHtml?: string | null;
  descriptionText: string;
  handle?: string | null;
  onlineStoreUrl?: string | null;
  templateSuffix?: string | null;
  featuredImage?: { url: string; altText?: string | null } | null;
  seo?: { title?: string | null; description?: string | null } | null;
  metafields: Array<{
    id: string;
    namespace: string;
    key: string;
    value: string;
    type?: string | null;
  }>;
};

export type TemplateContext = {
  key: string;
  value: string;
};

const WORKSPACE_PRODUCT_QUERY = `#graphql
  query WorkspaceProduct($id: ID!) {
    product(id: $id) {
      id
      legacyResourceId
      title
      handle
      descriptionHtml
      onlineStoreUrl
      templateSuffix
      featuredImage { url altText }
      seo { title description }
      metafields(first: 50) {
        edges {
          node {
            id
            namespace
            key
            value
            type
          }
        }
      }
    }
  }
`;

export async function loadWorkspaceAnalysis({
  admin,
  session,
  shopDomain,
  productId,
  market,
  scope,
  scanId,
}: {
  admin: any;
  session: Session;
  shopDomain: string;
  productId: string;
  market: string;
  scope: FixScope;
  scanId?: string;
}): Promise<WorkspacePayload> {
  const product = await fetchWorkspaceProduct(admin, productId);
  const template = await fetchTemplateContent(admin, session, product.templateSuffix);
  const ai = await runWorkspaceAnalysis({ product, template, scope, market });

  await persistWorkspaceSnapshot({
    shopDomain,
    productId,
    market,
    scope,
    scanId,
    issues: ai.issues,
    confidenceAvg: ai.stats.confidenceAvg,
  });

  return {
    product,
    template,
    issues: ai.issues,
    stats: ai.stats,
  };
}

export type ApplyIssuePayload = {
  admin: any;
  session: Session;
  shopDomain: string;
  shop?: string;
  issue: WorkspaceIssue;
  productId: string;
  market: string;
  scanId?: string;
  scope: FixScope;
};

const PRODUCT_UPDATE_MUTATION = `#graphql
  mutation WorkspaceProductUpdate($input: ProductInput!) {
    productUpdate(input: $input) {
      product { id }
      userErrors { field message }
    }
  }
`;

const METAFIELDS_SET_MUTATION = `#graphql
  mutation WorkspaceMetafieldSet($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      userErrors { field message }
    }
  }
`;

export async function applyIssueFix(payload: ApplyIssuePayload) {
  const { admin, session, issue, productId, shopDomain, market, scanId, scope } = payload;
  const fixLog = await prisma.fixLog.create({
    data: {
      shopDomain,
      market,
      productId,
      issueId: issue.id,
      fixType: issue.allowManualEdit ? "manual" : "ai",
      fieldUpdated: issue.targetField,
      scopeUsed: scope,
      aiModelVersion: "gpt-4o-mini",
      metadata: issue,
    },
  });

  try {
    if (issue.targetField === "title" || issue.targetField === "description") {
      await applyProductFieldUpdate(admin, productId, issue);
    } else if (issue.targetField === "metadata") {
      await applyMetadataUpdate(admin, productId, issue);
    } else if (issue.targetField === "template") {
      await applyTemplateUpdate(admin, session, issue);
    }

    await prisma.fixLog.update({ where: { id: fixLog.id }, data: { status: "success" } });
    await markIssueResolved({ scanId, productId, issueId: issue.id, shopDomain });

    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to apply fix";
    await prisma.fixLog.update({ where: { id: fixLog.id }, data: { status: "failed", errorMessage: message } });
    return { success: false, error: message };
  }
}

export async function applyBulkIssueFixes({ issues, ...base }: Omit<ApplyIssuePayload, "issue"> & { issues: WorkspaceIssue[] }) {
  const results: Array<{ issueId: string; success: boolean; error?: string }> = [];
  for (let index = 0; index < issues.length; index += 1) {
    const issue = issues[index];
    const outcome = await applyIssueFix({ ...base, issue });
    results.push({ issueId: issue.id, success: Boolean(outcome.success), error: outcome.error });
  }
  return results;
}

export async function regenerateIssueSuggestion({
  product,
  issue,
  market,
}: {
  product: WorkspaceProductContext;
  issue: WorkspaceIssue;
  market: string;
}) {
  if (!openai) {
    return issue;
  }

  const prompt = `Regenerate a compliant fix for the following Shopify product snippet.
Market: ${market.toUpperCase()}
Target field: ${issue.targetField}
Issue summary: ${issue.summary}
Original text: ${issue.before ?? ""}

Respond as JSON {"after":"..","suggestion":".."}`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.3,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: "You improve Shopify product content for policy compliance." },
      { role: "user", content: prompt },
    ],
  });

  const payload = safeJson(completion.choices?.[0]?.message?.content ?? "{}");
  return {
    ...issue,
    suggestion: payload?.suggestion ?? payload?.after ?? issue.suggestion,
    after: payload?.after ?? issue.after,
  };
}

async function applyProductFieldUpdate(admin: any, productId: string, issue: WorkspaceIssue) {
  const input: Record<string, unknown> = { id: productId };
  if (issue.targetField === "title") {
    input.title = issue.after ?? issue.suggestion;
  }
  if (issue.targetField === "description") {
    const html = toHtmlParagraphs(issue.after ?? issue.suggestion ?? "");
    input.descriptionHtml = html;
  }

  const response = await admin.graphql(PRODUCT_UPDATE_MUTATION, {
    variables: { input },
  });
  const body = await response.json();
  const errors = body?.data?.productUpdate?.userErrors;
  if (errors?.length) {
    throw new Error(errors[0].message ?? "Product update failed");
  }
}

async function applyMetadataUpdate(admin: any, productId: string, issue: WorkspaceIssue) {
  if (!issue.metadataNamespace || !issue.metadataKey) {
    throw new Error("Metadata target missing");
  }
  const value = issue.after ?? issue.suggestion ?? "";
  const response = await admin.graphql(METAFIELDS_SET_MUTATION, {
    variables: {
      metafields: [
        {
          ownerId: productId,
          namespace: issue.metadataNamespace,
          key: issue.metadataKey,
          type: "single_line_text_field",
          value,
        },
      ],
    },
  });
  const body = await response.json();
  const errors = body?.data?.metafieldsSet?.userErrors;
  if (errors?.length) {
    throw new Error(errors[0].message ?? "Metafield update failed");
  }
}

async function applyTemplateUpdate(admin: any, session: Session, issue: WorkspaceIssue) {
  if (!issue.templateKey) {
    throw new Error("Template key missing");
  }
  const themesResponse = await admin.rest.resources.Theme.all({ session });
  const mainTheme = themesResponse?.data?.find((theme: any) => theme.role === "main") ?? themesResponse?.data?.[0];
  if (!mainTheme?.id) {
    throw new Error("No editable theme found");
  }

  const assetResponse = await admin.rest.resources.Asset.all({
    session,
    theme_id: mainTheme.id,
    asset: { key: issue.templateKey },
  });
  const asset = assetResponse?.data?.[0];
  if (!asset?.value) {
    throw new Error("Template asset not found");
  }

  const originalText = issue.before ?? "";
  const replacement = issue.after ?? issue.suggestion ?? "";
  const nextValue = asset.value.replace(originalText, replacement);
  const themeAsset = new admin.rest.resources.Asset({ session });
  themeAsset.theme_id = mainTheme.id;
  themeAsset.key = issue.templateKey;
  themeAsset.value = nextValue;
  await themeAsset.save({ update: true });
}

async function markIssueResolved({
  scanId,
  productId,
  issueId,
  shopDomain,
}: {
  scanId?: string;
  productId: string;
  issueId: string;
  shopDomain: string;
}) {
  if (!scanId) return;
  const history = await prisma.productScanHistory.findFirst({
    where: { scanId, productId },
  });
  if (!history) return;

  const issues = Array.isArray(history.issues) ? (history.issues as WorkspaceIssue[]) : [];
  const updatedIssues = issues.map((issue) =>
    issue.id === issueId ? { ...issue, status: "applied" } : issue,
  );

  const resolvedCount = updatedIssues.filter((issue) => issue.status === "applied").length;

  await prisma.productScanHistory.update({
    where: { id: history.id },
    data: {
      issues: updatedIssues,
      resolvedIssues: resolvedCount,
    },
  });
}

function toHtmlParagraphs(text: string) {
  if (!text) return "<p></p>";
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<p>${line}</p>`)
    .join("") || "<p></p>";
}

export async function fetchWorkspaceProduct(admin: any, productId: string): Promise<WorkspaceProductContext> {
  const response = await admin.graphql(WORKSPACE_PRODUCT_QUERY, {
    variables: { id: productId },
  });
  const payload = await response.json();
  const product = payload?.data?.product;
  if (!product) {
    throw new Error("Product not found");
  }

  const descriptionText = stripHtml(product.descriptionHtml ?? "");
  const metafields = (product.metafields?.edges ?? [])
    .map((edge: any) => edge?.node)
    .filter(Boolean)
    .map((node: any) => ({
      id: node.id,
      namespace: node.namespace,
      key: node.key,
      value: node.value,
      type: node.type,
    }));

  return {
    id: product.id,
    legacyResourceId: product.legacyResourceId,
    title: product.title,
    descriptionHtml: product.descriptionHtml,
    descriptionText,
    handle: product.handle,
    onlineStoreUrl: product.onlineStoreUrl,
    templateSuffix: product.templateSuffix,
    featuredImage: product.featuredImage,
    seo: product.seo,
    metafields,
  };
}

async function fetchTemplateContent(admin: any, session: Session, templateSuffix?: string | null) {
  const themesResponse = await admin.rest.resources.Theme.all({ session });
  const mainTheme = themesResponse?.data?.find((theme: any) => theme.role === "main") ?? themesResponse?.data?.[0];
  if (!mainTheme?.id) {
    return null;
  }

  const suffixSegment = templateSuffix ? `.${templateSuffix}` : "";
  const candidateKeys = [
    `templates/product${suffixSegment}.json`,
    `templates/product${suffixSegment}.liquid`,
    "templates/product.json",
    "templates/product.liquid",
  ];

  for (const key of candidateKeys) {
    try {
      const assetResponse = await admin.rest.resources.Asset.all({
        session,
        theme_id: mainTheme.id,
        asset: { key },
      });
      const asset = assetResponse?.data?.[0];
      if (asset?.value) {
        return { key, value: asset.value } satisfies TemplateContext;
      }
    } catch (error) {
      continue;
    }
  }

  return null;
}

async function runWorkspaceAnalysis({
  product,
  template,
  scope,
  market,
}: {
  product: WorkspaceProductContext;
  template: TemplateContext | null;
  scope: FixScope;
  market: string;
}) {
  if (!openai) {
    return {
      issues: [],
      stats: { scope, totalIssues: 0, confidenceAvg: 0 },
    };
  }

  const templateBlock = template ? truncate(template.value, 6000) : "";
  const metadataText = product.metafields
    .map((field) => `${field.namespace}.${field.key}: ${field.value}`)
    .join("\n");

  const selectedScope = scope === "all" ? "title, description, metadata, template" : scope;
  const prompt = `You are an AI compliance auditor for Shopify merchants.
Market: ${market.toUpperCase()}
Scope: ${selectedScope}

Product title:
${product.title}

Product description (plain text):
${truncate(product.descriptionText, 5000)}

Metadata:
${truncate(metadataText, 2000) || "None"}

Template content:
${templateBlock || "Template unavailable"}

Return JSON with the following shape strictly:
{
  "issues": [
     {
        "id": "uuid",
        "title": "",
        "summary": "",
        "severity": "High|Medium|Low",
        "targetField": "title|description|metadata|template",
        "metadataNamespace": "optional",
        "metadataKey": "optional",
        "policyReference": "",
        "sourceUrl": "",
        "confidence": 0-1,
        "suggestion": "Updated text or guidance",
        "before": "original snippet",
        "after": "rewritten snippet"
     }
  ],
  "stats": { "totalIssues": 0, "confidenceAvg": 0-1 }
}

Focus on Google Ads and local law policies. ALWAYS include before/after text.`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: "You fix policy violations for Shopify product detail pages." },
      { role: "user", content: prompt },
    ],
  });

  const content = completion.choices?.[0]?.message?.content;
  if (!content) {
    return {
      issues: [],
      stats: { scope, totalIssues: 0, confidenceAvg: 0 },
    };
  }

  const parsed = safeJson(content);
  const issues = Array.isArray(parsed?.issues)
    ? parsed.issues.map((issue: any) => normalizeIssue(issue, template))
    : [];
  const totalIssues = issues.length;
  const confidenceAvg = totalIssues
    ? Math.round((issues.reduce((sum, issue) => sum + issue.confidence, 0) / totalIssues) * 100) / 100
    : 0;

  return {
    issues,
    stats: { scope, totalIssues, confidenceAvg },
  };
}

function normalizeIssue(raw: any, template: TemplateContext | null): WorkspaceIssue {
  const id = raw?.id && typeof raw.id === "string" ? raw.id : randomUUID();
  const severity = normalizeSeverity(raw?.severity);
  const targetField = normalizeTargetField(raw?.targetField);
  const confidence = clampNumber(raw?.confidence ?? 0.5);
  const suggestion = String(raw?.suggestion ?? raw?.after ?? "Review this content.");

  return {
    id,
    title: String(raw?.title || "Policy issue"),
    summary: String(raw?.summary || raw?.issue || "Potential violation"),
    severity,
    targetField,
    metadataNamespace: raw?.metadataNamespace ?? undefined,
    metadataKey: raw?.metadataKey ?? undefined,
    policyReference: raw?.policyReference ?? undefined,
    sourceUrl: raw?.sourceUrl ?? undefined,
    confidence,
    suggestion,
    before: raw?.before ?? undefined,
    after: raw?.after ?? suggestion,
    templateKey: template?.key,
    status: "pending",
  };
}

function normalizeSeverity(value: any): SeverityLevel {
  const normalized = typeof value === "string" ? value.toLowerCase() : "";
  if (normalized === "high") return "High";
  if (normalized === "low") return "Low";
  return "Medium";
}

function normalizeTargetField(value: any): FixScope {
  const normalized = typeof value === "string" ? value.toLowerCase() : "";
  if (normalized === "title") return "title";
  if (normalized === "metadata") return "metadata";
  if (normalized === "template") return "template";
  if (normalized === "description") return "description";
  return "description";
}

function clampNumber(value: any) {
  const num = typeof value === "number" ? value : parseFloat(value ?? "0");
  if (Number.isNaN(num)) return 0.5;
  return Math.min(1, Math.max(0, num));
}

function truncate(value: string, max: number) {
  if (!value) return "";
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

function stripHtml(raw: string) {
  return raw.replace(/<[^>]*>?/g, " ").replace(/\s+/g, " ").trim();
}

function safeJson(raw: string) {
  try {
    return JSON.parse(raw);
  } catch (error) {
    return { issues: [] };
  }
}

async function persistWorkspaceSnapshot({
  shopDomain,
  productId,
  market,
  scope,
  scanId,
  issues,
  confidenceAvg,
}: {
  shopDomain: string;
  productId: string;
  market: string;
  scope: FixScope;
  scanId?: string;
  issues: WorkspaceIssue[];
  confidenceAvg: number;
}) {
  const data = {
    shopDomain,
    productId,
    market,
    complianceScore: 0,
    violations: issues.length,
    totalIssues: issues.length,
    resolvedIssues: issues.filter((issue) => issue.status === "applied").length,
    scopeUsed: scope,
    aiConfidenceAvg: confidenceAvg,
    issues,
  };

  if (!scanId) {
    return;
  }

  const existing = await prisma.productScanHistory.findFirst({
    where: { scanId, productId },
    orderBy: { scannedAt: "desc" },
  });

  if (existing) {
    await prisma.productScanHistory.update({
      where: { id: existing.id },
      data,
    });
    return;
  }

  await prisma.productScanHistory.create({
    data: {
      ...data,
      scanId,
    },
  });
}
