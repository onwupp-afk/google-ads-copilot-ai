import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import {
  AppProvider,
  Badge,
  Banner,
  Button,
  CalloutCard,
  Card,
  DataTable,
  Divider,
  Frame,
  Icon,
  Layout,
  LegacyStack as Stack,
  Link,
  Page,
  SkeletonBodyText,
  SkeletonDisplayText,
  Text,
} from "@shopify/polaris";
import en from "@shopify/polaris/locales/en.json";
import {
  GlobeIcon,
  MagicIcon,
  ThumbsUpIcon,
} from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";

type LoaderData = {
  shopName: string;
};

export async function loader({ request }: LoaderFunctionArgs) {
  let shopName = "your store";
  try {
    const { session } = await authenticate.admin(request);
    if (session?.shop) {
      shopName = session.shop.replace(".myshopify.com", "");
    }
  } catch (error) {
    console.warn("[marketing.loader] unauthenticated visitor", error instanceof Error ? error.message : error);
  }

  return json<LoaderData>({ shopName });
}

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

export default function Index() {
  const { shopName } = useLoaderData<typeof loader>();
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

  return (
    <AppProvider i18n={en}>
      <Frame>
        <Page
          title="Google Ads Policy & Local Laws Copilot"
          subtitle="AI-powered compliance assistant that keeps your products approved and compliant with local laws."
        >
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
              primaryAction={{ content: "Start Scan", url: "/app/dashboard" }}
              secondaryAction={{ content: "View History", url: "/app/scans" }}
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
                  Need help configuring scans? <Link url="/app/settings">Visit settings</Link> or
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
        </Page>
      </Frame>
    </AppProvider>
  );
}
