import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useOutletContext } from "@remix-run/react";
import {
  Badge,
  BlockStack,
  Button,
  Card,
  DataTable,
  Layout,
  Page,
  Text,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { useScanData } from "../hooks/useScanData";
import type { AppContext } from "./app";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return json({});
};

export default function Markets() {
  const { host, shop } = useOutletContext<AppContext>();
  const scanData = useScanData();

  const buildEmbeddedUrl = (path: string) => {
    const params = new URLSearchParams({ host, shop });
    return `${path}?${params.toString()}`;
  };

  const rows = scanData.markets.map((market) => {
    const tone =
      market.compliance >= 90
        ? "success"
        : market.compliance >= 80
          ? "attention"
          : "critical";
    return [
      market.region,
      `${market.policyPack} v${market.version}`,
      <Badge key={market.id} tone={tone}>
        {market.compliance}%
      </Badge>,
      <Button
        key={`${market.id}-update`}
        size="slim"
        url={buildEmbeddedUrl(`/app/markets?focus=${market.id}`)}
      >
        Update rule pack
      </Button>,
    ];
  });

  return (
    <Page
      title="Markets"
      subtitle="Manage localized policy packs and track market-specific compliance."
      primaryAction={{
        content: "Add Market",
        url: buildEmbeddedUrl("/app/markets?modal=add"),
      }}
    >
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text variant="headingMd" as="h2">
                Policy pack coverage
              </Text>
              <DataTable
                columnContentTypes={["text", "text", "text", "text"]}
                headings={[
                  "Market",
                  "Policy pack",
                  "Compliance",
                  "Actions",
                ]}
                rows={rows}
              />
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
