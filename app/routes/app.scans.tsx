import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useEffect, useMemo, useState } from "react";
import { useFetcher, useLoaderData } from "@remix-run/react";
import type { Scan } from "@prisma/client";
import {
  Badge,
  Banner,
  Button,
  Card,
  Divider,
  Icon,
  InlineStack,
  Layout,
  LegacyStack as Stack,
  Link,
  Modal,
  Pagination,
  Select,
  SkeletonBodyText,
  SkeletonDisplayText,
  Spinner,
  Text,
} from "@shopify/polaris";
import { AlertCircleIcon, CheckCircleIcon, ProductIcon } from "@shopify/polaris-icons";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import { getPolicyRules, type PolicyRule } from "../data/policyKeywords";
import { openai, testConnection } from "../utils/openai.server";

const RESULTS_PER_PAGE = 25;

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

type ScanIntent = "startScan";

export type ComplianceFinding = {
  productId: string;
  legacyResourceId?: string;
  productTitle: string;
  market: string;
  shopDomain: string;
  violations: ComplianceViolation[];
  complianceScore: number;
  status: "flagged" | "clean";
};

export type ComplianceViolation = {
  issue: string;
  policy: string;
  law: string;
  severity: "High" | "Medium" | "Low";
  riskScore: number;
  suggestion: string;
  sourceUrl?: string;
};

export type SerializedScan = Omit<Scan, "startedAt" | "completedAt" | "results"> & {
  startedAt: string;
  completedAt: string | null;
  results: ComplianceFinding[];
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const [scans, aiStatus] = await Promise.all([
    prisma.scan.findMany({
      where: { shopDomain: session.shop },
      orderBy: { startedAt: "desc" },
      take: 5,
    }),
    testConnection(),
  ]);

  return json({ scans: scans.map(serializeScan), aiConnected: Boolean(aiStatus) });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const formData = await request.formData();
  const intent = formData.get("intent")?.toString() as ScanIntent | undefined;
  const market = (formData.get("market")?.toString() ?? "uk").toLowerCase();
  const { admin, session } = await authenticate.admin(request);

  if (intent === "startScan") {
    try {
      const scan = await runComplianceScan({ admin, session, market });
      return json({ scan: serializeScan(scan) });
    } catch (error) {
      console.error("AI scan failed", error);
      return json(
        { error: error instanceof Error ? error.message : "Scan failed" },
        { status: 500 },
      );
    }
  }

  return json({ error: "Unsupported action" }, { status: 400 });
};

export default function AppScansPage() {
  const { scans, aiConnected } = useLoaderData<typeof loader>();
  const runScanFetcher = useFetcher<typeof action>();

  const [history, setHistory] = useState<SerializedScan[]>(scans);
  const [selectedScanId, setSelectedScanId] = useState<string | null>(scans[0]?.id ?? null);
  const [market, setMarket] = useState<string>("uk");
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(0);

  useEffect(() => {
    if (runScanFetcher.state === "idle") {
      if (runScanFetcher.data?.scan) {
        setHistory((prev) => [runScanFetcher.data.scan, ...prev].slice(0, 5));
        setSelectedScanId(runScanFetcher.data.scan.id);
        setCurrentPage(0);
        setScanError(null);
      } else if (runScanFetcher.data?.error) {
        setScanError(runScanFetcher.data.error as string);
      }
    }
  }, [runScanFetcher.state, runScanFetcher.data]);

  const displayedScan = useMemo(() => {
    if (!history.length) return undefined;
    if (!selectedScanId) return history[0];
    return history.find((scan) => scan.id === selectedScanId) ?? history[0];
  }, [history, selectedScanId]);

  const isScanning = runScanFetcher.state !== "idle";
  const scanHistoryOptions = history.map((scan) => ({
    label: `${scan.market.toUpperCase()} • ${formatTimestamp(scan.completedAt ?? scan.startedAt)}`,
    value: scan.id,
  }));

  const metrics = displayedScan
    ? {
        complianceScore: displayedScan.complianceScore ?? 0,
        violations: displayedScan.violations,
        productsScanned: displayedScan.productsScanned,
        timestamp: displayedScan.completedAt ?? displayedScan.startedAt,
        market: displayedScan.market,
      }
    : null;

  const totalPages = displayedScan ? Math.max(1, Math.ceil(displayedScan.results.length / RESULTS_PER_PAGE)) : 1;

  const visibleResults = useMemo(() => {
    if (!displayedScan) return [];
    const start = currentPage * RESULTS_PER_PAGE;
    return displayedScan.results.slice(start, start + RESULTS_PER_PAGE);
  }, [displayedScan, currentPage]);

  const resultSections = visibleResults.map((result, resultIndex) => {
    const hasViolations = result.violations.length > 0;
    const summaryBadgeTone = hasViolations ? "critical" : "success";

    return (
      <div key={`${result.productId}-section`}>
        <Stack vertical spacing="300">
          <InlineStack align="space-between" blockAlign="start">
            <div>
              <Text variant="headingSm" as="h3">
                {result.productTitle}
              </Text>
              <Text tone="subdued" as="p">
                {hasViolations
                  ? `${result.violations.length} violation${result.violations.length === 1 ? "" : "s"} detected`
                  : "No violations detected"}
              </Text>
            </div>
            <Badge tone={summaryBadgeTone}>
              {hasViolations ? "Flagged" : "Clean"}
            </Badge>
          </InlineStack>

          {hasViolations ? (
            <Stack vertical spacing="200">
              {result.violations.map((violation, index) => (
                <div key={`${result.productId}-violation-${index}`}>
                  <InlineStack gap="200" align="space-between">
                    <InlineStack gap="200" blockAlign="center">
                      <Badge tone={severityTone(violation.severity)}>{violation.severity}</Badge>
                      <Badge tone={riskTone(violation.riskScore)}>
                        Risk {formatRisk(violation.riskScore)}
                      </Badge>
                    </InlineStack>
                    {violation.sourceUrl && (
                      <Link url={violation.sourceUrl} target="_blank">
                        Policy reference
                      </Link>
                    )}
                  </InlineStack>
                  <Text variant="bodySm" as="p">
                    <strong>{violation.policy}</strong> · {violation.law}
                  </Text>
                  <Text variant="bodySm" tone="subdued" as="p">
                    {violation.issue}
                  </Text>
                  <Text variant="bodySm" as="p">
                    <strong>AI guidance:</strong> {violation.suggestion}
                  </Text>
                  {index < result.violations.length - 1 && <Divider />}
                </div>
              ))}
            </Stack>
          ) : (
            <Text tone="subdued">Everything looks compliant for this product.</Text>
          )}
        </Stack>
        {resultIndex < visibleResults.length - 1 && <Divider />}
      </div>
    );
  });

  return (
    <>
      <Layout>
        <Layout.Section>
          <Text variant="headingLg" as="h1">
            AI Compliance Scan
          </Text>
          <Text tone="subdued" as="p">
            Scan your catalog for Google Ads and market-specific regulations. Every issue now includes the policy, governing law, severity level, and a risk score so you can justify remediation work immediately.
          </Text>
        </Layout.Section>

        <Layout.Section>
          <Banner status="info">
            This AI-powered scan stays in sync with the latest Google Ads and local law updates. Each violation references the governing rule so your team can document decisions quickly.
          </Banner>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <Stack spacing="400">
              <Select
                label="Select market to scan"
                options={MARKETS}
                value={market}
                onChange={(value) => setMarket(value)}
              />
              <Text as="p" tone="subdued">
                We localize each scan to the selected market so policy citations and risk scoring reflect current laws.
              </Text>
              {history.length > 0 && (
                <Select
                  label="Scan history"
                  options={scanHistoryOptions}
                  value={selectedScanId ?? undefined}
                  onChange={(value) => {
                    setSelectedScanId(value);
                    setCurrentPage(0);
                  }}
                  placeholder="Most recent"
                />
              )}
            </Stack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          {aiConnected ? (
            <Banner status="success" title="AI connection active">
              Analysis powered by OpenAI GPT-4o-mini.
            </Banner>
          ) : (
            <Banner status="critical" title="AI connection failed">
              <p>We couldn’t connect to OpenAI. Please check your API key or try again later.</p>
            </Banner>
          )}
        </Layout.Section>

        <Layout.Section>
          <Layout>
            {getMetricCards(metrics).map((metric) => (
              <Layout.Section key={metric.title} variant="oneThird">
                <Card>
                  <Stack spacing="300" alignment="center">
                    <Icon source={metric.icon} tone="primary" />
                    <div>
                      <Text variant="headingMd" as="h3">
                        {metric.title}
                      </Text>
                      <Text variant="headingLg" as="p">
                        {metric.value}
                      </Text>
                      <Text as="p" tone="subdued">
                        {metric.description}
                      </Text>
                    </div>
                  </Stack>
                </Card>
              </Layout.Section>
            ))}
          </Layout>
        </Layout.Section>

        <Layout.Section>
          <Card title="Run New Scan" sectioned>
            <Text as="p" tone="subdued">
              We pull live product data from Shopify, cross-reference Google Ads and market regulations, and surface every violation with documented policy and law metadata.
            </Text>
            <InlineStack gap="300" blockAlign="center" style={{ marginTop: "var(--p-space-400)" }}>
              <runScanFetcher.Form method="post">
                <input type="hidden" name="intent" value="startScan" />
                <input type="hidden" name="market" value={market} />
                <Button primary submit disabled={isScanning}>
                  {isScanning ? (
                    <InlineStack gap="200" blockAlign="center">
                      <Spinner size="small" />
                      <span>Scanning…</span>
                    </InlineStack>
                  ) : (
                    "Run Compliance Scan"
                  )}
                </Button>
              </runScanFetcher.Form>
              {metrics?.timestamp && (
                <Text as="span" tone="subdued">
                  Last scan: {formatTimestamp(metrics.timestamp)} ({metrics.market.toUpperCase()})
                </Text>
              )}
            </InlineStack>
            {isScanning && (
              <div style={{ marginTop: "var(--p-space-400)" }}>
                <SkeletonDisplayText size="small" />
                <SkeletonBodyText lines={3} />
              </div>
            )}
          </Card>
        </Layout.Section>

        {scanError && (
          <Layout.Section>
            <Banner status="critical" onDismiss={() => setScanError(null)}>
              {scanError}
            </Banner>
          </Layout.Section>
        )}

        {displayedScan && (
          <Layout.Section>
            <Card>
              <Stack spacing="400">
                <div>
                  <Text variant="headingLg" as="h2">
                    Scan Results
                  </Text>
                  <Text as="p" tone="subdued">
                    Every violation includes the Google Ads policy, local law reference, severity badge, and AI remediation note.
                  </Text>
                </div>
                <Divider />
                <InlineStack align="space-between" blockAlign="center">
                  <InlineStack gap="200" blockAlign="center">
                    <Button onClick={() => setUpgradeModalOpen(true)}>Apply All AI Suggestions</Button>
                    <Text as="span" tone="subdued">
                      Upgrade required for automatic remediation.
                    </Text>
                  </InlineStack>
                  {displayedScan.results.length > RESULTS_PER_PAGE && (
                    <InlineStack gap="200" blockAlign="center">
                      <Pagination
                        hasPrevious={currentPage > 0}
                        onPrevious={() => setCurrentPage((prev) => Math.max(0, prev - 1))}
                        hasNext={currentPage < totalPages - 1}
                        onNext={() => setCurrentPage((prev) => Math.min(totalPages - 1, prev + 1))}
                      />
                      <Text tone="subdued">
                        Page {currentPage + 1} of {totalPages}
                      </Text>
                    </InlineStack>
                  )}
                </InlineStack>
                {visibleResults.length === 0 ? (
                  <Text tone="subdued">No products matched this page.</Text>
                ) : (
                  <Stack vertical spacing="400">
                    {resultSections}
                  </Stack>
                )}
              </Stack>
            </Card>
          </Layout.Section>
        )}

        {!displayedScan && (
          <Layout.Section>
            <Card sectioned>
              <Text>No scans yet. Kick off your first scan to see results here.</Text>
            </Card>
          </Layout.Section>
        )}
      </Layout>

      <Modal
        open={upgradeModalOpen}
        onClose={() => setUpgradeModalOpen(false)}
        title="Upgrade your plan to automatically apply AI compliance fixes"
        primaryAction={{ content: "Upgrade Plan", onAction: () => setUpgradeModalOpen(false) }}
        secondaryActions={[{ content: "Maybe later", onAction: () => setUpgradeModalOpen(false) }]}
      >
        <Modal.Section>
          <Text as="p" tone="subdued">
            Batch remediation, scheduling, and policy exports are available on the Growth and Agency plans. Contact support to enable these features.
          </Text>
        </Modal.Section>
      </Modal>
    </>
  );
}

const MARKETS = [
  { label: "United Kingdom", value: "uk" },
  { label: "United States", value: "us" },
  { label: "European Union", value: "eu" },
  { label: "Australia", value: "au" },
  { label: "Canada", value: "ca" },
];

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString();
}

function serializeScan(scan: Scan): SerializedScan {
  const rawResults = (scan.results as ComplianceFinding[] | undefined) ?? [];
  return {
    ...scan,
    startedAt: scan.startedAt.toISOString(),
    completedAt: scan.completedAt ? scan.completedAt.toISOString() : null,
    results: rawResults.map((raw) => normalizeFinding(raw, { market: scan.market, shopDomain: scan.shopDomain })),
  };
}

async function runComplianceScan({ admin, session, market }: { admin: any; session: any; market: string }) {
  const products = await fetchAllProducts(admin);
  if (!products.length) {
    throw new Error("No products found to scan.");
  }

  const rules = getPolicyRules(market);
  const openAiClient = openai;
  if (!openAiClient) {
    throw new Error("OpenAI API key missing. Add OPENAI_API_KEY to the environment.");
  }

  const results: ComplianceFinding[] = [];

  for (const product of products) {
    const finding = await analyzeProduct({
      product,
      rules,
      market,
      openAiClient,
      shopDomain: session.shop,
    });
    results.push(finding);
  }

  const violationCount = results.reduce((sum, result) => sum + result.violations.length, 0);
  const complianceScore = results.length
    ? Math.round(results.reduce((sum, r) => sum + r.complianceScore, 0) / results.length)
    : 100;

  const saved = await prisma.scan.create({
    data: {
      shopDomain: session.shop,
      market,
      complianceScore,
      violations: violationCount,
      productsScanned: results.length,
      status: "complete",
      completedAt: new Date(),
      results,
    },
  });

  return saved;
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

  const aiViolations = await buildAiViolations({
    openAiClient,
    market,
    productTitle: product.title,
    description: plainDescription,
    url: product.onlineStoreUrl,
    policyHints: heuristicViolations.map((violation) => `${violation.policy}: ${violation.issue}`),
  });

  const combinedViolations = dedupeViolations([...heuristicViolations, ...aiViolations]);
  const complianceScore = calculateComplianceScore(combinedViolations);

  return {
    productId: product.id,
    legacyResourceId: product.legacyResourceId?.toString(),
    productTitle: product.title,
    market,
    shopDomain,
    violations: combinedViolations,
    complianceScore,
    status: combinedViolations.length ? "flagged" : "clean",
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
      sourceUrl: lawReference.url,
    };
  });
}

async function buildAiViolations({
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
}): Promise<ComplianceViolation[]> {
  if (!openAiClient) return [];

  const lawReference = getMarketLawReference(market);
  const truncatedDescription = description.slice(0, 3500);
  const hints = policyHints.slice(0, 6).join("\n");

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
Return JSON {"violations":[{"issue":"","policy":"","law":"","severity":"High|Medium|Low","riskScore":0-1,"suggestion":"","sourceUrl":""}]}.` ,
        },
      ],
    });

    const content = completion.choices?.[0]?.message?.content;
    if (!content) return [];
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed.violations)) {
      return parsed.violations
        .map((violation: any) => normalizeViolation(violation, market))
        .filter((violation): violation is ComplianceViolation => Boolean(violation.issue));
    }
    return [];
  } catch (error) {
    console.error("OpenAI violation generation failed", error);
    return [];
  }
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

function calculateComplianceScore(violations: ComplianceViolation[]) {
  if (!violations.length) return 100;
  const penalty = violations.reduce((sum, violation) => sum + violation.riskScore * 35, 0);
  return Math.max(0, Math.round(100 - penalty));
}

function normalizeFinding(raw: any, fallback: { market: string; shopDomain: string }): ComplianceFinding {
  const productId = raw?.productId ?? raw?.id ?? "unknown";
  const market = raw?.market ?? fallback.market;
  const violations = Array.isArray(raw?.violations)
    ? raw.violations
        .map((violation: any) => normalizeViolation(violation, market))
        .filter((violation): violation is ComplianceViolation => Boolean(violation.issue))
    : legacyViolationsFromIssues(raw, market);

  return {
    productId,
    legacyResourceId: raw?.legacyResourceId ?? undefined,
    productTitle: raw?.productTitle ?? raw?.title ?? "Untitled product",
    market,
    shopDomain: raw?.shopDomain ?? fallback.shopDomain,
    violations,
    complianceScore:
      typeof raw?.complianceScore === "number" ? raw.complianceScore : calculateComplianceScore(violations),
    status: raw?.status ?? (violations.length ? "flagged" : "clean"),
  };
}

function legacyViolationsFromIssues(raw: any, market: string): ComplianceViolation[] {
  if (!Array.isArray(raw?.issues) || raw.issues.length === 0) return [];
  const lawReference = getMarketLawReference(market);
  return raw.issues.map((issue: string) => ({
    issue,
    policy: raw?.policyArea ? `Google Ads – ${raw.policyArea}` : "Google Ads restricted content",
    law: lawReference.law,
    severity: "Medium",
    riskScore: 0.5,
    suggestion: "Update the copy to remove or soften this claim.",
    sourceUrl: lawReference.url,
  }));
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
    sourceUrl: raw.sourceUrl ?? getMarketLawReference(market).url,
  };
}

function normalizeSeverity(value: unknown): ComplianceViolation["severity"] {
  if (typeof value !== "string") return "Medium";
  const upper = value.toLowerCase();
  if (upper === "high") return "High";
  if (upper === "low") return "Low";
  return "Medium";
}

function toSeverityLabel(value: PolicyRule["severity"]): ComplianceViolation["severity"] {
  return value === "high" ? "High" : value === "low" ? "Low" : "Medium";
}

function severityTone(severity: ComplianceViolation["severity"]) {
  if (severity === "High") return "critical";
  if (severity === "Medium") return "warning";
  return "success";
}

function severityToRiskScore(severity: ComplianceViolation["severity"]) {
  if (severity === "High") return 0.92;
  if (severity === "Medium") return 0.6;
  return 0.3;
}

function riskTone(score: number) {
  if (score >= 0.75) return "critical";
  if (score >= 0.4) return "warning";
  return "success";
}

function formatRisk(score: number) {
  return `${Math.round(clampRiskScore(score) * 100)}%`;
}

function clampRiskScore(score: number) {
  if (Number.isNaN(score)) return 0.5;
  return Math.min(1, Math.max(0, score));
}

function getMarketLawReference(market: string) {
  const key = market.toLowerCase();
  return MARKET_LAW_REFERENCES[key] ?? MARKET_LAW_REFERENCES.default;
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

function stripHtml(raw: string) {
  return raw.replace(/<[^>]*>?/g, " ").replace(/\s+/g, " ").trim();
}

function getMetricCards(metrics: ReturnType<typeof buildMetrics>) {
  const computed = buildMetrics(metrics);
  return [
    {
      title: "Products Scanned",
      value: computed.productsScanned,
      description: "Items analyzed for Google Ads and legal compliance.",
      icon: ProductIcon,
    },
    {
      title: "Violations Found",
      value: computed.violations,
      description: "Policy or local law issues detected in this scan.",
      icon: AlertCircleIcon,
    },
    {
      title: "Compliance Score",
      value: `${computed.complianceScore}%`,
      description: "Average approval likelihood for this market.",
      icon: CheckCircleIcon,
    },
  ];
}

function buildMetrics(metrics: {
  complianceScore: number;
  violations: number;
  productsScanned: number;
  timestamp: string;
  market: string;
} | null) {
  if (!metrics) {
    return {
      complianceScore: 0,
      violations: 0,
      productsScanned: 0,
    };
  }
  return metrics;
}
