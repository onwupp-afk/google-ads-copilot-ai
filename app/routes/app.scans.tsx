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
  DataTable,
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
  TextField,
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

const PRODUCT_UPDATE_MUTATION = `#graphql
  mutation UpdateProduct($input: ProductInput!) {
    productUpdate(input: $input) {
      product { id }
      userErrors { field message }
    }
  }
`;

export type PhraseSuggestion = {
  original: string;
  replacement: string;
  reason: string;
};

export type ComplianceFinding = {
  productId: string;
  legacyResourceId?: string;
  productTitle: string;
  market: string;
  matchedKeywords: string[];
  issues: string[];
  policyArea: string;
  phrases: PhraseSuggestion[];
  complianceScore: number;
  status: "flagged" | "clean";
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
  const intent = formData.get("intent");
  const market = (formData.get("market")?.toString() ?? "uk").toLowerCase();
  const productId = formData.get("productId")?.toString();
  const phrasesPayload = formData.get("phrases")?.toString();

  const { admin, session } = await authenticate.admin(request);

  if (intent === "applySuggestion") {
    if (!productId || !phrasesPayload) {
      return json({ error: "Missing product or suggestions" }, { status: 400 });
    }

    let phrases: PhraseSuggestion[] = [];
    try {
      phrases = JSON.parse(phrasesPayload) as PhraseSuggestion[];
    } catch {
      return json({ error: "Invalid suggestion payload" }, { status: 400 });
    }

    if (!phrases.length) {
      return json({ error: "No suggestions to apply" }, { status: 400 });
    }

    const descriptionResponse = await admin.graphql(
      `#graphql
        query ProductDescription($id: ID!) {
          product(id: $id) {
            descriptionHtml
          }
        }
      `,
      { variables: { id: productId } },
    );
    const descriptionBody = await descriptionResponse.json();
    const currentHtml = descriptionBody?.data?.product?.descriptionHtml ?? "";
    const updatedHtml = applyPhraseSuggestions(currentHtml, phrases);

    const response = await admin.graphql(PRODUCT_UPDATE_MUTATION, {
      variables: {
        input: {
          id: productId,
          descriptionHtml: updatedHtml,
        },
      },
    });
    const body = await response.json();
    const errors = body?.data?.productUpdate?.userErrors;
    if (errors?.length) {
      return json({ error: errors[0].message }, { status: 400 });
    }
    return json({ applied: true });
  }

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
  const applyFetcher = useFetcher<typeof action>();

  const [history, setHistory] = useState<SerializedScan[]>(scans);
  const [selectedScanId, setSelectedScanId] = useState<string | null>(scans[0]?.id ?? null);
  const [market, setMarket] = useState<string>("uk");
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
  const [phraseDrafts, setPhraseDrafts] = useState<Record<string, PhraseSuggestion[]>>({});
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
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

  useEffect(() => {
    if (applyFetcher.state === "idle") {
      if (applyFetcher.data?.applied) {
        setStatusMessage("AI suggestion applied to product description");
      } else if (applyFetcher.data?.error) {
        setStatusMessage(applyFetcher.data.error);
      }
    }
  }, [applyFetcher.state, applyFetcher.data]);

  const displayedScan = useMemo(() => {
    if (!selectedScanId) return history[0];
    return history.find((scan) => scan.id === selectedScanId) ?? history[0];
  }, [history, selectedScanId]);

  useEffect(() => {
    if (displayedScan) {
      const drafts: Record<string, PhraseSuggestion[]> = {};
      displayedScan.results.forEach((result) => {
        drafts[result.productId] = result.phrases ?? [];
      });
      setPhraseDrafts(drafts);
      setCurrentPage(0);
    }
  }, [displayedScan?.id]);

  const isScanning = runScanFetcher.state !== "idle";
  const applyingProductId =
    applyFetcher.state !== "idle" ? applyFetcher.formData?.get("productId")?.toString() : null;

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

  const handleReplacementChange = (productId: string, phraseIndex: number, value: string) => {
    setPhraseDrafts((prev) => {
      const existing = prev[productId] ? [...prev[productId]] : [];
      if (!existing[phraseIndex]) return prev;
      existing[phraseIndex] = { ...existing[phraseIndex], replacement: value };
      return { ...prev, [productId]: existing };
    });
  };

  const rows = visibleResults.map((result) => [
    <Text key={`${result.productId}-title`} variant="bodyMd">{result.productTitle}</Text>,
    <div key={`${result.productId}-issues`}>
      {result.issues.length === 0 ? (
        <Badge tone="success">Clean</Badge>
      ) : (
        <Stack gap="200">
          {result.issues.map((issue) => (
            <Text key={`${result.productId}-${issue}`} as="span" tone="critical">
              {issue}
            </Text>
          ))}
        </Stack>
      )}
    </div>,
    <div key={`${result.productId}-phrases`}>
      {(phraseDrafts[result.productId] ?? []).length === 0 ? (
        <Text tone="subdued">No problematic phrases detected.</Text>
      ) : (
        phraseDrafts[result.productId].map((phrase, index) => (
          <div key={`${result.productId}-phrase-${index}`} style={{ marginBottom: "var(--p-space-300)" }}>
            <Text variant="bodySm" tone="critical">
              Flagged: {phrase.original || "(phrase not found)"}
            </Text>
            <TextField
              labelHidden
              label={`Replacement ${index + 1}`}
              value={phrase.replacement}
              onChange={(value) => handleReplacementChange(result.productId, index, value)}
              multiline
            />
            <Text variant="bodySm" tone="subdued">
              {phrase.reason}
            </Text>
          </div>
        ))
      )}
    </div>,
    <InlineStack key={`${result.productId}-actions`} gap="200" blockAlign="center">
      <applyFetcher.Form method="post">
        <input type="hidden" name="intent" value="applySuggestion" />
        <input type="hidden" name="productId" value={result.productId} />
        <input
          type="hidden"
          name="phrases"
          value={JSON.stringify(phraseDrafts[result.productId] ?? [])}
        />
        <Button
          size="slim"
          submit
          disabled={
            (phraseDrafts[result.productId] ?? []).length === 0 ||
            (applyFetcher.state !== "idle" && applyingProductId === result.productId)
          }
        >
          {applyingProductId === result.productId && applyFetcher.state !== "idle" ? (
            <InlineStack gap="100" blockAlign="center">
              <Spinner size="small" />
              <span>Applying…</span>
            </InlineStack>
          ) : (
            "Apply AI Fix"
          )}
        </Button>
      </applyFetcher.Form>
      <Button size="slim" variant="plain">
        Edit & Apply
      </Button>
    </InlineStack>,
  ]);

  return (
    <>
      <Layout>
        <Layout.Section>
          <Text variant="headingLg" as="h1">
            AI Compliance Scan
          </Text>
          <Text tone="subdued" as="p">
            Scan {displayedScan?.shopDomain ?? "your store"}'s catalog for Google Ads and regional policy violations across products,
            descriptions, metadata, and theme content.
          </Text>
        </Layout.Section>
        <Layout.Section>
          <Banner status="info">
            This AI-powered scan uses OpenAI to stay up to date with the latest Google Ads and local law policies automatically.
          </Banner>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <Stack spacing="400">
              <Select
                label="Select market to scan"
                options={MARKETS}
                value={market}
                onChange={setMarket}
              />
              <Text as="p" tone="subdued">
                Scanning Google Ads policies and local laws for the selected market…
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
        {!aiConnected && (
          <Banner status="critical" title="AI connection failed">
            <p>We couldn’t connect to OpenAI. Please check your API key or try again later.</p>
          </Banner>
        )}
      </Layout.Section>

      <Layout.Section>
        <Layout>
          {getMetricCards(metrics).map((metric, index) => (
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
              This scan reviews your product titles, descriptions, URLs, meta data, and theme content for restricted terms, misleading
              claims, or policy violations. It uses AI to analyze Google Ads and local law guidelines in real time.
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

        {statusMessage && (
          <Layout.Section>
            <Banner status="success" onDismiss={() => setStatusMessage(null)}>
              {statusMessage}
            </Banner>
          </Layout.Section>
        )}

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
                    Review flagged products and apply AI powered fixes instantly.
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
                <DataTable
                  columnContentTypes={["text", "text", "text", "text"]}
                  headings={["Product", "Issues", "AI Suggestion", "Actions"]}
                  rows={rows}
                />
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
            Batch remediation, scheduling, and policy exports are available on the Growth and Agency plans. Contact support to enable
            these features.
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
  return {
    ...scan,
    startedAt: scan.startedAt.toISOString(),
    completedAt: scan.completedAt ? scan.completedAt.toISOString() : null,
    results: (scan.results as ComplianceFinding[] | null) ?? [],
  };
}

function applyPhraseSuggestions(html: string, phrases: PhraseSuggestion[]) {
  if (!phrases.length) return html;
  return phrases.reduce((acc, phrase) => {
    if (!phrase.original || !phrase.replacement) return acc;
    const regex = new RegExp(escapeRegExp(phrase.original), "gi");
    return acc.replace(regex, phrase.replacement);
  }, html);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function runComplianceScan({ admin, session, market }: any) {
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
    const finding = await analyzeProduct({ product, rules, market, openAiClient });
    results.push(finding);
  }

  const violations = results.filter((result) => result.status === "flagged").length;
  const complianceScore = results.length
    ? Math.round(results.reduce((sum, r) => sum + r.complianceScore, 0) / results.length)
    : 100;

  const saved = await prisma.scan.create({
    data: {
      shopDomain: session.shop,
      market,
      complianceScore,
      violations,
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
    if (!hasNextPage) break;
  }

  return products;
}

async function analyzeProduct({
  product,
  rules,
  market,
  openAiClient,
}: {
  product: any;
  rules: PolicyRule[];
  market: string;
  openAiClient: any;
}): Promise<ComplianceFinding> {
  const plainDescription = stripHtml(product.descriptionHtml ?? "");
  const metafieldsText = (product.metafields?.edges ?? [])
    .map((edge: any) => `${edge.node.namespace} ${edge.node.key} ${edge.node.value}`)
    .join(" ");
  const combined = `${product.title}\n${plainDescription}\n${product.tags?.join(" ") ?? ""}\n${metafieldsText}`.toLowerCase();

  const matches = detectPolicyMatches(combined, rules);
  const issues = matches.map((match) => `${match.rule.category}: ${match.rule.description}`);

  const severityScore = matches.reduce((sum, match) => sum + (match.rule.severity === "high" ? 30 : match.rule.severity === "medium" ? 15 : 5), 0);
  const complianceScore = Math.max(0, 100 - severityScore);
  const status: "flagged" | "clean" = issues.length ? "flagged" : "clean";
  const fallbackSuggestions: PhraseSuggestion[] = matches.length
    ? matches.map((match) => ({
        original: match.matchingWords[0] ?? "",
        replacement: `Replace "${match.matchingWords[0]}" with compliant phrasing`,
        reason: match.rule.description,
      }))
    : [];

  const phraseSuggestions = matches.length
    ? await buildAiSuggestions({
        openAiClient,
        market,
        productTitle: product.title,
        description: plainDescription,
        fallback: fallbackSuggestions,
      })
    : [];

  return {
    productId: product.id,
    legacyResourceId: product.legacyResourceId?.toString(),
    productTitle: product.title,
    market,
    matchedKeywords: matches.flatMap((match) => match.matchingWords),
    issues,
    policyArea: matches.map((m) => m.rule.category).join(", ") || "None",
    phrases: phraseSuggestions,
    complianceScore,
    status,
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

async function buildAiSuggestions({
  openAiClient,
  market,
  productTitle,
  description,
  fallback,
}: {
  openAiClient: any;
  market: string;
  productTitle: string;
  description: string;
  fallback: PhraseSuggestion[];
}): Promise<PhraseSuggestion[]> {
  if (!openAiClient) return fallback;

  try {
    const completion = await openAiClient.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are a Google Ads and local law compliance reviewer. Identify risky phrases and offer compliant replacements. Limit replacements to short snippets (max 15 words).",
        },
        {
          role: "user",
          content: `Market: ${market.toUpperCase()}\nProduct: ${productTitle}\nDescription: ${description}\nReturn JSON {"phrases": [{"original":"", "replacement":"", "reason":""}, ...]}. Only include phrases that actually appear in the text.`,
        },
      ],
    });

    const content = completion.choices?.[0]?.message?.content;
    if (!content) return fallback;
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed.phrases)) {
      return parsed.phrases.filter((phrase: any) => phrase?.original && phrase?.replacement);
    }
    return fallback;
  } catch (error) {
    console.error("OpenAI phrase generation failed", error);
    return fallback;
  }
}

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
