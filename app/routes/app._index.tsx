import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "@remix-run/react";
import {
  Badge,
  Banner,
  Button,
  CalloutCard,
  Card,
  DataTable,
  Divider,
  Icon,
  Layout,
  LegacyStack as Stack,
  Link,
  SkeletonBodyText,
  SkeletonDisplayText,
  Text,
} from "@shopify/polaris";
import { GlobeIcon, MagicIcon, ThumbsUpIcon } from "@shopify/polaris-icons";
import type { AppContext } from "./app";

const overviewCards = [
  {
    title: "What It Does",
    icon: MagicIcon,
    copy: "Automatically detects and fixes Google Ads and Local Law policy violations across your store feed.",
  },
  {
    title: "How It Works",
    icon: GlobeIcon,
    copy: "Scans your product listings daily, identifies potential compliance issues, and rewrites disapproved content using AI.",
  },
  {
    title: "Why Storeowners Love It",
    icon: ThumbsUpIcon,
    copy: "94% faster approval rates, 1,400+ violations fixed, and full regional law adaptation.",
  },
];

export default function AppDashboard() {
  const { shop, persistentSearch } = useOutletContext<AppContext>();
  const shopName = shop.replace(".myshopify.com", "");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timeout = setTimeout(() => setLoading(false), 600);
    return () => clearTimeout(timeout);
  }, []);

  const metrics = useMemo(
    () => [
      ["Compliance Score", "96%", "Average global approval accuracy"],
      ["Active Scans", "72", "Stores being monitored"],
      ["Violations Fixed", "1,482", "Auto-fixes completed this week"],
      ["Regions Covered", "8", "Country-specific law tracking"],
    ],
    [],
  );

  const motionVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 },
  };

  const withParams = (path: string) =>
    persistentSearch && persistentSearch.length > 0 ? `${path}?${persistentSearch}` : path;

  return (
    <>
      <Card>
        <Stack alignment="center" spacing="400">
          <Text variant="headingLg" as="h1">
            Google Ads Policy & Local Laws Copilot
          </Text>
          <Stack spacing="200" alignment="center">
            <Badge tone="success">Connected</Badge>
            <Text as="span" tone="subdued">
              {shopName}
            </Text>
          </Stack>
          <Text as="p" tone="subdued">
            👋 Welcome back, {shopName}.
          </Text>
        </Stack>
      </Card>

      <div style={{ marginTop: "var(--p-space-600)" }}>
        <Layout>
          {overviewCards.map((card, index) => (
            <Layout.Section key={card.title} variant="oneThird">
              <motion.div
                variants={motionVariants}
                initial="hidden"
                animate="visible"
                transition={{ delay: 0.15 * index }}
                whileHover={{ y: -4 }}
              >
                <Card>
                  <Stack alignment="center" spacing="400">
                    <Icon source={card.icon} tone="primary" />
                    <div>
                      <Text as="h3" variant="headingMd">
                        {card.title}
                      </Text>
                      <Text as="p" tone="subdued">
                        {card.copy}
                      </Text>
                    </div>
                  </Stack>
                </Card>
              </motion.div>
            </Layout.Section>
          ))}
        </Layout>
      </div>

      <motion.div
        variants={motionVariants}
        initial="hidden"
        animate="visible"
        transition={{ delay: 0.5 }}
        style={{ marginTop: "var(--p-space-800)" }}
      >
        <Card>
          <Banner
            title="Last sync: All stores compliant and up-to-date ✅"
            tone="success"
            status="success"
          />
          <Divider />
          {loading ? (
            <div style={{ padding: "var(--p-space-500)" }}>
              <SkeletonDisplayText size="small" />
              <SkeletonBodyText lines={4} />
            </div>
          ) : (
            <div style={{ padding: "var(--p-space-500)" }}>
              <Text variant="headingMd" as="h2">
                Live Compliance Overview
              </Text>
            </div>
          )}
          {!loading && (
            <DataTable
              columnContentTypes={["text", "text", "text"]}
              headings={["Metric", "Value", "Description"]}
              rows={metrics}
              showTotalsInFooter={false}
            />
          )}
        </Card>
      </motion.div>

      <motion.div
        variants={motionVariants}
        initial="hidden"
        animate="visible"
        transition={{ delay: 0.65 }}
        style={{ marginTop: "var(--p-space-800)" }}
      >
        <CalloutCard
          title="Run Your First Compliance Scan"
          illustration="https://cdn.shopify.com/shopifycloud/web/assets/v1/illustrations/marketing-email-list@3x.png"
          primaryAction={{ content: "Start Scan", url: withParams("/app/scans") }}
          secondaryAction={{ content: "Visit Settings", url: withParams("/app/settings") }}
        >
          <Text as="p" tone="subdued">
            Scan your product listings now — our AI will check against Google and local laws in real time.
          </Text>
          <div style={{ marginTop: "var(--p-space-400)", maxWidth: 320 }}>
            <SkeletonDisplayText size="extraSmall" />
          </div>
        </CalloutCard>
      </motion.div>

      <Card>
        <div style={{ padding: "var(--p-space-500)" }}>
          <Stack alignment="center" distribution="center" spacing="400">
            <Text as="span" tone="subdued">
              Need help configuring scans? <Link url={withParams("/app/settings")}>Visit settings</Link> or
              <Button variant="plain" url="mailto:support@aithorapp.co.uk">
                contact support
              </Button>
            </Text>
          </Stack>
        </div>
      </Card>

      <Divider />
      <div style={{ textAlign: "center", padding: "var(--p-space-500)" }}>
        <Text as="p" tone="subdued">
          Powered by AITHOR — Policy Intelligence for Google Ads & Local Laws.
        </Text>
      </div>
    </>
  );
}
