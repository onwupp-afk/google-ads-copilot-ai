import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useOutletContext } from "@remix-run/react";
import {
  Badge,
  BlockStack,
  Button,
  Card,
  InlineStack,
  Layout,
  Page,
  Text,
} from "@shopify/polaris";
import { useMemo } from "react";
import { authenticate } from "../shopify.server";
import { useScanData } from "../hooks/useScanData";
import type { AppContext } from "./app";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return json({});
};

export default function Audits() {
  const { persistentSearch } = useOutletContext<AppContext>();
  const scanData = useScanData();

  const formatter = useMemo(
    () =>
      new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }),
    [],
  );

  const buildEmbeddedUrl = (path: string) => {
    return persistentSearch ? `${path}?${persistentSearch}` : path;
  };

  return (
    <Page
      title="Audits"
      subtitle="Historical scan performance with exportable compliance snapshots."
      primaryAction={{
        content: "Share Report",
        url: buildEmbeddedUrl("/app/audits?share=latest"),
      }}
    >
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text variant="headingMd" as="h2">
                Audit trail
              </Text>
              <BlockStack gap="400">
                {scanData.audits.map((audit) => {
                  const tone =
                    audit.score >= 90
                      ? "success"
                      : audit.score >= 80
                        ? "attention"
                        : "critical";
                  return (
                    <Card key={audit.id} padding="500" background="bg-surface-secondary">
                      <BlockStack gap="200">
                        <InlineStack align="space-between" blockAlign="center">
                          <BlockStack gap="100">
                            <Text variant="headingSm" as="h3">
                              {formatter.format(new Date(audit.runAt))}
                            </Text>
                            <Text as="p" tone="subdued">
                              {audit.market} market · automated policy sweep
                            </Text>
                          </BlockStack>
                          <Badge tone={tone}>{audit.score}% score</Badge>
                        </InlineStack>
                        <InlineStack align="space-between">
                          <Text as="p" tone="subdued">
                            Fix rate
                          </Text>
                          <Text as="p" variant="headingMd">
                            {audit.fixedPercent}%
                          </Text>
                        </InlineStack>
                        <InlineStack gap="200">
                          <Button
                            size="slim"
                            variant="secondary"
                            url={buildEmbeddedUrl(`/app/audits/${audit.id}.pdf`)}
                          >
                            Export PDF
                          </Button>
                          <Button
                            size="slim"
                            variant="secondary"
                            url={buildEmbeddedUrl(`/app/audits/${audit.id}.csv`)}
                          >
                            Download CSV
                          </Button>
                        </InlineStack>
                      </BlockStack>
                    </Card>
                  );
                })}
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
