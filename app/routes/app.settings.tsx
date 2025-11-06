import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useState } from "react";
import { useOutletContext } from "@remix-run/react";
import {
  Badge,
  BlockStack,
  Button,
  Card,
  ChoiceList,
  Checkbox,
  Divider,
  InlineGrid,
  Layout,
  Page,
  Text,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import type { AppContext } from "./app";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return json({});
};

export default function Settings() {
  const { persistentSearch } = useOutletContext<AppContext>();
  const [aiEnabled, setAiEnabled] = useState(true);
  const [complianceMode, setComplianceMode] = useState(["strict"]);
  const [googleAdsConnected] = useState(true);
  const [shopifyMarketsConnected] = useState(true);

  const buildEmbeddedUrl = (path: string) => {
    return persistentSearch ? `${path}?${persistentSearch}` : path;
  };

  return (
    <Page
      title="Settings"
      subtitle="Fine-tune AI automation, compliance thresholds, and integrations."
      primaryAction={{
        content: "Save Settings",
        url: buildEmbeddedUrl("/app/settings?save=1"),
      }}
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            <Card>
              <BlockStack gap="300">
                <Text variant="headingMd" as="h2">
                  AI Options
                </Text>
                <Checkbox
                  label="Enable AI rewrite suggestions"
                  checked={aiEnabled}
                  onChange={(_, checked) => setAiEnabled(checked)}
                  helpText="AI suggestions will rewrite ad copy and landing-page snippets before you approve them."
                />
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="300">
                <Text variant="headingMd" as="h2">
                  Compliance mode
                </Text>
                <ChoiceList
                  title="Choose your enforcement mode"
                  choices={[
                    { label: "Strict — zero tolerance for risky language", value: "strict" },
                    { label: "Relaxed — flag advisory issues as warnings", value: "relaxed" },
                  ]}
                  selected={complianceMode}
                  onChange={setComplianceMode}
                />
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="300">
                <Text variant="headingMd" as="h2">
                  Integrations
                </Text>
                <InlineGrid columns={{ xs: 1, sm: 2 }} gap="300">
                  <IntegrationStatus
                    title="Google Ads"
                    description="Used for policy webhooks and asset rewrites."
                    connected={googleAdsConnected}
                    reconnectUrl={buildEmbeddedUrl("/app/settings?connect=google-ads")}
                  />
                  <IntegrationStatus
                    title="Shopify Markets"
                    description="Sync products, feeds, and localized rule packs."
                    connected={shopifyMarketsConnected}
                    reconnectUrl={buildEmbeddedUrl("/app/settings?connect=shopify-markets")}
                  />
                </InlineGrid>
              </BlockStack>
            </Card>

            <Divider />

            <InlineGrid columns={{ xs: 1, sm: 3 }} gap="200">
              <Button size="large" url={buildEmbeddedUrl("/app/scans")}>
                View scans
              </Button>
              <Button size="large" url={buildEmbeddedUrl("/app/markets")}>
                Manage markets
              </Button>
              <Button size="large" variant="primary" url={buildEmbeddedUrl("/app/audits")}>
                Review audits
              </Button>
            </InlineGrid>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

type IntegrationStatusProps = {
  title: string;
  description: string;
  connected: boolean;
  reconnectUrl: string;
};

function IntegrationStatus({
  title,
  description,
  connected,
  reconnectUrl,
}: IntegrationStatusProps) {
  return (
    <Card>
      <BlockStack gap="200">
        <Text variant="headingSm" as="h3">
          {title}
        </Text>
        <Text tone="subdued" as="p">
          {description}
        </Text>
        <Badge tone={connected ? "success" : "critical"}>
          {connected ? "Connected" : "Not connected"}
        </Badge>
        <Button variant="secondary" url={reconnectUrl}>
          {connected ? "Manage connection" : "Connect"}
        </Button>
      </BlockStack>
    </Card>
  );
}
