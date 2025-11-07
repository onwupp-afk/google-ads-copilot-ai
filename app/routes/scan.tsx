import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Badge,
  Banner,
  Button,
  CalloutCard,
  Card,
  DataTable,
  Divider,
  Icon,
  InlineStack,
  Layout,
  LegacyStack as Stack,
  Link,
  Modal,
  Page,
  Select,
  SkeletonBodyText,
  SkeletonDisplayText,
  Spinner,
  Text,
} from "@shopify/polaris";
import {
  AlertCircleIcon,
  CheckCircleIcon,
  ProductIcon,
} from "@shopify/polaris-icons";

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
    suggestion: "Add federally compliant disclaimer and remove medical guarantees.",
  },
  {
    id: "prod-3",
    product: "Thermal Compression Wrap",
    market: "uk",
    policyArea: "Regulated Devices",
    issue: "Missing CE certification reference in listing.",
    suggestion: "Add CE compliance statement and usage disclaimer.",
  },
  {
    id: "prod-4",
    product: "Organic Baby Formula",
    market: "de",
    policyArea: "Local Law",
    issue: "Advertising infant nutrition in ways prohibited by EU directive.",
    suggestion: "Use approved EU wording and link to product origin certificate.",
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

export default function ScanPage() {
  const [selectedMarket, setSelectedMarket] = useState(MARKETS[0].value);
  const [isScanning, setIsScanning] = useState(false);
  const [showResults, setShowResults] = useState(false);
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
    setShowResults(false);
    setScanTimestamp(null);
  }, []);

  const handleRunScan = useCallback(() => {
    if (isScanning) return;
    setIsScanning(true);
    setShowResults(false);
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      setIsScanning(false);
      setShowResults(true);
      setScanTimestamp(new Date());
    }, 2200);
  }, [isScanning]);

  const handleApplyFix = useCallback((id: string) => {
    console.info("Applying AI fix for", id);
  }, []);

  const handleEditAndApply = useCallback((id: string) => {
    console.info("Opening edit drawer for", id);
  }, []);

  const handleApplyAll = useCallback(() => {
    setShowUpgradeModal(true);
  }, []);

  const closeUpgradeModal = useCallback(() => setShowUpgradeModal(false), []);

  const scanDescription =
    "This scan will review your product titles, descriptions, URLs, meta data, and theme content for any text, claims, or restricted terms that could trigger Google Ads or Merchant Center disapprovals in your selected market.";

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

  return (
    <Page title="AI Compliance Scan" subtitle="Scan your store’s products, URLs, descriptions, and theme content for violations of Google Ads policies and country-specific laws.">
      <Layout>
        <Layout.Section>
          <Banner status="info" title="AI compliance engine">
            Our AI is trained on the latest Google Ads and local market policies — updated automatically through OpenAI.
          </Banner>
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
                Choose a market to view localized compliance performance and run scoped scans.
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
                description: "Items analyzed for policy and legal compliance.",
                icon: ProductIcon,
              },
              {
                title: "Violations Detected",
                value: metrics.violations.toLocaleString(),
                description: "Detected disapprovals or potential issues.",
                icon: AlertCircleIcon,
              },
              {
                title: "Compliant Products",
                value: `${metrics.compliance}%`,
                description: "Currently approved and policy-aligned.",
                icon: CheckCircleIcon,
              },
            ].map((metric, index) => (
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
            <InlineStack gap="300" align="start" blockAlign="center" style={{ marginTop: "var(--p-space-400)" }}>
              <Button onClick={handleRunScan} primary disabled={isScanning} tone="success">
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
                Our OpenAI-powered system continuously checks Google Ads and legal policy documentation in real time, ensuring your scans stay up to date.
              </Text>
              <InlineStack gap="200">
                <Badge tone="success">Auto-updating</Badge>
                <Badge tone="info">GPT-5 Intelligence</Badge>
                <Badge tone="attention">Legal Source Verified</Badge>
              </InlineStack>
              <Text as="p" tone="subdued">
                API integrations and policy feeds refresh every few hours so your compliance posture is always current.
              </Text>
            </Stack>
          </Card>
        </Layout.Section>

        {showResults && (
          <Layout.Section>
            <Card>
              <Stack spacing="400">
                <div>
                  <Text variant="headingLg" as="h2">
                    Scan Results
                  </Text>
                  <Text as="p" tone="subdued">
                    Review AI summaries for flagged items. Apply fixes instantly or edit before publishing.
                  </Text>
                </div>
                <Divider />
                <InlineStack align="space-between" blockAlign="center">
                  <InlineStack gap="200" blockAlign="center">
                    <Button onClick={handleApplyAll}>
                      Apply All AI Suggestions
                    </Button>
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
                  columnContentTypes={["text", "text", "text", "text", "text"]}
                  headings={["Product", "Policy Area", "Issue", "AI Suggestion", "Actions"]}
                  rows={resultRows}
                />
                <Text as="span" tone="subdued">
                  Showing {Math.min(filteredResults.length, Number(pageSize))} of {filteredResults.length} results for this market.
                </Text>
              </Stack>
            </Card>
          </Layout.Section>
        )}
      </Layout>

      <Modal
        open={showUpgradeModal}
        onClose={closeUpgradeModal}
        title="Upgrade to apply AI compliance patches automatically"
        primaryAction={{
          content: "Upgrade Plan",
          onAction: () => {
            console.info("Redirecting to upgrade flow");
            closeUpgradeModal();
          },
        }}
        secondaryActions={[{ content: "Not now", onAction: closeUpgradeModal }]}
      >
        <Modal.Section>
          <Text as="p" tone="subdued">
            Batch remediation is available on the Growth and Agency plans. Unlock automatic AI fixes, historical reporting, and policy exports for every market you sell in.
          </Text>
          <Link url="mailto:sales@aithorapp.co.uk" tone="success">
            Talk to compliance support
          </Link>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
