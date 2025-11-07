import { motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useOutletContext } from "@remix-run/react";
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
  Select,
  SkeletonBodyText,
  SkeletonDisplayText,
  Spinner,
  Text,
  TextField,
} from "@shopify/polaris";
import {
  AlertCircleIcon,
  CheckCircleIcon,
  ProductIcon,
} from "@shopify/polaris-icons";
import type { AppContext } from "./app";

const MARKETS = [
  { label: "United Kingdom", value: "uk" },
  { label: "United States", value: "us" },
  { label: "European Union", value: "eu" },
  { label: "Australia", value: "au" },
  { label: "Canada", value: "ca" },
];

const MARKET_METRICS: Record<string, { scanned: number; issues: number; fixes: number }> = {
  uk: { scanned: 1248, issues: 23, fixes: 17 },
  us: { scanned: 2134, issues: 41, fixes: 36 },
  eu: { scanned: 980, issues: 12, fixes: 10 },
  au: { scanned: 642, issues: 9, fixes: 8 },
  ca: { scanned: 870, issues: 18, fixes: 16 },
};

const MOCK_FINDINGS = [
  {
    id: "prod-1",
    market: "uk",
    title: "CBD Night Drops",
    issue: "Medical claims flagged for restricted content.",
    policy: "Restricted Content",
    suggestion: "Replace medical promises with general wellness messaging.",
  },
  {
    id: "prod-2",
    market: "us",
    title: "Organic Baby Formula",
    issue: "Missing FDA compliant disclaimer for infant nutrition.",
    policy: "Medical Claims",
    suggestion: "Add required disclaimer and remove cure language.",
  },
  {
    id: "prod-3",
    market: "eu",
    title: "Thermal Compression Wrap",
    issue: "CE certification reference missing from description.",
    policy: "Regulated Device",
    suggestion: "Include CE ID and approved usage statement.",
  },
  {
    id: "prod-4",
    market: "au",
    title: "Herbal Health Booster",
    issue: "Contains wording banned by TGA advertising code.",
    policy: "Local Law",
    suggestion: "Swap to approved AU phrasing and cite source.",
  },
];

const PAGE_SIZE_OPTIONS = [
  { label: "10 rows", value: "10" },
  { label: "25 rows", value: "25" },
  { label: "50 rows", value: "50" },
  { label: "100 rows", value: "100" },
];

const metricVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0 },
};

export default function AppScansPage() {
  const { shop } = useOutletContext<AppContext>();
  const shopName = shop.replace(".myshopify.com", "");
  const [selectedMarket, setSelectedMarket] = useState(MARKETS[0].value);
  const [isScanning, setIsScanning] = useState(false);
  const [scanComplete, setScanComplete] = useState(false);
  const [scanTimestamp, setScanTimestamp] = useState<Date | null>(null);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_OPTIONS[0].value);
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
  const [findings, setFindings] = useState(MOCK_FINDINGS);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => timeoutRef.current && clearTimeout(timeoutRef.current), []);

  const metrics = MARKET_METRICS[selectedMarket] ?? MARKET_METRICS.uk;

  const filteredFindings = useMemo(
    () =>
      findings
        .filter((finding) => finding.market === selectedMarket)
        .slice(0, Number(pageSize)),
    [findings, selectedMarket, pageSize],
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
    timeoutRef.current && clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setIsScanning(false);
      setScanComplete(true);
      setScanTimestamp(new Date());
    }, 1800);
  }, [isScanning]);

  const updateSuggestion = useCallback((id: string, value: string) => {
    setFindings((current) =>
      current.map((finding) => (finding.id === id ? { ...finding, suggestion: value } : finding)),
    );
  }, []);

  const handleApplyFix = useCallback((id: string) => {
    console.info("Applying AI fix for", id);
  }, []);

  const openUpgradeModal = useCallback(() => setUpgradeModalOpen(true), []);
  const closeUpgradeModal = useCallback(() => setUpgradeModalOpen(false), []);

  const scanDescription =
    "This scan reviews your product titles, descriptions, URLs, meta data, and theme content for restricted terms, misleading claims, or policy violations. It uses AI to analyze Google Ads and local law guidelines in real time.";

  const dataRows = filteredFindings.map((finding) => [
    finding.title,
    finding.issue,
    <TextField
      key={`${finding.id}-suggestion`}
      value={finding.suggestion}
      onChange={(value) => updateSuggestion(finding.id, value)}
      multiline
    />,
    <InlineStack key={`${finding.id}-actions`} gap="200">
      <Button size="slim" onClick={() => handleApplyFix(finding.id)}>
        Apply Fix
      </Button>
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
            Scan {shopName}'s catalog for Google Ads and regional policy violations across products, descriptions, metadata, and theme
            content.
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
            {[
              {
                title: "Products Scanned",
                value: metrics.scanned.toLocaleString(),
                description: "Items analyzed for Google Ads and local law compliance.",
                icon: ProductIcon,
              },
              {
                title: "Issues Found",
                value: metrics.issues.toLocaleString(),
                description: "Policy or legal violations detected this scan.",
                icon: AlertCircleIcon,
              },
              {
                title: "AI Fixes Suggested",
                value: metrics.fixes.toLocaleString(),
                description: "Draft remediations generated by our AI assistant.",
                icon: CheckCircleIcon,
              },
            ].map((metric, index) => (
              <Layout.Section key={metric.title} variant="oneThird">
                <motion.div
                  variants={metricVariants}
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
                  "Run Compliance Scan"
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

        {scanComplete && (
          <Layout.Section>
            <Card>
              <Stack spacing="400">
                <div>
                  <Text variant="headingLg" as="h2">
                    Scan Results
                  </Text>
                  <Text as="p" tone="subdued">
                    Review flagged items, refine AI suggestions, and apply fixes before publishing to Google Ads.
                  </Text>
                </div>
                <Divider />
                <InlineStack align="space-between" blockAlign="center">
                  <InlineStack gap="200" blockAlign="center">
                    <Button onClick={openUpgradeModal}>Apply All AI Fixes</Button>
                    <Text as="span" tone="subdued">
                      Upgrade required for 1-click remediation.
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
                  columnContentTypes={["text", "text", "text", "text"]}
                  headings={["Product", "Issue", "AI Suggestion", "Actions"]}
                  rows={dataRows}
                />
              </Stack>
            </Card>
          </Layout.Section>
        )}

        <Layout.Section>
          <Card sectioned>
            <Text as="p" tone="subdued">
              Powered by OpenAI — our engine continuously checks Google Ads documentation, Merchant Center policies, and regional legal databases to keep your scans fresh.
            </Text>
            <Link url="mailto:support@aithorapp.co.uk">Questions? Contact compliance support.</Link>
          </Card>
        </Layout.Section>
      </Layout>

      <Modal
        open={upgradeModalOpen}
        onClose={closeUpgradeModal}
        title="Upgrade your plan to automatically apply AI compliance fixes"
        primaryAction={{ content: "Upgrade Plan", onAction: closeUpgradeModal }}
        secondaryActions={[{ content: "Not now", onAction: closeUpgradeModal }]}
      >
        <Modal.Section>
          <Text as="p" tone="subdued">
            Batch remediation, scheduling, and policy exports are available on the Growth and Agency plans.
          </Text>
        </Modal.Section>
      </Modal>
    </>
  );
}
