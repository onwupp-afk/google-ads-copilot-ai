import { useOutletContext } from "@remix-run/react";
import { Button, Card, Layout, Page, Text } from "@shopify/polaris";
import type { AppContext } from "./app";

export default function AppSupportPage() {
  const { shop } = useOutletContext<AppContext>();
  const shopName = shop.replace(".myshopify.com", "");

  return (
    <Page title="Support" subtitle={`We're here to help ${shopName} stay compliant.`}>
      <Layout>
        <Layout.Section>
          <Card>
            <Card.Section>
              <Text as="p">
                Need assistance with AI scans, policy interpretations, or onboarding? Our compliance team typically responds
                within two business hours.
              </Text>
            </Card.Section>
            <Card.Section>
              <Button url="mailto:support@aithorapp.co.uk" primary>
                Email support@aithorapp.co.uk
              </Button>
              <div style={{ marginTop: "var(--p-space-400)" }}>
                <Text as="p" tone="subdued">
                  Prefer a call? Include your phone number and preferred time window — we’ll schedule a session with a policy specialist.
                </Text>
              </div>
            </Card.Section>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
