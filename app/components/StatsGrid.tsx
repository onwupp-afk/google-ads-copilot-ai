import {
  BlockStack,
  Card,
  InlineGrid,
  InlineStack,
  ProgressBar,
  Text,
  Badge,
} from "@shopify/polaris";

type StatsGridProps = {
  complianceScore: number;
  violationsResolved: number;
  activeMarkets: string[];
};

export function StatsGrid({
  complianceScore,
  violationsResolved,
  activeMarkets,
}: StatsGridProps) {
  return (
    <InlineGrid columns={{ xs: 1, sm: 3 }} gap="400">
      <Card padding="500">
        <BlockStack gap="300">
          <Text variant="headingSm" as="h3">
            Global Compliance Score
          </Text>
          <InlineStack align="space-between">
            <Text variant="headingXl" as="p">
              {complianceScore}%
            </Text>
            <Badge tone={complianceScore >= 90 ? "success" : "warning"}>
              {complianceScore >= 90 ? "On target" : "Attention"}
            </Badge>
          </InlineStack>
          <ProgressBar progress={complianceScore} tone="positive" />
          <Text as="p" tone="subdued">
            Monitoring across paid search, shopping, and product feeds.
          </Text>
        </BlockStack>
      </Card>

      <Card padding="500">
        <BlockStack gap="300">
          <Text variant="headingSm" as="h3">
            Violations resolved (24h)
          </Text>
          <InlineStack align="baseline" gap="200">
            <Text variant="headingXl" as="p">
              {violationsResolved}
            </Text>
            <Text tone="subdued" as="span">
              cases
            </Text>
          </InlineStack>
          <Text as="p" tone="subdued">
            AI rewrites and policy notes delivered to campaign owners.
          </Text>
        </BlockStack>
      </Card>

      <Card padding="500">
        <BlockStack gap="300">
          <Text variant="headingSm" as="h3">
            Markets monitored
          </Text>
          <InlineStack gap="200" wrap>
            {activeMarkets.map((market) => (
              <Badge key={market} tone="attention">
                {market}
              </Badge>
            ))}
          </InlineStack>
          <Text as="p" tone="subdued">
            Localized policy packs synced with Google Ads updates.
          </Text>
        </BlockStack>
      </Card>
    </InlineGrid>
  );
}

export default StatsGrid;
