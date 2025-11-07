import { useOutletContext } from "@remix-run/react";
import { Card, Layout, Page, Text } from "@shopify/polaris";
import type { AppContext } from "./app";

export default function AppSettingsPage() {
  const { shop } = useOutletContext<AppContext>();

  return (
    <Page title="Settings" subtitle="Manage AI compliance preferences for your store.">
      <Layout>
        <Layout.Section>
          <Card>
            <Card.Section>
              <Text as="p">
                Settings for {shop.replace(".myshopify.com", "")} will live here. Customize scan schedules, policy severity thresholds, and integrations.
              </Text>
            </Card.Section>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
