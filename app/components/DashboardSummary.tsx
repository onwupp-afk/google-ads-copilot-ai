import { Card, InlineStack, Text, Badge, BlockStack } from "@shopify/polaris";

export type DashboardSummaryProps = {
  appName: string;
  tagline: string;
  lastScan: string;
  nextScanIn: string;
};

export function DashboardSummary({
  appName,
  tagline,
  lastScan,
  nextScanIn,
}: DashboardSummaryProps) {
  return (
    <Card padding="600">
      <InlineStack align="space-between" wrap={false} gap="400" blockAlign="center">
        <InlineStack gap="300" wrap blockAlign="start">
          <BlockStack gap="200">
            <Text variant="headingLg" as="h2">
              {appName}
            </Text>
            <Text as="p" variant="bodyMd" tone="subdued">
              {tagline}
            </Text>
          </BlockStack>
          <Badge tone="success">AI Guardrails Active</Badge>
        </InlineStack>
        <BlockStack gap="100" align="end" flexGrow={0}>
          <Text as="p" variant="bodySm" tone="subdued">
            Last scan completed
          </Text>
          <Text variant="headingMd" as="p">
            {lastScan}
          </Text>
          <Text as="p" variant="bodySm" tone="subdued">
            Next scan in {nextScanIn}
          </Text>
        </BlockStack>
      </InlineStack>
    </Card>
  );
}

export default DashboardSummary;
