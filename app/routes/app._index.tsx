import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useOutletContext } from "@remix-run/react";
import {
  Badge,
  BlockStack,
  Card,
  DataTable,
  InlineGrid,
  InlineStack,
  Layout,
  Page,
  Tabs,
  Text,
} from "@shopify/polaris";
import { useMemo, useState } from "react";
import { authenticate } from "../shopify.server";
import { useScanData } from "../hooks/useScanData";
import DashboardSummary from "../components/DashboardSummary";
import StatsGrid from "../components/StatsGrid";
import type { AppContext } from "./app";

type DashboardLoaderData = {
  complianceScore: number;
  violationsResolved: number;
  activeMarkets: string[];
  nextScanIn: string;
  lastScanTimestamp: string;
};

const TABS = [
  { id: "overview", content: "Overview" },
  { id: "violations", content: "Violations" },
  { id: "queue", content: "Remediation Queue" },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return json<DashboardLoaderData>({
    complianceScore: 94,
    violationsResolved: 28,
    activeMarkets: ["UK", "EU", "US", "AU"],
    nextScanIn: "2h",
    lastScanTimestamp: "2025-11-05T15:00:00Z",
  });
};

export default function Dashboard() {
  const { complianceScore, violationsResolved, activeMarkets, nextScanIn, lastScanTimestamp } =
    useLoaderData<typeof loader>();
  const { host, shop } = useOutletContext<AppContext>();
  const scanData = useScanData();
  const [selectedTab, setSelectedTab] = useState(0);

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
      <Badge key={`${scan.id}-status`} tone={statusTone}>
        {scan.status}
      </Badge>,
      `${scan.violations}`,
      `${scan.aiFixes}`,
    ];
  });

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
      <Badge key={`${issue.id}-severity`} tone={badgeTone}>
        {issue.severity}
      </Badge>,
    ];
  });

  return (
    <Page
      title="Policy Operations"
      subtitle="Agency-grade insight into AI-driven Google Ads & Shopping compliance."
      primaryAction={{
        content: "Run Scan",
        url: buildEmbeddedUrl("/app/scans"),
      }}
    >
      <Layout>
        <Layout.Section>
          <DashboardSummary
            appName="Google Ads Copilot AI"
            tagline="Policy Intelligence That Fixes Itself"
            lastScan={formatter.format(new Date(lastScanTimestamp))}
            nextScanIn={nextScanIn}
          />
        </Layout.Section>

        <Layout.Section>
          <StatsGrid
            complianceScore={complianceScore}
            violationsResolved={violationsResolved}
            activeMarkets={activeMarkets}
          />
        </Layout.Section>

        <Layout.Section>
          <Card>
            <Tabs
              tabs={TABS}
              selected={selectedTab}
              onSelect={setSelectedTab}
              fitted
            >
              <Card.Section>
                {selectedTab === 0 && (
                  <Text as="p" tone="subdued">
                    Monitor campaign health, approvals, and AI actions at a glance. This workspace
                    keeps client teams, performance marketers, and compliance leads on the same page.
                  </Text>
                )}
                {selectedTab === 1 && (
                  <Text as="p" tone="subdued">
                    Violations are prioritized by impact and market. Each entry includes AI rationale
                    and suggested copy rewrites so stakeholders can approve fixes without deep
                    platform knowledge.
                  </Text>
                )}
                {selectedTab === 2 && (
                  <Text as="p" tone="subdued">
                    The remediation queue tracks AI-generated actions awaiting human approval. Connect
                    this view to your agency&apos;s QA flow or automate approvals with guardrails.
                  </Text>
                )}
              </Card.Section>
            </Tabs>
          </Card>
        </Layout.Section>

        <Layout.Section variant="twoThirds">
          <Card>
            <Card.Header title="Recent scans" />
            <Card.Section>
              <DataTable
                columnContentTypes={["text", "text", "text", "numeric", "numeric"]}
                headings={["Completed", "Market", "Status", "Violations", "AI fixes"]}
                rows={scanRows}
              />
            </Card.Section>
          </Card>
        </Layout.Section>

        <Layout.Section variant="oneThird">
          <Card>
            <Card.Header title="Priority issues" />
            <Card.Section>
              <DataTable
                columnContentTypes={["text", "text", "text"]}
                headings={["Market", "Issue", "Severity"]}
                rows={issueRows}
              />
            </Card.Section>
            <Card.Section subdued>
              <InlineStack align="space-between">
                <Text tone="subdued" as="p">
                  Connected markets
                </Text>
                <InlineGrid columns="auto" gap="200">
                  {activeMarkets.map((market) => (
                    <Badge key={`${market}-active`} tone="subdued">
                      {market}
                    </Badge>
                  ))}
                </InlineGrid>
              </InlineStack>
            </Card.Section>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
