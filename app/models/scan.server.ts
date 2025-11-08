import prisma from "../db.server";
import { getPolicyRules, type PolicyRule } from "../data/policyKeywords";
import { openai, testConnection } from "../utils/openai.server";

const PRODUCTS_QUERY = `#graphql
  query ScanProducts($first: Int!, $after: String) {
    products(first: $first, after: $after, sortKey: UPDATED_AT) {
      nodes {
        id
        legacyResourceId
        title
        handle
        descriptionHtml
        onlineStoreUrl
        tags
        featuredImage { url altText }
        metafields(first: 10) {
          edges {
            node {
              namespace
              key
              value
            }
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

const PRODUCT_BY_ID_QUERY = `#graphql
  query ProductForScan($id: ID!) {
    product(id: $id) {
      id
      legacyResourceId
      title
      handle
      descriptionHtml
      onlineStoreUrl
      tags
      featuredImage { url altText }
      metafields(first: 10) {
        edges {
          node {
            namespace
            key
            value
          }
        }
      }
    }
  }
`;

export type SeverityLevel = "High" | "Medium" | "Low";

export type ComplianceViolation = {
  issue: string;
  policy: string;
  law: string;
  severity: SeverityLevel;
  riskScore: number;
  suggestion: string;
  whyMatters: string;
  ruleRef: string;
  sourceUrl?: string;
};

export type ComplianceFinding = {
  productId: string;
  legacyResourceId?: string;
  productTitle: string;
  productHandle?: string | null;
  thumbnailUrl?: string | null;
  originalDescription: string;
  originalHtml?: string;
  market: string;
  shopDomain: string;
  violations: ComplianceViolation[];
  complianceScore: number;
  status: "flagged" | "clean" | "error";
  errorMessage?: string;
  aiRewrite?: {
    title?: string;
    description?: string;
  };
};

export type DashboardNotification = {
  id: string;
  title: string;
  detail: string;
  severity: "critical" | "warning" | "info";
  createdAt: string;
};

export type DashboardHydration = {
  scans: SerializedScan[];
  schedules: Awaited<ReturnType<typeof fetchSchedules>>;
  history: Awaited<ReturnType<typeof fetchHistory>>;
  notifications: DashboardNotification[];
  aiConnected: boolean;
};

export async function hydrateDashboard(shopDomain: string): Promise<DashboardHydration> {
  const [scans, schedules, history, aiStatus] = await Promise.all([
    prisma.scan.findMany({ where: { shopDomain }, orderBy: { startedAt: "desc" }, take: 5 }),
    fetchSchedules(shopDomain),
    fetchHistory(shopDomain),
    testConnection(),
  ]);

  const serialized = scans.map((scan) => serializeScan(scan));
  const notifications = buildNotifications(serialized);

  return {
    scans: serialized,
    schedules,
    history,
    notifications,
    aiConnected: Boolean(aiStatus),
  };
}

export async function runFullScan({
  admin,
  shopDomain,
  market,
}: {
  admin: any;
  shopDomain: string;
  market: string;
}) {
  const products = await fetchAllProducts(admin);
  if (!products.length) {
    throw new Error("No products found to scan.");
  }

  const rules = getPolicyRules(market);
  const openAiClient = openai;
  if (!openAiClient) {
    throw new Error("OPENAI_API_KEY missing");
  }

  const findings: ComplianceFinding[] = [];
  for (const product of products) {
    const finding = await analyzeProduct({ product, rules, market, openAiClient, shopDomain });
    findings.push(finding);
  }

  const { complianceScore, totalViolations } = buildAggregateMetrics(findings);

  const saved = await prisma.scan.create({
    data: {
      shopDomain,
      market,
      complianceScore,
      violations: totalViolations,
      productsScanned: findings.length,
      status: "complete",
      completedAt: new Date(),
      results: findings,
    },
  });

  await persistScanArtifacts(saved.id, shopDomain, market, findings);

  return serializeScan(saved);
}

export async function rescanSingleProduct({
  admin,
  scanId,
  productId,
  shopDomain,
}: {
  admin: any;
  scanId: string;
  productId: string;
  shopDomain: string;
}) {
  const scanRecord = await prisma.scan.findUnique({ where: { id: scanId } });
  if (!scanRecord || scanRecord.shopDomain !== shopDomain) {
    throw new Error("Scan not found");
  }

  const product = await fetchProductById(admin, productId);
  if (!product) {
    throw new Error("Product not found");
  }

  const rules = getPolicyRules(scanRecord.market);
  const finding = await analyzeProduct({
    product,
    rules,
    market: scanRecord.market,
    openAiClient: openai,
    shopDomain,
  });

  const existing = (scanRecord.results as ComplianceFinding[] | null) ?? [];
  const updatedResults = upsertFinding(existing, finding);
  const aggregate = buildAggregateMetrics(updatedResults);

  const updatedScan = await prisma.scan.update({
    where: { id: scanId },
    data: {
      results: updatedResults,
      complianceScore: aggregate.complianceScore,
      violations: aggregate.totalViolations,
      productsScanned: updatedResults.length,
      completedAt: new Date(),
    },
  });

  await prisma.scanResult.deleteMany({ where: { scanId, productId } });
  await persistScanArtifacts(scanId, shopDomain, scanRecord.market, [finding]);

  return serializeScan(updatedScan);
}

export async function saveScanSchedule({
  shopDomain,
  productId,
  market,
  frequency,
}: {
  shopDomain: string;
  productId: string;
  market: string;
  frequency: "daily" | "weekly" | "monthly";
}) {
  const now = new Date();
  const delta = frequency === "daily" ? 1 : frequency === "weekly" ? 7 : 30;
  const nextRun = new Date(now.getTime() + delta * 24 * 60 * 60 * 1000);

  return prisma.scanSchedule.upsert({
    where: {
      shopDomain_productId: {
        shopDomain,
        productId,
      },
    },
    update: {
      market,
      frequency,
      nextRun,
      lastRun: now,
    },
    create: {
      shopDomain,
      productId,
      market,
      frequency,
      nextRun,
      lastRun: now,
    },
  });
}

export async function fetchSchedules(shopDomain: string) {
  return prisma.scanSchedule.findMany({ where: { shopDomain } });
}

export async function fetchHistory(shopDomain: string) {
  try {
    return await prisma.productScanHistory.findMany({
      where: { shopDomain },
      orderBy: { scannedAt: "asc" },
      take: 1000,
    });
  } catch (error: any) {
    if (isMissingColumnError(error)) {
      console.warn("ProductScanHistory schema mismatch detected, falling back to empty history", error.message);
      return [];
    }
    throw error;
  }
}

export function serializeScan(scan: any) {
  const results = (scan.results as ComplianceFinding[] | null) ?? [];
  return {
    ...scan,
    startedAt: scan.startedAt.toISOString(),
    completedAt: scan.completedAt ? scan.completedAt.toISOString() : null,
    results,
  };
}

export type SerializedScan = ReturnType<typeof serializeScan>;

async function persistScanArtifacts(
  scanId: string,
  shopDomain: string,
  market: string,
  findings: ComplianceFinding[],
) {
  if (!findings.length) return;

  await safeCreateMany("scanResult", () =>
    prisma.scanResult.createMany({
      data: findings.flatMap((finding) =>
        finding.violations.map((violation) => ({
          scanId,
          productId: finding.productId,
          productTitle: finding.productTitle,
          ruleRef: violation.ruleRef,
          policy: violation.policy,
          law: violation.law,
          market,
          severity: violation.severity,
          riskScore: violation.riskScore,
          aiGuidance: violation.suggestion,
          whyMatters: violation.whyMatters,
          sourceUrl: violation.sourceUrl,
        })),
      ),
    }),
  );

  await safeCreateMany("productScanHistory", () =>
    prisma.productScanHistory.createMany({
      data: findings.map((finding) => ({
        scanId,
        shopDomain,
        productId: finding.productId,
        market,
        complianceScore: finding.complianceScore,
        violations: finding.violations.length,
      })),
    }),
  );
}

async function safeCreateMany<T>(label: string, operation: () => Promise<T>) {
  try {
    return await operation();
  } catch (error: any) {
    if (isMissingColumnError(error)) {
      console.warn(
        `[scan] Skipping ${label} persistence because the current database schema is missing expected columns (runtime fallback).`,
      );
      return;
    }
    throw error;
  }
}

function isMissingColumnError(error: any) {
  if (!error) return false;
  if (error.code === "P2022" || error.code === "P2010") return true;
  const message = error.message?.toLowerCase?.();
  return message?.includes("does not exist") || message?.includes("unknown column");
}

async function fetchAllProducts(admin: any, batchSize = 50) {
  const products: any[] = [];
  let after: string | null = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const response = await admin.graphql(PRODUCTS_QUERY, { variables: { first: batchSize, after } });
    const body = await response.json();
    const nodes = body?.data?.products?.nodes ?? [];
    products.push(...nodes);
    const pageInfo = body?.data?.products?.pageInfo;
    hasNextPage = Boolean(pageInfo?.hasNextPage);
    after = pageInfo?.endCursor ?? null;
  }

  return products;
}

async function fetchProductById(admin: any, productId: string) {
  const response = await admin.graphql(PRODUCT_BY_ID_QUERY, { variables: { id: productId } });
  const body = await response.json();
  return body?.data?.product ?? null;
}

async function analyzeProduct({
  product,
  rules,
  market,
  openAiClient,
  shopDomain,
}: {
  product: any;
  rules: PolicyRule[];
  market: string;
  openAiClient: any;
  shopDomain: string;
}): Promise<ComplianceFinding> {
  const plainDescription = stripHtml(product.descriptionHtml ?? "");
  const metafieldsText = (product.metafields?.edges ?? [])
    .map((edge: any) => `${edge.node.namespace} ${edge.node.key} ${edge.node.value}`)
    .join(" ");
  const combined = `${product.title}\n${plainDescription}\n${product.tags?.join(" ") ?? ""}\n${metafieldsText}`.toLowerCase();

  const matches = detectPolicyMatches(combined, rules);
  const heuristicViolations = buildHeuristicViolations(matches, market, product.title);

  const aiAnalysis = await buildAiAnalysis({
    openAiClient,
    market,
    productTitle: product.title,
    description: plainDescription,
    url: product.onlineStoreUrl,
    policyHints: heuristicViolations.map((violation) => `${violation.policy}: ${violation.issue}`),
  });

  const combinedViolations = dedupeViolations([...heuristicViolations, ...aiAnalysis.violations]);
  const complianceScore = calculateComplianceScore(combinedViolations);
  const status: "flagged" | "clean" | "error" = aiAnalysis.errorMessage
    ? "error"
    : combinedViolations.length
      ? "flagged"
      : "clean";

  return {
    productId: product.id,
    legacyResourceId: product.legacyResourceId?.toString(),
    productTitle: product.title,
    productHandle: product.handle,
    thumbnailUrl: product.featuredImage?.url ?? null,
    originalDescription: plainDescription,
    originalHtml: product.descriptionHtml ?? undefined,
    market,
    shopDomain,
    violations: combinedViolations,
    complianceScore,
    status,
    errorMessage: aiAnalysis.errorMessage,
    aiRewrite: aiAnalysis.rewrite,
  };
}

function detectPolicyMatches(text: string, rules: PolicyRule[]) {
  return rules
    .map((rule) => {
      const matchingWords = rule.keywords.filter((keyword) => text.includes(keyword.toLowerCase()));
      return matchingWords.length ? { rule, matchingWords } : null;
    })
    .filter(Boolean) as { rule: PolicyRule; matchingWords: string[] }[];
}

function buildHeuristicViolations(
  matches: { rule: PolicyRule; matchingWords: string[] }[],
  market: string,
  productTitle: string,
): ComplianceViolation[] {
  if (!matches.length) return [];
  const lawReference = getMarketLawReference(market);

  return matches.map(({ rule, matchingWords }) => {
    const severity = toSeverityLabel(rule.severity);
    return {
      issue: `${rule.description}. Flagged terms: ${matchingWords.join(", ")}.`,
      policy: `Google Ads – ${rule.category}`,
      law: lawReference.law,
      severity,
      riskScore: severityToRiskScore(severity),
      suggestion: `Rephrase references to ${matchingWords[0] ?? productTitle} to align with ${lawReference.law}.`,
      whyMatters: `This violates ${rule.category} guidance in ${lawReference.law}.`,
      ruleRef: rule.category,
      sourceUrl: lawReference.url,
    };
  });
}

async function buildAiAnalysis({
  openAiClient,
  market,
  productTitle,
  description,
  url,
  policyHints,
}: {
  openAiClient: any;
  market: string;
  productTitle: string;
  description: string;
  url?: string | null;
  policyHints: string[];
}): Promise<{
  violations: ComplianceViolation[];
  rewrite?: { title?: string; description?: string };
  errorMessage?: string;
}> {
  if (!openAiClient) return { violations: [] };

  const lawReference = getMarketLawReference(market);
  const truncatedDescription = description.slice(0, 3500);
  const hints = policyHints.slice(0, 6).join("\n");
  let lastError: unknown;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const completion = await openAiClient.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You are a compliance analyst for Shopify merchants. Compare product data to Google Ads policies and the specified market's ecommerce laws. Return structured JSON only.",
          },
          {
            role: "user",
            content: `Market: ${market.toUpperCase()}
Local law focus: ${lawReference.law}
Product title: ${productTitle}
Product description: ${truncatedDescription}
Product URL: ${url ?? "N/A"}
Known heuristic flags: ${hints || "None"}
Return JSON {"violations":[{"issue":"","policy":"","law":"","severity":"High|Medium|Low","riskScore":0-1,"suggestion":"","whyMatters":"","ruleRef":"","sourceUrl":"","policyUrl":""}],"rewrite":{"title":"","description":""}}.`,
          },
        ],
      });

      const content = completion.choices?.[0]?.message?.content;
      if (!content) return { violations: [] };
      const parsed = JSON.parse(content);
      const violations = Array.isArray(parsed.violations)
        ? parsed.violations
            .map((violation: any) => normalizeViolation(violation, market))
            .filter((violation): violation is ComplianceViolation => Boolean(violation.issue))
        : [];

      return {
        violations,
        rewrite: parsed.rewrite,
      };
    } catch (error) {
      lastError = error;
      if (attempt < 2) {
        const backoff = 500 * 2 ** attempt;
        await new Promise((resolve) => setTimeout(resolve, backoff));
        continue;
      }
    }
  }

  console.error("OpenAI violation generation failed", lastError);
  return { violations: [], errorMessage: "AI scan failed. Please retry." };
}

function dedupeViolations(violations: ComplianceViolation[]) {
  const seen = new Set<string>();
  return violations.filter((violation) => {
    const key = `${violation.issue}|${violation.policy}|${violation.law}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function upsertFinding(results: ComplianceFinding[], finding: ComplianceFinding) {
  const existing = results.findIndex((result) => result.productId === finding.productId);
  if (existing >= 0) {
    const clone = [...results];
    clone[existing] = finding;
    return clone;
  }
  return [...results, finding];
}

function calculateComplianceScore(violations: ComplianceViolation[]) {
  if (!violations.length) return 100;
  const penalty = violations.reduce((sum, violation) => sum + violation.riskScore * 35, 0);
  return Math.max(0, Math.round(100 - penalty));
}

function buildAggregateMetrics(results: ComplianceFinding[]) {
  if (!results.length) {
    return { complianceScore: 0, totalViolations: 0 };
  }
  const complianceScore = Math.round(
    results.reduce((sum, result) => sum + (result.complianceScore ?? 0), 0) / results.length,
  );
  const totalViolations = results.reduce((sum, result) => sum + result.violations.length, 0);
  return { complianceScore, totalViolations };
}

function normalizeViolation(raw: any, market: string): ComplianceViolation {
  if (!raw) {
    return {
      issue: "Potential compliance issue",
      policy: "Google Ads restricted content",
      law: getMarketLawReference(market).law,
      severity: "Medium",
      riskScore: 0.5,
      suggestion: "Review this content for compliance.",
      whyMatters: "Potential policy gap",
      ruleRef: "general",
    };
  }

  const severity = normalizeSeverity(raw.severity);
  const riskSource = typeof raw.riskScore === "number" ? raw.riskScore : severityToRiskScore(severity);
  const lawReference = raw.law ?? getMarketLawReference(market).law;

  return {
    issue: String(raw.issue ?? raw.reason ?? "Potential compliance issue"),
    policy: String(raw.policy ?? "Google Ads restricted content"),
    law: String(lawReference),
    severity,
    riskScore: clampRiskScore(riskSource),
    suggestion: String(raw.suggestion ?? raw.replacement ?? "Update this content to comply."),
    whyMatters: String(raw.whyMatters ?? raw.context ?? "Impacts ad eligibility"),
    ruleRef: String(raw.ruleRef ?? raw.policy ?? "general"),
    sourceUrl: raw.sourceUrl ?? raw.policyUrl ?? getMarketLawReference(market).url,
  };
}

function normalizeSeverity(value: unknown): SeverityLevel {
  if (typeof value !== "string") return "Medium";
  const upper = value.toLowerCase();
  if (upper === "high") return "High";
  if (upper === "low") return "Low";
  return "Medium";
}

function toSeverityLabel(value: PolicyRule["severity"]): SeverityLevel {
  return value === "high" ? "High" : value === "low" ? "Low" : "Medium";
}

function severityToRiskScore(severity: SeverityLevel) {
  if (severity === "High") return 0.92;
  if (severity === "Medium") return 0.6;
  return 0.3;
}

function clampRiskScore(score: number) {
  if (Number.isNaN(score)) return 0.5;
  return Math.min(1, Math.max(0, score));
}

function stripHtml(raw: string) {
  return raw.replace(/<[^>]*>?/g, " ").replace(/\s+/g, " ").trim();
}

function getMarketLawReference(market: string) {
  const key = market.toLowerCase();
  return MARKET_LAW_REFERENCES[key] ?? MARKET_LAW_REFERENCES.default;
}

function buildNotifications(scans: SerializedScan[]): DashboardNotification[] {
  const results = scans.flatMap((scan) => scan.results.map((result) => ({ scan, result })));
  const alerts: DashboardNotification[] = [];
  results.forEach(({ scan, result }) => {
    result.violations
      .filter((violation) => violation.severity === "High" || violation.riskScore >= 0.75)
      .forEach((violation) => {
        alerts.push({
          id: `${scan.id}-${result.productId}-${violation.ruleRef}`,
          title: `${violation.severity} risk on ${result.productTitle}`,
          detail: violation.whyMatters,
          severity: violation.severity === "High" ? "critical" : "warning",
          createdAt: scan.completedAt ?? scan.startedAt,
        });
      });
  });
  return alerts.slice(0, 20);
}

const MARKET_LAW_REFERENCES: Record<string, { law: string; url?: string }> = {
  uk: {
    law: "UK CAP Code, ASA guidance & DfT product marketing rules",
    url: "https://www.gov.uk/government/publications/e-scooter-trials-guidance-for-users",
  },
  us: {
    law: "US FTC truth-in-advertising & FDA marketing guidance",
    url: "https://www.ftc.gov/business-guidance/advertising-marketing",
  },
  eu: {
    law: "EU Consumer Protection Regulation & Google Merchant Center EU policies",
    url: "https://europa.eu/youreurope/business/product-requirements/index_en.htm",
  },
  au: {
    law: "Australia ACCC advertising rules & TGA code",
    url: "https://www.tga.gov.au/resources/resource/guidance/advertising-code",
  },
  ca: {
    law: "Canada Competition Bureau advertising standards",
    url: "https://www.competitionbureau.gc.ca/eic/site/cb-bc.nsf/eng/03031.html",
  },
  default: {
    law: "Local consumer protection and Google Ads policies",
    url: "https://support.google.com/adspolicy",
  },
};
