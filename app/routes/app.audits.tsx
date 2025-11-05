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
import { useMemo } from "react";
import { authenticate } from "../shopify.server";
import { useScanData } from "../hooks/useScanData";
import type { AppContext } from "./app";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return json({});
};

export default function Audits() {
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

  const rows = scanData.audits.map((audit) => {
    const statusTone =
      audit.score >= 90
        ? "success"
        : audit.score >= 80
          ? "attention"
          : "critical";
    return [
      formatter.format(new Date(audit.runAt)),
      audit.market,
      <Badge key={`${audit.id}-score`} tone={statusTone}>
        {audit.score}%
      </Badge>,
      `${audit.fixedPercent}%`,
      <Button
        key={`${audit.id}-pdf`}
        size="slim"
        variant="secondary"
        url={buildEmbeddedUrl(`/app/audits/${audit.id}.pdf`)}
      >
        Export PDF
      </Button>,
      <Button
        key={`${audit.id}-csv`}
        size="slim"
        variant="secondary"
        url={buildEmbeddedUrl(`/app/audits/${audit.id}.csv`)}
      >
        Export CSV
      </Button>,
    ];
  });

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
                Audit history
              </Text>
              <DataTable
                columnContentTypes={[
                  "text",
                  "text",
                  "text",
                  "numeric",
                  "text",
                  "text",
                ]}
                headings={[
                  "Run at",
                  "Market",
                  "Score",
                  "Fixed %",
                  "Export PDF",
                  "Export CSV",
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
