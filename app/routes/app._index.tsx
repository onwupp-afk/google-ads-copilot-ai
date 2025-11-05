import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useOutletContext } from "@remix-run/react";
import {
  Badge,
  BlockStack,
  Card,
  DataTable,
  InlineGrid,
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

export default function Dashboard() {
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

  const metrics = [
    {
      title: "Average compliance score",
      value: `${scanData.complianceScore}%`,
      helpText: "Weighted by policy severity across all markets.",
    },
    {
      title: "Active violations",
      value: `${scanData.activeViolations}`,
      helpText: "Open issues awaiting review or rewrite.",
    },
    {
      title: "Last scan completed",
      value: formatter.format(new Date(scanData.lastScan)),
      helpText: "Latest automated audit across your catalogs.",
    },
  ];

  const issueRows = scanData.issues.map((issue) => {
    const badgeTone =
      issue.severity === "High"
        ? "critical"
        : issue.severity === "Medium"
          ? "attention"
          : "success";
    return [
      issue.market,
      issue.issue,
      <Badge key={issue.id} tone={badgeTone}>
        {issue.severity}
      </Badge>,
    ];
  });

  const scanRows = scanData.scans.map((scan) => {
    const statusTone =
      scan.status === "Completed"
        ? "success"
        : scan.status === "Running"
          ? "info"
          : "attention";
    return [
      formatter.format(new Date(scan.runAt)),
      scan.market,
      `${scan.violations}`,
      `${scan.aiFixes}`,
      <Badge key={scan.id} tone={statusTone}>
        {scan.status}
      </Badge>,
    ];
  });

  return (
    <Page
      title="Compliance Overview"
      subtitle="Monitor policy health, investigate violations, and launch targeted scans."
      primaryAction={{
        content: "Run New Scan",
        url: buildEmbeddedUrl("/app/scans"),
      }}
    >
      <Layout>
        <Layout.Section>
          <InlineGrid columns={{ xs: 1, md: 3 }} gap="400">
            {metrics.map((metric) => (
              <Card key={metric.title} padding="500">
                <BlockStack gap="200">
                  <Text variant="headingMd" as="h2">
                    {metric.title}
                  </Text>
                  <Text variant="heading2xl" as="p">
                    {metric.value}
                  </Text>
                  <Text tone="subdued" as="p">
                    {metric.helpText}
                  </Text>
                </BlockStack>
              </Card>
            ))}
          </InlineGrid>
        </Layout.Section>
        <Layout.Section variant="twoThirds">
          <Card>
            <BlockStack gap="300">
              <Text variant="headingMd" as="h3">
                Latest Scan Activity
              </Text>
              <DataTable
                columnContentTypes={["text", "text", "numeric", "numeric", "text"]}
                headings={["Run at", "Market", "Violations", "AI fixes", "Status"]}
                rows={scanRows}
                showTotalsInFooter={false}
              />
            </BlockStack>
          </Card>
        </Layout.Section>
        <Layout.Section variant="oneThird">
          <Card>
            <BlockStack gap="300">
              <Text variant="headingMd" as="h3">
                Highest Priority Issues
              </Text>
              <DataTable
                columnContentTypes={["text", "text", "text"]}
                headings={["Market", "Issue", "Severity"]}
                rows={issueRows}
                showTotalsInFooter={false}
              />
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
