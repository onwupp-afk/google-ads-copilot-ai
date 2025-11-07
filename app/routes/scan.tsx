import type { LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AppProvider as PolarisAppProvider,
  Badge,
  Banner,
  Button,
  CalloutCard,
  Card,
  DataTable,
  Divider,
  Frame,
  Icon,
  InlineStack,
  Layout,
  LegacyStack as Stack,
  Link,
  Modal,
  Navigation,
  Page,
  Select,
  SkeletonBodyText,
  SkeletonDisplayText,
  Spinner,
  Text,
  TopBar,
} from "@shopify/polaris";
import en from "@shopify/polaris/locales/en.json";
import {
  AlertCircleIcon,
  CheckCircleIcon,
  ProductIcon,
} from "@shopify/polaris-icons";
import { AppProvider as ShopifyAppProvider } from "@shopify/shopify-app-remix/react";
import { authenticate } from "../shopify.server";

const MARKETS = [
  { label: "United Kingdom", value: "uk" },
  { label: "United States", value: "us" },
  { label: "Germany", value: "de" },
  { label: "Australia", value: "au" },
  { label: "Canada", value: "ca" },
];

const MARKET_METRICS: Record<string, { scanned: number; violations: number; compliance: number }> = {
  uk: { scanned: 1248, violations: 23, compliance: 98 },
  us: { scanned: 2160, violations: 45, compliance: 96 },
  de: { scanned: 980, violations: 12, compliance: 99 },
  au: { scanned: 640, violations: 9, compliance: 97 },
  ca: { scanned: 870, violations: 18, compliance: 95 },
};

const MOCK_RESULTS = [
  {
    id: "prod-1",
    product: "Advanced Collagen Serum",
    market: "uk",
    policyArea: "Medical Claims",
    issue: "Contains unapproved medical cure claims.",
    suggestion: "Tone down language to describe cosmetic benefits instead of cures.",
  },
  {
    id: "prod-2",
    product: "CBD Night Oil",
    market: "us",
    policyArea: "Restricted Content",
    issue: "CBD mention without FDA disclaimer.",
    suggestion: "Add compliant disclaimer and remove medical guarantees.",
  },
  {
    id: "prod-3",
    product: "Thermal Compression Wrap",
    market: "de",
    policyArea: "Regulated Devices",
    issue: "Missing CE certification reference in listing.",
    suggestion: "Add CE compliance statement and usage disclaimer.",
  },
  {
    id: "prod-4",
    product: "Organic Baby Formula",
    market: "au",
    policyArea: "Local Law",
    issue: "Advertising infant nutrition with restricted phrasing.",
    suggestion: "Use approved AU wording and link to origin certificate.",
  },
];

const PAGE_SIZE_OPTIONS = [
  { label: "10 per page", value: "10" },
  { label: "25 per page", value: "25" },
  { label: "50 per page", value: "50" },
  { label: "100 per page", value: "100" },
];

const motionVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0 },
};

function buildLoginRedirect(url: URL) {
  const shopParam =
    url.searchParams.get("shop") ?? process.env.SHOP_DOMAIN ?? undefined;
  if (shopParam) {
    return redirect(`/auth/login?shop=${shopParam}`);
  }
  throw new Response("Missing shop parameter", { status: 400 });
}

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const host = url.searchParams.get("host");

  try {
    const { session } = await authenticate.admin(request);
    const shop = session?.shop;
    if (!shop) {
      return buildLoginRedirect(url);
    }
    return json({
      apiKey: process.env.SHOPIFY_API_KEY || "",
      host,
      shop,
      shopName: shop.replace(".myshopify.com", ""),
    });
  } catch (error) {
    return buildLoginRedirect(url);
  }
}

export default function ScanPage() {
  const { apiKey, host, shop, shopName } = useLoaderData<typeof loader>();
  const [selectedMarket, setSelectedMarket] = useState(MARKETS[0].value);
  const [isScanning, setIsScanning] = useState(false);
  const [scanComplete, setScanComplete] = useState(false);
  const [scanTimestamp, setScanTimestamp] = useState<Date | null>(null);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_OPTIONS[0].value);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const metrics = MARKET_METRICS[selectedMarket] ?? MARKET_METRICS.uk;

  const filteredResults = useMemo(
    () =>
      MOCK_RESULTS.filter((result) => result.market === selectedMarket).slice(
        0,
        Number(pageSize),
      ),
    [selectedMarket, pageSize],
  );

  const handleMarketChange = useCallback((value: string) => {
    setSelectedMarket(value);
    setScanComplete(false);
    setScanTimestamp(null);
  }, []);

  const handleRunScan = useCallback(() => {
    if (isScanning) return;
    setIsScanning(true);
    setScanComplete(false);
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      setIsScanning(false);
      setScanComplete(true);
      setScanTimestamp(new Date());
    }, 2200);
  }, [isScanning]);

  const handleApplyFix = useCallback((id: string) => {
    console.info("Applying AI fix", id);
  }, []);

  const handleEditAndApply = useCallback((id: string) => {
    console.info("Opening editor for", id);
  }, []);

  const handleApplyAll = useCallback(() => {
    setShowUpgradeModal(true);
  }, []);

  const closeUpgradeModal = useCallback(() => setShowUpgradeModal(false), []);

  const metricCards = [
    {
      title: "Products Scanned",
      value: metrics.scanned.toLocaleString(),
      description: "Items analyzed for Google Ads and local law compliance.",
      icon: ProductIcon,
    },
    {
      title: "Violations Detected",
      value: metrics.violations.toLocaleString(),
      description: "Detected potential issues in product listings.",
      icon: AlertCircleIcon,
    },
    {
      title: "Compliant Products",
      value: `${metrics.compliance}%`,
      description: "Currently approved and policy-aligned.",
      icon: CheckCircleIcon,
    },
  ];

  const resultRows = filteredResults.map((result) => [
    result.product,
    result.policyArea,
    result.issue,
    result.suggestion,
    <InlineStack key={`${result.id}-actions`} gap="200">
      <Button size="slim" onClick={() => handleApplyFix(result.id)}>
        Apply AI Fix
      </Button>
      <Button size="slim" variant="plain" onClick={() => handleEditAndApply(result.id)}>
        Edit & Apply
      </Button>
    </InlineStack>,
  ]);

  const navigationMarkup = (
    <Navigation location="/scan">
      <Navigation.Section
        items={[
          { label: "Dashboard", url: "/app" },
          { label: "Scans", url: "/scan", selected: true },
          { label: "Settings", url: "/app/settings" },
          { label: "Support", url: "mailto:support@aithorapp.co.uk" },
        ]}
      />
    </Navigation>
  );

  const topBarMarkup = (
    <TopBar
      contextControl={
        <InlineStack gap="200" blockAlign="center">
          <Text as="span" variant="headingSm">
            {shop.replace(".myshopify.com", "")}
          </Text>
          <Badge tone="success">Connected</Badge>
        </InlineStack>
      }
      secondaryMenu={<Button url="/app/settings">Upgrade</Button>}
    />
  );

  const scanDescription =
    "This scan reviews your product titles, descriptions, URLs, meta data, and theme content for restricted terms, misleading claims, or policy violations. It uses AI to analyze Google Ads and local law guidelines in real time.";

  return (
    <ShopifyAppProvider apiKey={apiKey} host={host ?? undefined} isEmbeddedApp>
      <PolarisAppProvider i18n={en}>
        <Frame navigation={navigationMarkup} topBar={topBarMarkup}>
          <Page
            title="AI Compliance Scan"
            subtitle="Scan your Shopify store for Google Ads and regional policy violations — across product listings, descriptions, metadata, and theme content."
          >
            <Layout>
              <Layout.Section>
                <Banner status="info">
                  This AI-powered scan uses OpenAI to stay up to date with the latest Google Ads and local law policies automatically.
                </Banner>
              </Layout.Section>

              <Layout.Section>
                <Divider />
              </Layout.Section>

              <Layout.Section>
                <Card>
                  <Stack spacing="400">
                    <Select
                      label="Select Market to Scan"
                      options={MARKETS}
                      value={selectedMarket}
                      onChange={handleMarketChange}
                    />
                    <Text as="p" tone="subdued">
                      Scanning Google Ads policies and local laws for the selected market…
                    </Text>
                  </Stack>
                </Card>
              </Layout.Section>

              <Layout.Section>
                <Layout>
                  {metricCards.map((metric, index) => (
                    <Layout.Section key={metric.title} variant="oneThird">
                      <motion.div
                        variants={motionVariants}
                        initial="hidden"
                        animate="visible"
                        transition={{ delay: 0.1 * index }}
                      >
                        <Card>
                          <Stack spacing="400" alignment="center">
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
                      </motion.div>
                    </Layout.Section>
                  ))}
                </Layout>
              </Layout.Section>

              <Layout.Section>
                <Card title="Run New Scan" sectioned>
                  <Text as="p" tone="subdued">
                    {scanDescription}
                  </Text>
                  <InlineStack gap="300" blockAlign="center" style={{ marginTop: "var(--p-space-400)" }}>
                    <Button onClick={handleRunScan} primary disabled={isScanning}>
                      {isScanning ? (
                        <InlineStack gap="200" blockAlign="center">
                          <Spinner size="small" />
                          <span>Scanning…</span>
                        </InlineStack>
                      ) : (
                        "Run Scan Now"
                      )}
                    </Button>
                    {scanTimestamp && !isScanning ? (
                      <Text as="span" tone="subdued">
                        Last scan: {scanTimestamp.toLocaleString()}
                      </Text>
                    ) : null}
                  </InlineStack>
                  {isScanning && (
                    <div style={{ marginTop: "var(--p-space-400)" }}>
                      <SkeletonDisplayText size="small" />
                      <SkeletonBodyText lines={3} />
                    </div>
                  )}
                </Card>
              </Layout.Section>

              <Layout.Section>
                <Card title="About Our AI Engine" sectioned>
                  <Stack spacing="400">
                    <Text as="p">
                      Powered by OpenAI, our system continuously checks Google Ads and regional law sources to ensure your compliance checks are always current.
                    </Text>
                    <InlineStack gap="200">
                      <Badge tone="info">GPT-5 Intelligence</Badge>
                      <Badge tone="success">Auto-updating</Badge>
                      <Badge tone="attention">Law Synced</Badge>
                    </InlineStack>
                  </Stack>
                </Card>
              </Layout.Section>

              {scanComplete && (
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
                          <Button onClick={handleApplyAll}>Apply All AI Suggestions</Button>
                          <Text as="span" tone="subdued">
                            Upgrade required for automatic remediation.
                          </Text>
                        </InlineStack>
                        <Select
                          labelHidden
                          label="Rows per page"
                          options={PAGE_SIZE_OPTIONS}
                          value={pageSize}
                          onChange={setPageSize}
                        />
                      </InlineStack>
                      <DataTable
                        columnContentTypes={["text", "text", "text", "text", "text"]}
                        headings={["Product", "Policy Area", "Issue", "AI Suggestion", "Actions"]}
                        rows={resultRows}
                      />
                      <Text as="span" tone="subdued">
                        Showing {filteredResults.length} of {filteredResults.length} results for this market.
                      </Text>
                    </Stack>
                  </Card>
                </Layout.Section>
              )}
            </Layout>
          </Page>

          <Modal
            open={showUpgradeModal}
            onClose={closeUpgradeModal}
            title="Upgrade your plan to automatically apply AI compliance fixes"
            primaryAction={{
              content: "Upgrade Plan",
              onAction: () => {
                console.info("Upgrade flow");
                closeUpgradeModal();
              },
            }}
            secondaryActions={[{ content: "Not now", onAction: closeUpgradeModal }]}
          >
            <Modal.Section>
              <Text as="p" tone="subdued">
                Unlock 1-click remediation, historical scanning, and legal export packs with our Growth and Agency plans.
              </Text>
              <Link url="mailto:sales@aithorapp.co.uk">Talk to compliance support</Link>
            </Modal.Section>
          </Modal>
        </Frame>
      </PolarisAppProvider>
    </ShopifyAppProvider>
  );
}
