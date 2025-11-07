import { useOutletContext } from "@remix-run/react";
import {
  Card,
  Layout,
  Page,
  Text,
} from "@shopify/polaris";
import type { AppContext } from "./app";

export default function AppDashboard() {
  const { shop } = useOutletContext<AppContext>();
  const shopName = shop.replace(".myshopify.com", "");

  return (
    <Page title="Compliance Overview" subtitle="Monitor your store’s Google Ads and local law readiness in one place.">
      <Layout>
        <Layout.Section>
          <Card>
            <Card.Section>
              <Text variant="headingLg" as="h1">
                Welcome back, {shopName}
              </Text>
              <Text as="p" tone="subdued">
                Run AI compliance scans, review flagged issues, and keep every market aligned with Google Ads and local legal requirements.
              </Text>
            </Card.Section>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
