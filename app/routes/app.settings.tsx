import { useOutletContext } from "@remix-run/react";
import { Card, Layout, Text } from "@shopify/polaris";
import type { AppContext } from "./app";

export default function AppSettingsPage() {
  const { shop } = useOutletContext<AppContext>();
  const shopName = shop.replace(".myshopify.com", "");

  return (
    <Layout>
      <Layout.Section>
        <Card>
          <Card.Section>
            <Text variant="headingMd" as="h2">
              General preferences
            </Text>
            <Text as="p" tone="subdued">
              Configure scan schedules, policy severity thresholds, and integrations for {shopName}.
            </Text>
          </Card.Section>
        </Card>
      </Layout.Section>
      <Layout.Section>
        <Card>
          <Card.Section>
            <Text variant="headingMd" as="h2">
              Notifications
            </Text>
            <Text as="p" tone="subdued">
              Email and Slack alerts will be available soon. Contact support if you want early access.
            </Text>
          </Card.Section>
        </Card>
      </Layout.Section>
    </Layout>
  );
}
