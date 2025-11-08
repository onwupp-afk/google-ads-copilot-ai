import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useFetcher, useLoaderData } from "@remix-run/react";
import type { ProductScanHistory, Scan } from "@prisma/client";
import {
  ActionList,
  Badge,
  Banner,
  Button,
  Card,
  Checkbox,
  Collapsible,
  Divider,
  Icon,
  InlineStack,
  Layout,
  LegacyStack as Stack,
  Link,
  Modal,
  Pagination,
  Popover,
  Select,
  SkeletonBodyText,
  SkeletonDisplayText,
  Spinner,
  Text,
  TextField,
  Thumbnail,
  Tooltip as PolarisTooltip,
} from "@shopify/polaris";
import { AlertCircleIcon, CheckCircleIcon, ProductIcon } from "@shopify/polaris-icons";
import { Line, LineChart, ResponsiveContainer, Tooltip as RechartTooltip, XAxis, YAxis } from "recharts";
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
        featuredImage {
          url
          altText
        }
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

type ScanIntent = "startScan" | "rescanProduct";

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
  status: "flagged" | "clean";
  aiRewrite?: {
    title?: string;
    description?: string;
  };
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

export type SerializedProductHistory = Omit<ProductScanHistory, "createdAt"> & {
  createdAt: string;
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const [scans, aiStatus, shopRecord, productHistory] = await Promise.all([
    prisma.scan.findMany({
      where: { shopDomain: session.shop },
      orderBy: { startedAt: "desc" },
      take: 5,
    }),
    testConnection(),
    prisma.shop.findUnique({ where: { domain: session.shop } }),
    prisma.productScanHistory.findMany({
      where: { shopDomain: session.shop },
      orderBy: { createdAt: "asc" },
      take: 500,
    }),
  ]);

  return json({
    scans: scans.map(serializeScan),
    aiConnected: Boolean(aiStatus),
    plan: shopRecord?.plan ?? "free",
    productHistory: productHistory.map((record) => ({
      ...record,
      createdAt: record.createdAt.toISOString(),
    })),
  });
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

  if (intent === "rescanProduct") {
    const productId = formData.get("productId")?.toString();
    const scanId = formData.get("scanId")?.toString();
    if (!productId || !scanId) {
      return json({ error: "Missing product or scan" }, { status: 400 });
    }

    const scanRecord = await prisma.scan.findUnique({ where: { id: scanId } });
    if (!scanRecord || scanRecord.shopDomain !== session.shop) {
      return json({ error: "Scan not found" }, { status: 404 });
    }

    const product = await fetchProductById(admin, productId);
    if (!product) {
      return json({ error: "Product not found" }, { status: 404 });
    }

    const finding = await analyzeProduct({
      product,
      rules: getPolicyRules(scanRecord.market),
      market: scanRecord.market,
      openAiClient: openai,
      shopDomain: session.shop,
    });

    const existingResults = (scanRecord.results as ComplianceFinding[] | undefined) ?? [];
    const updatedResults = updateResultsArray(existingResults, finding);
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

    await prisma.productScanHistory.create({
      data: {
        scanId,
        shopDomain: session.shop,
        productId: finding.productId,
        productTitle: finding.productTitle,
        market: scanRecord.market,
        riskScore: calculateProductRisk(finding.violations),
        violationsCount: finding.violations.length,
        complianceScore: finding.complianceScore,
      },
    });

    return json({ scan: serializeScan(updatedScan), rescanProductId: productId });
  }

  return json({ error: "Unsupported action" }, { status: 400 });
};

export default function AppScansPage() {
  const { scans, aiConnected, plan, productHistory } = useLoaderData<typeof loader>();
  const runScanFetcher = useFetcher<typeof action>();
  const rescanFetcher = useFetcher<typeof action>();
  const applyFixFetcher = useFetcher();

  const [history, setHistory] = useState<SerializedScan[]>(scans);
  const [selectedScanId, setSelectedScanId] = useState<string | null>(scans[0]?.id ?? null);
  const [market, setMarket] = useState<string>("uk");
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [expandedProducts, setExpandedProducts] = useState<Record<string, boolean>>({});
  const [previewProduct, setPreviewProduct] = useState<ComplianceFinding | null>(null);
  const [previewContent, setPreviewContent] = useState<string>("");
  const [manualEditEnabled, setManualEditEnabled] = useState(false);
  const [exportPopoverActive, setExportPopoverActive] = useState(false);
  const [pendingApplyProductId, setPendingApplyProductId] = useState<string | null>(null);

  const isFreePlan = !plan || plan === "free";

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
    if (rescanFetcher.state === "idle" && rescanFetcher.data?.scan) {
      setHistory((prev) => {
        const updated = prev.map((scan) => (scan.id === rescanFetcher.data.scan.id ? rescanFetcher.data.scan : scan));
        return updated;
      });
    }
  }, [rescanFetcher.state, rescanFetcher.data]);

  useEffect(() => {
    if (applyFixFetcher.state === "submitting") {
      const productId = (applyFixFetcher.formData?.get("productId") as string) ?? null;
      if (productId) {
        setPendingApplyProductId(productId);
      }
    }
    if (applyFixFetcher.state === "idle") {
      setPendingApplyProductId(null);
    }
  }, [applyFixFetcher.state, applyFixFetcher.formData]);

  const displayedScan = useMemo(() => {
    if (!history.length) return undefined;
    if (!selectedScanId) return history[0];
    return history.find((scan) => scan.id === selectedScanId) ?? history[0];
  }, [history, selectedScanId]);

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

  const historyByProduct = useMemo(() => groupHistoryByProduct(productHistory), [productHistory]);

  const toggleExpanded = useCallback((productId: string) => {
    setExpandedProducts((prev) => ({ ...prev, [productId]: !prev[productId] }));
  }, []);

  const handlePreview = useCallback((result: ComplianceFinding) => {
    setPreviewProduct(result);
    setPreviewContent(result.aiRewrite?.description ?? result.originalDescription);
    setManualEditEnabled(false);
  }, []);

  const handleApplyFix = useCallback(
    (product: ComplianceFinding, usePreviewContent = false) => {
      const description = usePreviewContent
        ? previewContent
        : product.aiRewrite?.description ?? product.originalDescription;
      applyFixFetcher.submit(
        { productId: product.productId, description },
        { method: "post", action: "/api/scan/apply" },
      );
    },
    [applyFixFetcher, previewContent],
  );

  const handleExport = useCallback(
    (format: "csv" | "pdf") => {
      if (!displayedScan || !selectedScanId || typeof window === "undefined") return;
      const url = new URL(`/api/scan/export`, window.location.origin);
      url.searchParams.set("scanId", selectedScanId);
      url.searchParams.set("market", displayedScan.market);
      url.searchParams.set("format", format);
      window.open(url.toString(), "_blank");
      setExportPopoverActive(false);
    },
    [displayedScan, selectedScanId],
  );

  const exportButton = (
    <Button
      disclosure
      onClick={() => setExportPopoverActive((prev) => !prev)}
      disabled={!displayedScan || isFreePlan}
    >
      Export Results
    </Button>
  );

  const exportActivator = isFreePlan ? (
    <PolarisTooltip content="Upgrade required" dismissOnMouseOut>
      <span>{exportButton}</span>
    </PolarisTooltip>
  ) : (
    exportButton
  );

  const exportPopover = (
    <Popover
      active={exportPopoverActive && !isFreePlan && Boolean(displayedScan)}
      onClose={() => setExportPopoverActive(false)}
      activator={exportActivator}
    >
      <ActionList
        items={[
          { content: "Export CSV", onAction: () => handleExport("csv") },
          { content: "Export PDF", onAction: () => handleExport("pdf") },
        ]}
      />
    </Popover>
  );

  return (
    <>
      <Layout>
        <Layout.Section>
          <InlineStack align="space-between" blockAlign="center">
            <div>
              <Text variant="headingLg" as="h1">
                Compliance Intelligence Dashboard
              </Text>
              <Text tone="subdued" as="p">
                Deep dive into every policy flag with market-specific citations, severity scores, and AI remediation workflows.
              </Text>
            </div>
            {exportPopover}
          </InlineStack>
        </Layout.Section>

        <Layout.Section>
          <Banner status="info">
            This AI-powered scan stays up to date with Google Ads and local law updates. Each result documents the policy, law, and risk level so your team can justify decisions quickly.
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
                We localize each scan to the selected market so policy citations and risk scoring reflect current regulations.
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
                <Button primary submit disabled={runScanFetcher.state !== "idle"}>
                  {runScanFetcher.state !== "idle" ? (
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
            {runScanFetcher.state !== "idle" && (
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
                <InlineStack align="space-between" blockAlign="center">
                  <div>
                    <Text variant="headingLg" as="h2">
                      Scan Results
                    </Text>
                    <Text as="p" tone="subdued">
                      Every violation includes Google Ads policy context, local law references, severity, and AI remediation.
                    </Text>
                  </div>
                  <InlineStack gap="200" blockAlign="center">
                    {isFreePlan ? (
                      <PolarisTooltip content="Upgrade required" dismissOnMouseOut>
                        <Button disabled>Apply All AI Suggestions</Button>
                      </PolarisTooltip>
                    ) : (
                      <Button onClick={() => setUpgradeModalOpen(true)}>Apply All AI Suggestions</Button>
                    )}
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
                </InlineStack>

                {visibleResults.length === 0 ? (
                  <Text tone="subdued">No products matched this page.</Text>
                ) : (
                  <Stack vertical spacing="400">
                    {visibleResults.map((result) => (
                      <ProductResultCard
                        key={result.productId}
                        result={result}
                        history={historyByProduct[result.productId] ?? []}
                        expanded={Boolean(expandedProducts[result.productId])}
                        toggleExpanded={() => toggleExpanded(result.productId)}
                        onPreview={() => handlePreview(result)}
                        onFix={() => handleApplyFix(result)}
                        onRescan={() => {
                          if (!displayedScan) return;
                          const formData = new FormData();
                          formData.append("intent", "rescanProduct");
                          formData.append("productId", result.productId);
                          formData.append("scanId", displayedScan.id);
                          rescanFetcher.submit(formData, { method: "post" });
                        }}
                        applying={pendingApplyProductId === result.productId && applyFixFetcher.state !== "idle"}
                      />
                    ))}
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

      <Modal
        open={Boolean(previewProduct)}
        onClose={() => setPreviewProduct(null)}
        title={previewProduct ? `AI Preview — ${previewProduct.productTitle}` : "AI Preview"}
        large
        primaryAction={{
          content: "Apply Fix",
          disabled: !previewProduct,
          onAction: () => {
            if (!previewProduct) return;
            handleApplyFix(previewProduct, true);
            setPreviewProduct(null);
          },
        }}
        secondaryActions={[{ content: "Cancel", onAction: () => setPreviewProduct(null) }]}
      >
        <Modal.Section>
          {previewProduct ? (
            <Stack vertical spacing="400">
              <Card title="Original copy">
                <Text as="p" tone="subdued">
                  {previewProduct.originalDescription}
                </Text>
              </Card>
              <Card title="AI rewrite">
                <Stack vertical spacing="300">
                  <Checkbox
                    label="Allow manual edits"
                    checked={manualEditEnabled}
                    onChange={(value) => setManualEditEnabled(value)}
                  />
                  <TextField
                    value={previewContent}
                    onChange={setPreviewContent}
                    multiline
                    autoComplete="off"
                    disabled={!manualEditEnabled}
                  />
                </Stack>
              </Card>
            </Stack>
          ) : (
            <Text tone="subdued">Select a product to preview AI fixes.</Text>
          )}
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

function ProductResultCard({
  result,
  history,
  expanded,
  toggleExpanded,
  onPreview,
  onFix,
  onRescan,
  applying,
}: {
  result: ComplianceFinding;
  history: SerializedProductHistory[];
  expanded: boolean;
  toggleExpanded: () => void;
  onPreview: () => void;
  onFix: () => void;
  onRescan: () => void;
  applying: boolean;
}) {
  const hasViolations = result.violations.length > 0;
  const highestSeverity = getHighestSeverity(result.violations);
  const summaryBadgeTone = hasViolations ? severityTone(highestSeverity) : "success";
  const summaryLabel = hasViolations ? `⚠️ ${result.violations.length} flagged` : "✅ Clean";

  const historyData = history.map((entry) => ({
    date: new Date(entry.createdAt).toLocaleDateString(),
    complianceScore: entry.complianceScore,
  }));

  return (
    <Card>
      <Card.Header
        title={result.productTitle}
        actions={[{ content: expanded ? "Hide details" : "Show details", onAction: toggleExpanded }]}
      />
      <Card.Section>
        <Stack spacing="400" alignment="center">
          <Thumbnail source={result.thumbnailUrl ?? ProductIcon} alt={result.productTitle} size="large" />
          <div style={{ flex: 1 }}>
            <InlineStack gap="200" blockAlign="center">
              <Badge tone={summaryBadgeTone}>{summaryLabel}</Badge>
              <Badge tone="info">Score {result.complianceScore}%</Badge>
            </InlineStack>
            <Text as="p" tone="subdued">
              {hasViolations
                ? `${highestSeverity} severity · ${formatRisk(calculateProductRisk(result.violations))} risk`
                : "No violations detected in this market."}
            </Text>
          </div>
          <div style={{ flexBasis: "220px", height: 120 }}>
            <ProductHistorySparkline data={historyData} />
          </div>
        </Stack>
      </Card.Section>
      <Card.Section subdued>
        <div style={{ display: "flex", gap: "var(--p-space-200)", flexWrap: "wrap" }}>
          <Button size="slim" onClick={onFix} disabled={!result.aiRewrite}>
            {applying ? (
              <InlineStack gap="100" blockAlign="center">
                <Spinner size="small" />
                <span>Fixing…</span>
              </InlineStack>
            ) : (
              "Fix with AI"
            )}
          </Button>
          <Button size="slim" onClick={onPreview} disabled={!result.aiRewrite}>
            Preview Fix
          </Button>
          <Button size="slim" onClick={onRescan}>
            {result.status === "flagged" ? "Rescan Product" : "Audit Again"}
          </Button>
        </div>
      </Card.Section>
      <Card.Section>
        <Collapsible open={expanded} id={`${result.productId}-details`}>
          <Stack vertical spacing="300">
            {hasViolations ? (
              result.violations.map((violation, index) => (
                <div key={`${result.productId}-violation-${index}`}>
                  <InlineStack align="space-between" blockAlign="center">
                    <InlineStack gap="200" blockAlign="center">
                      <Badge tone={severityTone(violation.severity)}>{violation.severity}</Badge>
                      <Badge tone={riskTone(violation.riskScore)}>
                        Risk {formatRisk(violation.riskScore)}
                      </Badge>
                    </InlineStack>
                    {violation.sourceUrl && (
                      <Link url={violation.sourceUrl} target="_blank">
                        View policy reference
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
              ))
            ) : (
              <Text tone="subdued">Everything looks compliant for this product.</Text>
            )}
          </Stack>
        </Collapsible>
      </Card.Section>
    </Card>
  );
}

function ProductHistorySparkline({ data }: { data: { date: string; complianceScore: number }[] }) {
  if (data.length < 2) {
    return (
      <div style={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center" }}>
        <Text tone="subdued" as="span">
          Not enough data
        </Text>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
        <XAxis dataKey="date" hide />
        <YAxis domain={[0, 100]} hide />
        <RechartTooltip formatter={(value) => `${value}%`} labelFormatter={(label) => `Scan: ${label}`} />
        <Line type="monotone" dataKey="complianceScore" stroke="#5c6ac4" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString();
}

function serializeScan(scan: Scan): SerializedScan {
  return {
    ...scan,
    startedAt: scan.startedAt.toISOString(),
    completedAt: scan.completedAt ? scan.completedAt.toISOString() : null,
    results: ((scan.results as ComplianceFinding[] | null) ?? []).map((raw) =>
      normalizeFinding(raw, { market: scan.market, shopDomain: scan.shopDomain }),
    ),
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

  const aggregate = buildAggregateMetrics(results);

  const saved = await prisma.scan.create({
    data: {
      shopDomain: session.shop,
      market,
      complianceScore: aggregate.complianceScore,
      violations: aggregate.totalViolations,
      productsScanned: results.length,
      status: "complete",
      completedAt: new Date(),
      results,
    },
  });

  await prisma.productScanHistory.createMany({
    data: results.map((result) => ({
      scanId: saved.id,
      shopDomain: session.shop,
      productId: result.productId,
      productTitle: result.productTitle,
      market,
      riskScore: calculateProductRisk(result.violations),
      violationsCount: result.violations.length,
      complianceScore: result.complianceScore,
    })),
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
    status: combinedViolations.length ? "flagged" : "clean",
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
}): Promise<{ violations: ComplianceViolation[]; rewrite?: { title?: string; description?: string } }> {
  if (!openAiClient) return { violations: [] };

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
Return JSON {"violations":[{"issue":"","policy":"","law":"","severity":"High|Medium|Low","riskScore":0-1,"suggestion":"","sourceUrl":""}],"rewrite":{"title":"","description":""}}.`,
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
    console.error("OpenAI violation generation failed", error);
    return { violations: [] };
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

function calculateProductRisk(violations: ComplianceViolation[]) {
  if (!violations.length) return 0;
  return clampRiskScore(
    violations.reduce((sum, violation) => sum + violation.riskScore, 0) / violations.length,
  );
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
    productHandle: raw?.productHandle,
    thumbnailUrl: raw?.thumbnailUrl ?? null,
    originalDescription: raw?.originalDescription ?? "",
    originalHtml: raw?.originalHtml,
    market,
    shopDomain: raw?.shopDomain ?? fallback.shopDomain,
    violations,
    complianceScore:
      typeof raw?.complianceScore === "number" ? raw.complianceScore : calculateComplianceScore(violations),
    status: raw?.status ?? (violations.length ? "flagged" : "clean"),
    aiRewrite: raw?.aiRewrite,
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

function getHighestSeverity(violations: ComplianceViolation[]): ComplianceViolation["severity"] {
  if (!violations.length) return "Low";
  if (violations.some((violation) => violation.severity === "High")) return "High";
  if (violations.some((violation) => violation.severity === "Medium")) return "Medium";
  return "Low";
}

function groupHistoryByProduct(records: SerializedProductHistory[]) {
  return records.reduce<Record<string, SerializedProductHistory[]>>((acc, record) => {
    if (!acc[record.productId]) {
      acc[record.productId] = [];
    }
    acc[record.productId].push(record);
    return acc;
  }, {});
}

function updateResultsArray(results: ComplianceFinding[], finding: ComplianceFinding) {
  const exists = results.find((result) => result.productId === finding.productId);
  if (exists) {
    return results.map((result) => (result.productId === finding.productId ? finding : result));
  }
  return [...results, finding];
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
