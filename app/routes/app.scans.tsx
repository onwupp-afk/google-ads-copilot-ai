import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useMemo } from "react";
import { useOutletContext } from "@remix-run/react";
import {
  Badge,
  BlockStack,
  Button,
  Card,
  DataTable,
  InlineGrid,
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

export default function Scans() {
  const { host, shop } = useOutletContext<AppContext>();
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
    const params = new URLSearchParams({ host, shop });
    return `${path}?${params.toString()}`;
  };

  const durations = ["3m 12s", "6m 08s", "4m 41s"];

  const rows = scanData.scans.map((scan, index) => {
    const tone =
      scan.status === "Completed"
        ? "success"
        : scan.status === "Running"
          ? "info"
          : "attention";
    return [
      formatter.format(new Date(scan.runAt)),
      scan.market,
      <Badge key={`${scan.id}-status`} tone={tone}>
        {scan.status}
      </Badge>,
      `${scan.violations}`,
      durations[index] ?? "—",
    ];
  });

  const activeScan = scanData.scans[0];

  return (
    <Page
      title="Scans"
      subtitle="Review recent compliance scans and apply AI-powered fixes."
      primaryAction={{
        content: "Run New Scan",
        url: buildEmbeddedUrl("/app/scans?run=new"),
      }}
    >
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text variant="headingMd" as="h2">
                Recent scans
              </Text>
              <DataTable
                columnContentTypes={["text", "text", "text", "numeric", "text"]}
                headings={[
                  "Date",
                  "Market",
                  "Status",
                  "Violations found",
                  "Duration",
                ]}
                rows={rows}
              />
            </BlockStack>
          </Card>
        </Layout.Section>

        {activeScan ? (
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <InlineGrid columns={{ xs: 1, md: 2 }} gap="200">
                  <BlockStack gap="100">
                    <Text as="span" tone="subdued">
                      Scan ID
                    </Text>
                    <Text as="p" variant="headingMd">
                      {activeScan.id}
                    </Text>
                  </BlockStack>
                  <BlockStack gap="100">
                    <Text as="span" tone="subdued">
                      Completed
                    </Text>
                    <Text as="p">
                      {formatter.format(new Date(activeScan.runAt))}
                    </Text>
                  </BlockStack>
                  <BlockStack gap="100">
                    <Text as="span" tone="subdued">
                      Market
                    </Text>
                    <Text as="p">{activeScan.market}</Text>
                  </BlockStack>
                  <BlockStack gap="100">
                    <Text as="span" tone="subdued">
                      Violations
                    </Text>
                    <Text as="p">{activeScan.violations}</Text>
                  </BlockStack>
                  <BlockStack gap="100">
                    <Text as="span" tone="subdued">
                      AI fixes applied
                    </Text>
                    <Text as="p">{activeScan.aiFixes}</Text>
                  </BlockStack>
                  <BlockStack gap="100">
                    <Text as="span" tone="subdued">
                      Duration
                    </Text>
                    <Text as="p">{durations[0] ?? "—"}</Text>
                  </BlockStack>
                </InlineGrid>
                <BlockStack gap="200">
                  <Text as="h3" variant="headingMd">
                    Suggested fixes
                  </Text>
                  <BlockStack gap="100">
                    {activeScan.suggestedFixes.map((fix, index) => (
                      <Card key={`${activeScan.id}-fix-${index}`} padding="300">
                        <Text as="p">{fix}</Text>
                      </Card>
                    ))}
                  </BlockStack>
                  <InlineGrid columns={{ xs: 1, sm: 2 }} gap="200">
                    <Button disabled size="large">
                      Apply Fix (coming soon)
                    </Button>
                    <Button
                      size="large"
                      variant="secondary"
                      url={buildEmbeddedUrl("/app/audits")}
                    >
                      View audit history
                    </Button>
                  </InlineGrid>
                </BlockStack>
              </BlockStack>
            </Card>
          </Layout.Section>
        ) : null}
      </Layout>
    </Page>
  );
}
