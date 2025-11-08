import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  useFetcher,
  useLoaderData,
} from "@remix-run/react";
import { Toast } from "@shopify/app-bridge/actions";
import { useAppBridge } from "@shopify/app-bridge-react";
import {
  ActionList,
  Badge,
  Banner,
  Box,
  Button,
  ButtonGroup,
  Card,
  Checkbox,
  Divider,
  Icon,
  InlineGrid,
  InlineStack,
  Layout,
  LegacyStack as Stack,
  Link,
  Modal,
  Popover,
  Select,
  SkeletonBodyText,
  SkeletonDisplayText,
  Spinner,
  Text,
  TextField,
  Tooltip as PolarisTooltip,
} from "@shopify/polaris";
import {
  AlertCircleIcon,
  CalendarCheckIcon,
  CheckCircleIcon,
  NotificationIcon,
  ProductIcon,
  RefreshIcon,
} from "@shopify/polaris-icons";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import {
  hydrateDashboard,
  runFullScan,
  rescanSingleProduct,
  saveScanSchedule,
  type ComplianceFinding,
  type DashboardNotification,
  type SerializedScan,
} from "../models/scan.server";

const RESULTS_PER_PAGE = 25;

type ProductHistoryPoint = {
  productId: string;
  scannedAt: string;
  complianceScore: number;
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const dashboard = await hydrateDashboard(session.shop);
  const shopRecord = await prisma.shop.findUnique({ where: { domain: session.shop } });

  const normalizedHistory = dashboard.history.map((entry) => ({
    ...entry,
    scannedAt: entry.scannedAt instanceof Date ? entry.scannedAt.toISOString() : entry.scannedAt,
  }));

  const normalizedSchedules = dashboard.schedules.map((schedule) => ({
    ...schedule,
    nextRun: schedule.nextRun ? schedule.nextRun.toISOString() : null,
    lastRun: schedule.lastRun ? schedule.lastRun.toISOString() : null,
  }));

  return json({
    scans: dashboard.scans,
    notifications: dashboard.notifications,
    aiConnected: dashboard.aiConnected,
    schedules: normalizedSchedules,
    history: normalizedHistory,
    plan: shopRecord?.plan ?? "free",
    shop: session.shop,
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const formData = await request.formData();
  const intent = formData.get("intent")?.toString();
  const market = (formData.get("market")?.toString() ?? "uk").toLowerCase();
  const productId = formData.get("productId")?.toString();
  const scanId = formData.get("scanId")?.toString();
  const frequency = formData.get("frequency")?.toString() as
    | "daily"
    | "weekly"
    | "monthly"
    | undefined;

  const { admin, session } = await authenticate.admin(request);

  try {
    switch (intent) {
      case "startScan": {
        const scan = await runFullScan({ admin, shopDomain: session.shop, market });
        return json({ scan, toast: "Scan complete" });
      }
      case "rescanProduct": {
        if (!scanId || !productId) {
          throw new Error("Missing scan or product");
        }
        const scan = await rescanSingleProduct({ admin, scanId, productId, shopDomain: session.shop });
        return json({ scan, rescanProductId: productId, toast: "Product rescanned" });
      }
      case "scheduleProduct": {
        if (!productId || !frequency) {
          throw new Error("Missing schedule data");
        }
        const schedule = await saveScanSchedule({
          shopDomain: session.shop,
          productId,
          market,
          frequency,
        });
        return json({ schedule, toast: "Rescan schedule saved" });
      }
      default:
        return json({ error: "Unsupported action" }, { status: 400 });
    }
  } catch (error) {
    return json(
      {
        error: error instanceof Error ? error.message : "Request failed",
      },
      { status: 500 },
    );
  }
};

export default function ComplianceDashboardPage() {
  const { scans, schedules, history, notifications, aiConnected, plan, shop } = useLoaderData<typeof loader>();
  const [scanHistory, setScanHistory] = useState(scans);
  const [selectedScanId, setSelectedScanId] = useState<string | null>(scans[0]?.id ?? null);
  const [market, setMarket] = useState<string>(((scans[0]?.market as string) ?? "uk").toLowerCase());
  const [currentPage, setCurrentPage] = useState(0);
  const [previewProduct, setPreviewProduct] = useState<ComplianceFinding | null>(null);
  const [previewContent, setPreviewContent] = useState("" );
  const [manualEditEnabled, setManualEditEnabled] = useState(false);
  const [expandedProducts, setExpandedProducts] = useState<Record<string, boolean>>({});
  const [notificationPopoverOpen, setNotificationPopoverOpen] = useState(false);
  const [exportPopoverActive, setExportPopoverActive] = useState(false);
  const [scheduleState, setScheduleState] = useState(schedules);
  const [localHistory, setLocalHistory] = useState(history);
  const [pendingApplyProductId, setPendingApplyProductId] = useState<string | null>(null);
  const [bulkApplying, setBulkApplying] = useState(false);

  const appBridge = useAppBridge();

  const runScanFetcher = useFetcher<typeof action>();
  const rescanFetcher = useFetcher<typeof action>();
  const scheduleFetcher = useFetcher<typeof action>();
  const applyFixFetcher = useFetcher();

  const isFreePlan = !plan || plan === "free";

  const shopNotifications = notifications;

  const displayedScan = useMemo(() => {
    if (!scanHistory.length) return undefined;
    if (!selectedScanId) return scanHistory[0];
    return scanHistory.find((scan) => scan.id === selectedScanId) ?? scanHistory[0];
  }, [scanHistory, selectedScanId]);

  const triggerToast = useCallback(
    (message?: string) => {
      if (!message || !appBridge) return;
      const toast = Toast.create(appBridge, { message });
      toast.dispatch(Toast.Action.SHOW);
    },
    [appBridge],
  );

  useEffect(() => {
    if (runScanFetcher.state === "idle" && runScanFetcher.data?.scan) {
      setScanHistory((prev) => [runScanFetcher.data!.scan, ...prev].slice(0, 5));
      setSelectedScanId(runScanFetcher.data.scan.id);
      setCurrentPage(0);
      setLocalHistory((prev) => [
        ...prev,
        ...runScanFetcher.data!.scan.results.map((result) => ({
          productId: result.productId,
          scannedAt: new Date().toISOString(),
          complianceScore: result.complianceScore ?? 0,
        })),
      ]);
      triggerToast(runScanFetcher.data.toast);
    }
  }, [runScanFetcher.state, runScanFetcher.data, triggerToast]);

  useEffect(() => {
    if (rescanFetcher.state === "idle" && rescanFetcher.data?.scan) {
      setScanHistory((prev) => prev.map((scan) => (scan.id === rescanFetcher.data!.scan.id ? rescanFetcher.data!.scan : scan)));
      if (rescanFetcher.data.rescanProductId) {
        const updated = rescanFetcher.data.scan.results.find((result) => result.productId === rescanFetcher.data!.rescanProductId);
        if (updated) {
          setLocalHistory((prev) => [
            ...prev,
            {
              productId: updated.productId,
              scannedAt: new Date().toISOString(),
              complianceScore: updated.complianceScore ?? 0,
            },
          ]);
        }
      }
      triggerToast(rescanFetcher.data.toast);
    }
  }, [rescanFetcher.state, rescanFetcher.data, triggerToast]);

  useEffect(() => {
    if (scheduleFetcher.state === "idle" && scheduleFetcher.data?.schedule) {
      setScheduleState((prev) => {
        const filtered = prev.filter((item) => !(item.productId === scheduleFetcher.data!.schedule.productId));
        return [...filtered, scheduleFetcher.data.schedule];
      });
      triggerToast(scheduleFetcher.data.toast);
    }
  }, [scheduleFetcher.state, scheduleFetcher.data, triggerToast]);

  useEffect(() => {
    if (applyFixFetcher.state === "idle" && applyFixFetcher.data?.success) {
      triggerToast("Product updated");
      setPendingApplyProductId(null);
    } else if (applyFixFetcher.state === "submitting") {
      const productId = applyFixFetcher.formData?.get("productId")?.toString() ?? null;
      setPendingApplyProductId(productId);
    }
  }, [applyFixFetcher.state, applyFixFetcher.data, triggerToast]);

  const summaryMetrics = useMemo(() => buildSummary(scanHistory), [scanHistory]);
  const chartHistoryByProduct = useMemo(() => groupHistory(localHistory), [localHistory]);

  const visibleResults = useMemo(() => {
    if (!displayedScan) return [];
    const start = currentPage * RESULTS_PER_PAGE;
    return displayedScan.results.slice(start, start + RESULTS_PER_PAGE);
  }, [displayedScan, currentPage]);

  const scanHistoryOptions = scanHistory.map((scan) => ({
    label: `${scan.market.toUpperCase()} • ${formatTimestamp(scan.completedAt ?? scan.startedAt)}`,
    value: scan.id,
  }));

  const notificationsActivator = (
    <Button icon={NotificationIcon} onClick={() => setNotificationPopoverOpen((prev) => !prev)}>{shopNotifications.length}</Button>
  );

  const exportButton = (
    <Button disclosure onClick={() => setExportPopoverActive((prev) => !prev)} disabled={!displayedScan || isFreePlan}>
      Export Report
    </Button>
  );

  const exportActivator = isFreePlan ? (
    <PolarisTooltip content="Upgrade required" dismissOnMouseOut>
      <span>{exportButton}</span>
    </PolarisTooltip>
  ) : (
    exportButton
  );

  const exportPopover = (
    <Popover active={exportPopoverActive && !isFreePlan && Boolean(displayedScan)} onClose={() => setExportPopoverActive(false)} activator={exportActivator}>
      <ActionList
        items={[
          { content: "Export CSV", onAction: () => handleExport(displayedScan, "csv") },
          { content: "Export PDF", onAction: () => handleExport(displayedScan, "pdf") },
        ]}
      />
    </Popover>
  );

  const handlePreview = useCallback((result: ComplianceFinding) => {
    setPreviewProduct(result);
    setPreviewContent(result.aiRewrite?.description ?? result.originalDescription);
    setManualEditEnabled(false);
  }, []);

  const handleApplyFix = useCallback(
    (product: ComplianceFinding, usePreview = false) => {
      const description = usePreview
        ? previewContent
        : product.aiRewrite?.description ?? product.originalDescription;
      applyFixFetcher.submit({ productId: product.productId, description }, { method: "post", action: "/api/scan/apply" });
    },
    [applyFixFetcher, previewContent],
  );

  const handleSchedule = useCallback(
    (productId: string, frequency: "daily" | "weekly" | "monthly") => {
      const formData = new FormData();
      formData.append("intent", "scheduleProduct");
      formData.append("productId", productId);
      formData.append("frequency", frequency);
      formData.append("market", market);
      scheduleFetcher.submit(formData, { method: "post" });
    },
    [scheduleFetcher, market],
  );

  const handleExport = useCallback((scan: SerializedScan | undefined, format: "csv" | "pdf") => {
    if (!scan || typeof window === "undefined") return;
    const url = new URL(`/api/scan/export`, window.location.origin);
    url.searchParams.set("scanId", scan.id);
    url.searchParams.set("market", scan.market);
    url.searchParams.set("format", format);
    window.open(url.toString(), "_blank");
  }, []);

  const handleApplyAll = useCallback(
    async (scan: SerializedScan | undefined) => {
      if (!scan || typeof window === "undefined") return;
      const payloads = scan.results.filter((result) => result.aiRewrite?.description);
      if (!payloads.length) {
        triggerToast("No AI fixes available");
        return;
      }
      setBulkApplying(true);
      try {
        await Promise.all(
          payloads.map((result) =>
            fetch("/api/scan/apply", {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              body: new URLSearchParams({
                productId: result.productId,
                description: result.aiRewrite!.description ?? result.originalDescription,
              }).toString(),
            }),
          ),
        );
        triggerToast("AI fixes queued");
      } catch (error) {
        console.error(error);
        triggerToast("Unable to apply all fixes");
      } finally {
        setBulkApplying(false);
      }
    },
    [triggerToast],
  );

  return (
    <Layout>
      <Layout.Section>
        <Box
          background="bg-surface-secondary"
          borderRadius="300"
          padding="400"
          shadow="card"
          style={{ position: "sticky", top: 0, zIndex: 10 }}
        >
          <Stack spacing="400">
            <InlineStack align="space-between" blockAlign="center">
              <div>
                <Text variant="headingLg" as="h1">
                  Compliance Intelligence Dashboard
                </Text>
                <Text tone="subdued" as="p">
                  Automated AI enforcement with policy citations, remediation workflows, and scheduled rescans.
                </Text>
              </div>
              <InlineStack gap="200" blockAlign="center">
                {exportPopover}
                <Popover
                  active={notificationPopoverOpen}
                  activator={notificationsActivator}
                  onClose={() => setNotificationPopoverOpen(false)}
                >
                  <Box padding="300" minWidth="320px">
                    <Text variant="headingSm">Alerts</Text>
                    <Divider borderColor="border" style={{ margin: "var(--p-space-200) 0" }} />
                    <Stack vertical spacing="200">
                      {shopNotifications.length === 0 && (
                        <Text tone="subdued">No alerts right now.</Text>
                      )}
                      {shopNotifications.map((notification) => (
                        <Stack key={notification.id} vertical spacing="100">
                          <InlineStack gap="200" blockAlign="center">
                            <Badge tone={notification.severity === "critical" ? "critical" : "warning"}>
                              {notification.severity === "critical" ? "High" : "Medium"}
                            </Badge>
                            <Text variant="bodySm" tone="subdued">{formatRelative(notification.createdAt)}</Text>
                          </InlineStack>
                          <Text variant="bodyMd" as="p">{notification.title}</Text>
                          <Text tone="subdued" as="p">{notification.detail}</Text>
                        </Stack>
                      ))}
                    </Stack>
                  </Box>
                </Popover>
              </InlineStack>
            </InlineStack>

            <InlineGrid columns={{ xs: 1, md: 3 }} gap="400">
              <SummaryMetricCard
                title="Compliance score"
                icon={CheckCircleIcon}
                value={`${summaryMetrics.overallScore}%`}
                description="Weighted by recent scans"
              />
              <SummaryMetricCard
                title="Violations this week"
                icon={AlertCircleIcon}
                value={summaryMetrics.violationsThisWeek.toString()}
                description="Across all markets"
              />
              <SummaryMetricCard
                title="Scheduled products"
                icon={CalendarCheckIcon}
                value={scheduleState.length.toString()}
                description="Auto rescans enabled"
              />
            </InlineGrid>

            <InlineStack gap="200" wrap blockAlign="center">
              <runScanFetcher.Form method="post">
                <input type="hidden" name="intent" value="startScan" />
                <input type="hidden" name="market" value={market} />
                <Button primary submit disabled={runScanFetcher.state !== "idle"} icon={RefreshIcon}>
                  {runScanFetcher.state !== "idle" ? "Scanning…" : "Rescan all products"}
                </Button>
              </runScanFetcher.Form>
              <Select
                labelHidden
                label="Market"
                options={MARKETS}
                value={market}
                onChange={(value) => setMarket(value)}
              />
              {isFreePlan ? (
                <PolarisTooltip content="Upgrade required" dismissOnMouseOut>
                  <span>
                    <Button disabled>Apply all AI suggestions</Button>
                  </span>
                </PolarisTooltip>
              ) : (
                <Button
                  onClick={() => handleApplyAll(displayedScan)}
                  disabled={!displayedScan || bulkApplying}
                >
                  {bulkApplying ? "Applying…" : "Apply all AI suggestions"}
                </Button>
              )}
            </InlineStack>
          </Stack>
        </Box>
      </Layout.Section>

      {!aiConnected && (
        <Layout.Section>
          <Banner status="critical" title="AI connection failed">
            We could not reach OpenAI. Double-check your OPENAI_API_KEY and retry.
          </Banner>
        </Layout.Section>
      )}

      <Layout.Section>
        <Card>
          <Stack spacing="400">
            <Select
              label="Scan history"
              options={scanHistoryOptions}
              value={selectedScanId ?? undefined}
              onChange={(value) => {
                setSelectedScanId(value);
                setCurrentPage(0);
              }}
              placeholder="Most recent"
            />
            {displayedScan && (
              <InlineStack align="space-between" blockAlign="center">
                <Text tone="subdued">
                  Completed {formatTimestamp(displayedScan.completedAt ?? displayedScan.startedAt)} — Market {displayedScan.market.toUpperCase()}
                </Text>
                {displayedScan.results.length > RESULTS_PER_PAGE && (
                  <InlineStack gap="200" blockAlign="center">
                    <ButtonGroup>
                      <Button onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 0))} disabled={currentPage === 0}>
                        Previous
                      </Button>
                      <Button
                        onClick={() => setCurrentPage((prev) =>
                          displayedScan ? Math.min(prev + 1, Math.ceil(displayedScan.results.length / RESULTS_PER_PAGE) - 1) : prev,
                        )}
                        disabled={!displayedScan || (currentPage + 1) * RESULTS_PER_PAGE >= displayedScan.results.length}
                      >
                        Next
                      </Button>
                    </ButtonGroup>
                    <Text tone="subdued">
                      Page {currentPage + 1} / {Math.max(1, Math.ceil(displayedScan.results.length / RESULTS_PER_PAGE))}
                    </Text>
                  </InlineStack>
                )}
              </InlineStack>
            )}
          </Stack>
        </Card>
      </Layout.Section>

      <Layout.Section>
        {displayedScan ? (
          <Stack vertical spacing="400">
            {visibleResults.map((result) => (
              <ProductResultCard
                key={result.productId}
                shopDomain={shop}
                result={result}
                history={chartHistoryByProduct[result.productId] ?? []}
                schedule={scheduleState.find((schedule) => schedule.productId === result.productId)}
                expanded={Boolean(expandedProducts[result.productId])}
                toggleExpanded={() =>
                  setExpandedProducts((prev) => ({ ...prev, [result.productId]: !prev[result.productId] }))
                }
                onPreview={() => handlePreview(result)}
                onFix={() => handleApplyFix(result)}
                onRescan={() => {
                  if (!displayedScan) return;
                  const formData = new FormData();
                  formData.append("intent", "rescanProduct");
                  formData.append("productId", result.productId);
                  formData.append("scanId", displayedScan.id);
                  rescanFetcher.submit(formData, { method: "post" });
                }}
                onSchedule={(frequency) => handleSchedule(result.productId, frequency)}
                applying={pendingApplyProductId === result.productId && applyFixFetcher.state !== "idle"}
                isFreePlan={isFreePlan}
              />
            ))}
          </Stack>
        ) : (
          <Card sectioned>
            <Text>No scans yet. Run your first scan to see AI insights.</Text>
          </Card>
        )}
      </Layout.Section>

      <Modal
        open={Boolean(previewProduct)}
        onClose={() => setPreviewProduct(null)}
        title={previewProduct ? `AI Fix Preview — ${previewProduct.productTitle}` : "AI Fix Preview"}
        large
        primaryAction={{
          content: "Apply Fix",
          disabled: !previewProduct,
          onAction: () => {
            if (!previewProduct) return;
            handleApplyFix(previewProduct, true);
            setPreviewProduct(null);
          },
        }}
        secondaryActions={[{ content: "Cancel", onAction: () => setPreviewProduct(null) }]}
      >
        <Modal.Section>
          {previewProduct ? (
            <Stack vertical spacing="400">
              <Card title="Original snippet">
                <Text as="p" tone="subdued">
                  {previewProduct.originalDescription}
                </Text>
              </Card>
              <Card title="AI rewrite">
                <Stack vertical spacing="300">
                  <Checkbox
                    label="Allow manual edits"
                    checked={manualEditEnabled}
                    onChange={(value) => setManualEditEnabled(value)}
                  />
                  <TextField
                    value={previewContent}
                    onChange={setPreviewContent}
                    multiline
                    autoComplete="off"
                    disabled={!manualEditEnabled}
                  />
                </Stack>
              </Card>
            </Stack>
          ) : (
            <Text tone="subdued">Select a product to preview AI fixes.</Text>
          )}
        </Modal.Section>
      </Modal>
    </Layout>
  );
}

function SummaryMetricCard({
  title,
  icon,
  value,
  description,
}: {
  title: string;
  icon: any;
  value: string;
  description: string;
}) {
  return (
    <Card>
      <Stack spacing="300" alignment="center">
        <Icon source={icon} tone="primary" />
        <div>
          <Text variant="headingMd" as="h3">
            {title}
          </Text>
          <Text variant="headingLg" as="p">
            {value}
          </Text>
          <Text as="p" tone="subdued">
            {description}
          </Text>
        </div>
      </Stack>
    </Card>
  );
}

function ProductResultCard({
  shopDomain,
  result,
  history,
  schedule,
  expanded,
  toggleExpanded,
  onPreview,
  onFix,
  onRescan,
  onSchedule,
  applying,
  isFreePlan,
}: {
  shopDomain: string;
  result: ComplianceFinding;
  history: { scannedAt: string; complianceScore: number }[];
  schedule?: { productId: string; frequency: string; nextRun: string | Date | null };
  expanded: boolean;
  toggleExpanded: () => void;
  onPreview: () => void;
  onFix: () => void;
  onRescan: () => void;
  onSchedule: (frequency: "daily" | "weekly" | "monthly") => void;
  applying: boolean;
  isFreePlan: boolean;
}) {
  const hasViolations = result.violations.length > 0;
  const highestSeverity = getHighestSeverity(result.violations);
  const summaryBadgeTone = hasViolations ? severityTone(highestSeverity) : "success";
  const summaryLabel = hasViolations ? `${result.violations.length} flagged` : "Clean";

  return (
    <Card sectioned>
      <Stack vertical spacing="300">
        <InlineStack align="space-between" blockAlign="center">
          <InlineStack gap="200" blockAlign="center">
            <Icon source={ProductIcon} tone="subdued" />
            <div>
              <Text variant="headingSm" as="h3">
                {result.productTitle}
              </Text>
              <Text tone="subdued" as="p">
                {shopDomain}
              </Text>
            </div>
          </InlineStack>
          <Badge tone={summaryBadgeTone}>{summaryLabel}</Badge>
        </InlineStack>

        <InlineStack align="space-between" blockAlign="start">
          <InlineStack gap="200" blockAlign="center">
            <Badge tone="info">Score {result.complianceScore}%</Badge>
            <Badge tone="subdued">Market {result.market.toUpperCase()}</Badge>
          </InlineStack>
          <InlineStack gap="200">
            <Button size="slim" onClick={onFix} disabled={!result.aiRewrite || applying}>
              {applying ? (
                <InlineStack gap="100" blockAlign="center">
                  <Spinner size="small" />
                  <span>Fixing…</span>
                </InlineStack>
              ) : (
                "Fix with AI"
              )}
            </Button>
            <Button size="slim" onClick={onPreview} disabled={!result.aiRewrite}>
              Preview fix
            </Button>
            <Button size="slim" onClick={onRescan}>
              Rescan product
            </Button>
          </InlineStack>
        </InlineStack>

        <InlineStack align="space-between" wrap blockAlign="center">
          <div style={{ minWidth: 200, height: 120 }}>
            <ProductHistorySparkline data={history} />
          </div>
          <InlineStack gap="200" blockAlign="center">
            <Select
              label="Schedule auto-rescan"
              labelHidden
              options={SCHEDULE_OPTIONS}
              value={schedule?.frequency ?? ""}
              placeholder="Select frequency"
              onChange={(value) => onSchedule(value as "daily" | "weekly" | "monthly")}
              disabled={isFreePlan}
            />
            {schedule?.nextRun && (
              <Text tone="subdued" as="span">
                Next run {formatTimestamp(schedule.nextRun)}
              </Text>
            )}
          </InlineStack>
        </InlineStack>

        <Button fullWidth onClick={toggleExpanded} accessibilityLabel="Toggle violation details">
          {expanded ? "Hide details" : "Show details"}
        </Button>

        {expanded && (
          <Stack vertical spacing="200">
            {hasViolations ? (
              result.violations.map((violation, index) => (
                <Card key={`${result.productId}-violation-${index}`} subdued sectioned>
                  <InlineStack align="space-between" blockAlign="center">
                    <InlineStack gap="200" blockAlign="center">
                      <Badge tone={severityTone(violation.severity)}>{violation.severity}</Badge>
                      <Badge tone={riskTone(violation.riskScore)}>
                        Risk {formatRisk(violation.riskScore)}
                      </Badge>
                    </InlineStack>
                    {violation.sourceUrl && (
                      <Link url={violation.sourceUrl} target="_blank">
                        View policy reference
                      </Link>
                    )}
                  </InlineStack>
                  <Text variant="bodyMd" as="p">
                    <strong>{violation.policy}</strong> · {violation.law}
                  </Text>
                  <Text variant="bodySm" tone="subdued" as="p">
                    {violation.issue}
                  </Text>
                  <Text variant="bodySm" as="p">
                    <strong>Why this matters:</strong> {violation.whyMatters}
                  </Text>
                  <Text variant="bodySm" as="p">
                    <strong>AI guidance:</strong> {violation.suggestion}
                  </Text>
                </Card>
              ))
            ) : (
              <Text tone="subdued">Everything looks compliant for this product.</Text>
            )}
          </Stack>
        )}
      </Stack>
    </Card>
  );
}

function ProductHistorySparkline({
  data,
}: {
  data: { scannedAt: string; complianceScore: number }[];
}) {
  if (data.length < 2) {
    return (
      <div style={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center" }}>
        <Text tone="subdued">No history</Text>
      </div>
    );
  }

  const formatted = data.map((entry) => ({
    date: new Date(entry.scannedAt).toLocaleDateString(),
    compliance: entry.complianceScore,
  }));

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={formatted} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
        <XAxis dataKey="date" hide />
        <YAxis domain={[0, 100]} hide />
        <RechartsTooltip formatter={(value) => `${value}%`} labelFormatter={(label) => `Scan ${label}`} />
        <Line type="monotone" dataKey="compliance" stroke="#5c6ac4" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

const MARKETS = [
  { label: "United Kingdom", value: "uk" },
  { label: "United States", value: "us" },
  { label: "European Union", value: "eu" },
  { label: "Australia", value: "au" },
  { label: "Canada", value: "ca" },
];

const SCHEDULE_OPTIONS = [
  { label: "Daily", value: "daily" },
  { label: "Weekly", value: "weekly" },
  { label: "Monthly", value: "monthly" },
];

function buildSummary(scans: SerializedScan[]) {
  if (!scans.length) {
    return { overallScore: 0, violationsThisWeek: 0 };
  }
  const overallScore = scans[0]?.complianceScore ?? 0;
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const violationsThisWeek = scans.reduce((sum, scan) => {
    const timestamp = new Date(scan.completedAt ?? scan.startedAt).getTime();
    if (timestamp >= weekAgo) {
      return sum + scan.violations;
    }
    return sum;
  }, 0);
  return { overallScore, violationsThisWeek };
}

function groupHistory(history: ProductHistoryPoint[]) {
  return history.reduce<Record<string, { scannedAt: string; complianceScore: number }[]>>((acc, item) => {
    if (!acc[item.productId]) acc[item.productId] = [];
    acc[item.productId].push(item);
    return acc;
  }, {});
}

function getHighestSeverity(violations: ComplianceFinding["violations"]) {
  if (!violations.length) return "Low";
  if (violations.some((violation) => violation.severity === "High")) return "High";
  if (violations.some((violation) => violation.severity === "Medium")) return "Medium";
  return "Low";
}

function severityTone(severity: "High" | "Medium" | "Low") {
  if (severity === "High") return "critical";
  if (severity === "Medium") return "warning";
  return "success";
}

function riskTone(score: number) {
  if (score >= 0.75) return "critical";
  if (score >= 0.4) return "warning";
  return "success";
}

function formatRisk(score: number) {
  return `${Math.round(Math.min(1, Math.max(0, score)) * 100)}%`;
}

function formatTimestamp(value: string | Date) {
  return new Date(value).toLocaleString();
}

function formatRelative(value: string) {
  const diff = Date.now() - new Date(value).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
