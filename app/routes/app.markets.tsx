import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import {
  Badge,
  BlockStack,
  Card,
  InlineGrid,
  Layout,
  Page,
  Text,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { useScanData } from "../hooks/useScanData";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return json({});
};

export default function Markets() {
  const scanData = useScanData();

  const marketCards = scanData.markets.map((market) => {
    const tone =
      market.compliance >= 90
        ? "success"
        : market.compliance >= 80
          ? "attention"
          : "critical";
    return (
      <Card key={market.id} padding="500">
        <BlockStack gap="200">
          <Text variant="headingSm" as="h3">
            {market.region}
          </Text>
          <Text tone="subdued" as="p">
            {market.policyPack} · v{market.version}
          </Text>
          <Badge tone={tone}>{market.compliance}% compliant</Badge>
          <Text as="p" tone="subdued">
            Guardrails synced with Google Ads policies for this region.
          </Text>
        </BlockStack>
      </Card>
    );
  });

  return (
    <Page
      title="Markets"
      subtitle="Manage localized policy packs and track market-specific compliance."
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            <Card>
              <BlockStack gap="200">
                <Text variant="headingMd" as="h2">
                  Active markets
                </Text>
                <Text tone="subdued" as="p">
                  Each market applies localized policy packs, rewrite playbooks, and monitoring
                  schedules. Adjust pack strictness in settings to align with client expectations.
                </Text>
              </BlockStack>
            </Card>
            <InlineGrid columns={{ xs: 1, sm: 2, md: 4 }} gap="400">
              {marketCards}
            </InlineGrid>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
