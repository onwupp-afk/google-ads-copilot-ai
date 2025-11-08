import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Badge,
  Box,
  Button,
  ButtonGroup,
  Card,
  Checkbox,
  Icon,
  InlineGrid,
  InlineStack,
  Modal,
  ProgressBar,
  Select,
  Spinner,
  Text,
  TextField,
} from "@shopify/polaris";
import { AlertCircleIcon, CheckIcon, MagicIcon, RefreshIcon, SearchIcon } from "@shopify/polaris-icons";
import { FixedSizeList as VirtualList } from "react-window";

import type {
  FixScope,
  WorkspaceIssue,
  WorkspacePayload,
  WorkspaceProductContext,
} from "../models/fixWorkspace.server";

export type WorkspaceModalProps = {
  open: boolean;
  loading: boolean;
  scope: FixScope;
  payload?: WorkspacePayload;
  shopDomain: string;
  onClose: () => void;
  onScopeChange: (scope: FixScope) => void;
  onApplyIssue: (issue: WorkspaceIssue) => Promise<{ success?: boolean; error?: string } | void>;
  onRegenerateIssue: (issue: WorkspaceIssue) => Promise<WorkspaceIssue | void>;
  onApplyAll: () => void;
  onRescan: () => void;
  applyAllProgress?: {
    running: boolean;
    current: number;
    total: number;
    label: string;
  };
};

const FIX_SCOPE_OPTIONS: { label: string; value: FixScope }[] = [
  { label: "All fields", value: "all" },
  { label: "Titles only", value: "title" },
  { label: "Descriptions only", value: "description" },
  { label: "Metadata only", value: "metadata" },
  { label: "Template content only", value: "template" },
];

type FilterToken = "all" | "high" | "resolved";

export function AIFixWorkspace({
  open,
  loading,
  scope,
  payload,
  shopDomain,
  onClose,
  onScopeChange,
  onApplyIssue,
  onRegenerateIssue,
  onApplyAll,
  onRescan,
  applyAllProgress,
}: WorkspaceModalProps) {
  const issues = payload?.issues ?? [];
  const product = payload?.product;
  const stats = payload?.stats;
  const progressPercent = applyAllProgress?.total
    ? Math.min(100, (applyAllProgress.current / applyAllProgress.total) * 100)
    : 0;

  const [filter, setFilter] = useState<FilterToken>("all");
  const [search, setSearch] = useState("");
  const [diffMode, setDiffMode] = useState<"combined" | "split">("split");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [manualEdits, setManualEdits] = useState<Record<string, boolean>>({});
  const [activeIssueId, setActiveIssueId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setDrafts({});
      setManualEdits({});
      setSearch("");
      setFilter("all");
    }
  }, [open]);

  useEffect(() => {
    if (!issues.length) return;
    const nextDrafts: Record<string, string> = {};
    issues.forEach((issue) => {
      nextDrafts[issue.id] = issue.after ?? issue.suggestion ?? "";
    });
    setDrafts(nextDrafts);
  }, [issues]);

  const filteredIssues = useMemo(() => {
    return issues.filter((issue) => {
      if (filter === "high" && issue.severity !== "High") return false;
      if (filter === "resolved" && issue.status !== "applied") return false;
      if (search) {
        const haystack = `${issue.title} ${issue.summary} ${issue.suggestion}`.toLowerCase();
        if (!haystack.includes(search.toLowerCase())) return false;
      }
      return true;
    });
  }, [issues, filter, search]);

  const listHeight = 520;
  const itemHeight = 260;
  const [scrollTop, setScrollTop] = useState(0);
  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - 1);
  const endIndex = Math.min(filteredIssues.length, startIndex + Math.ceil(listHeight / itemHeight) + 2);
  const visibleIssues = filteredIssues.slice(startIndex, endIndex);

  const handleScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(event.currentTarget.scrollTop);
  }, []);

  const handleDraftChange = useCallback((issueId: string, value: string) => {
    setDrafts((prev) => ({ ...prev, [issueId]: value }));
  }, []);

  const handleManualEditToggle = useCallback((issueId: string, checked: boolean) => {
    setManualEdits((prev) => ({ ...prev, [issueId]: checked }));
  }, []);

  const applySingle = useCallback(
    async (issue: WorkspaceIssue) => {
      const draftValue = drafts[issue.id] ?? issue.after ?? issue.suggestion;
      setActiveIssueId(issue.id);
      try {
        await onApplyIssue({ ...issue, after: draftValue, allowManualEdit: manualEdits[issue.id] });
      } finally {
        setActiveIssueId(null);
      }
    },
    [drafts, manualEdits, onApplyIssue],
  );

  const regenerateSingle = useCallback(
    async (issue: WorkspaceIssue) => {
      setActiveIssueId(issue.id);
      try {
        const regenerated = await onRegenerateIssue(issue);
        if (regenerated) {
          setDrafts((prev) => ({ ...prev, [issue.id]: regenerated.after ?? regenerated.suggestion ?? "" }));
        }
      } finally {
        setActiveIssueId(null);
      }
    },
    [onRegenerateIssue],
  );

  const renderIssueCard = (issue: WorkspaceIssue) => {
    const draftValue = drafts[issue.id] ?? issue.after ?? issue.suggestion ?? "";
    const loadingState = activeIssueId === issue.id;

    return (
      <Card padding="400" background="bg-surface-secondary" sectioned>
          <InlineStack align="space-between" blockAlign="start">
            <InlineStack gap="200" blockAlign="center">
              <Badge tone={severityTone(issue.severity)}>{issue.severity}</Badge>
              <Badge tone="subdued">{formatField(issue.targetField)}</Badge>
              <Text variant="headingSm" as="h3">
                {issue.title}
              </Text>
            </InlineStack>
            <InlineStack gap="200" blockAlign="center">
              {issue.confidence !== undefined && (
                <Text tone="subdued" variant="bodySm">
                  Confidence {Math.round(issue.confidence * 100)}%
                </Text>
              )}
              {issue.status === "applied" && <Icon source={CheckIcon} tone="success" />}
              {issue.status === "error" && <Icon source={AlertCircleIcon} tone="critical" />}
            </InlineStack>
          </InlineStack>

          <Box paddingBlockStart="300">
            <Text as="p" tone="subdued">
              {issue.summary}
            </Text>
            {issue.policyReference && (
              <Text as="p" tone="subdued">
                Policy: {issue.policyReference}
              </Text>
            )}
            {issue.sourceUrl && (
              <a href={issue.sourceUrl} target="_blank" rel="noreferrer">
                View policy reference
              </a>
            )}
          </Box>

          <Box paddingBlockStart="300">
            {diffMode === "split" ? (
              <InlineGrid columns={{ xs: 1, md: 2 }} gap="300">
                <Card title="Original" subdued>
                  <Text as="p" tone="subdued">
                    {issue.before || fallbackSnippet(product, issue.targetField)}
                  </Text>
                </Card>
                <Card title="AI Suggested fix">
                  <Checkbox
                    label="Allow manual edits"
                    checked={manualEdits[issue.id] ?? false}
                    onChange={(value) => handleManualEditToggle(issue.id, value)}
                  />
                  <TextField
                    value={draftValue}
                    onChange={(value) => handleDraftChange(issue.id, value)}
                    multiline
                    autoComplete="off"
                    disabled={!manualEdits[issue.id]}
                  />
                </Card>
              </InlineGrid>
            ) : (
              <TextField
                value={draftValue}
                onChange={(value) => handleDraftChange(issue.id, value)}
                multiline
                autoComplete="off"
                label="AI Suggested fix"
              />
            )}
          </Box>

          <InlineStack align="space-between" blockAlign="center" gap="200" wrap>
            <InlineStack gap="200" wrap>
              <Button
                primary
                size="slim"
                icon={MagicIcon}
                onClick={() => applySingle(issue)}
                disabled={loadingState}
              >
                {loadingState ? <Spinner size="small" /> : "Apply fix"}
              </Button>
              <Button size="slim" icon={RefreshIcon} onClick={() => regenerateSingle(issue)} disabled={loadingState}>
                Regenerate fix
              </Button>
              {product?.legacyResourceId && (
                <Button
                  size="slim"
                  url={`https://${shopDomain}/admin/products/${product.legacyResourceId}`}
                  target="_blank"
                >
                  Preview in Shopify Product Editor
                </Button>
              )}
            </InlineStack>
            {issue.errorMessage && (
              <Text tone="critical" variant="bodySm">
                {issue.errorMessage}
              </Text>
            )}
          </InlineStack>
        </Card>
    );
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      fullScreen
      title={`AI Fix Workspace${product ? ` — ${product.title}` : ""}`}
      primaryAction={{ content: "Apply All Fixes", onAction: onApplyAll, loading: applyAllProgress?.running }}
      secondaryActions={[
        { content: "Rescan product", onAction: onRescan },
      ]}
    >
      <Modal.Section>
        {product && (
          <Card padding="300">
            <InlineStack align="space-between" blockAlign="center" wrap>
              <InlineStack gap="300" blockAlign="center">
                {product.featuredImage?.url && (
                  <img
                    src={product.featuredImage.url}
                    alt={product.featuredImage.altText ?? product.title}
                    style={{ width: 56, height: 56, borderRadius: "var(--p-border-radius-200)", objectFit: "cover" }}
                  />
                )}
                <div>
                  <Text variant="headingSm" as="h3">
                    {product.title}
                  </Text>
                  <Text tone="subdued" variant="bodySm">
                    Detected {stats?.totalIssues ?? issues.length} issues · Confidence {Math.round((stats?.confidenceAvg ?? 0) * 100)}%
                  </Text>
                </div>
              </InlineStack>
              <InlineStack gap="200">
                <Button variant="plain" url={product.onlineStoreUrl ?? undefined} target="_blank" disabled={!product.onlineStoreUrl}>
                  View on storefront
                </Button>
                <Button
                  variant="plain"
                  url={product.legacyResourceId ? `https://${shopDomain}/admin/products/${product.legacyResourceId}` : undefined}
                  target="_blank"
                  disabled={!product.legacyResourceId}
                >
                  Open in Shopify
                </Button>
              </InlineStack>
            </InlineStack>
          </Card>
        )}

        <Box paddingBlockEnd="300">
          <InlineStack align="space-between" wrap blockAlign="center">
            <InlineStack gap="200" blockAlign="center" wrap>
              <Select
                label="Fix scope"
                labelHidden
                options={FIX_SCOPE_OPTIONS}
                value={scope}
                onChange={(value) => onScopeChange(value as FixScope)}
              />
              <ButtonGroup segmented>
                <Button pressed={diffMode === "split"} onClick={() => setDiffMode("split")}>
                  Before / After
                </Button>
                <Button pressed={diffMode === "combined"} onClick={() => setDiffMode("combined")}>
                  Combined view
                </Button>
              </ButtonGroup>
              <ButtonGroup>
                <Button pressed={filter === "all"} onClick={() => setFilter("all")}>All issues</Button>
                <Button pressed={filter === "high"} onClick={() => setFilter("high")}>High severity</Button>
                <Button pressed={filter === "resolved"} onClick={() => setFilter("resolved")}>Fixed</Button>
              </ButtonGroup>
            </InlineStack>
            <TextField
              label="Search"
              labelHidden
              prefix={<Icon source={SearchIcon} tone="subdued" />}
              value={search}
              onChange={setSearch}
              autoComplete="off"
            />
          </InlineStack>
        </Box>

        {applyAllProgress?.running && (
          <Box paddingBlockEnd="300">
            <ProgressBar progress={progressPercent} />
            <Text tone="subdued" variant="bodySm">
              {applyAllProgress.label}
            </Text>
          </Box>
        )}

        {loading && (
          <InlineStack align="center" blockAlign="center" style={{ minHeight: 240 }}>
            <Spinner accessibilityLabel="Loading AI workspace" size="large" />
          </InlineStack>
        )}

        {!loading && filteredIssues.length === 0 && (
          <Card sectioned>
            <Text tone="success">No outstanding policy issues for the selected scope.</Text>
          </Card>
        )}

        {!loading && filteredIssues.length > 0 && (
          <div
            style={{ maxHeight: listHeight, overflowY: "auto", position: "relative" }}
            onScroll={handleScroll}
          >
            <div style={{ height: filteredIssues.length * itemHeight, position: "relative" }}>
              {visibleIssues.map((issue, offset) => (
                <div
                  key={issue.id}
                  style={{
                    position: "absolute",
                    top: (startIndex + offset) * itemHeight,
                    left: 0,
                    right: 0,
                    paddingBottom: "var(--p-space-300)",
                  }}
                >
                  {renderIssueCard(issue)}
                </div>
              ))}
            </div>
          </div>
        )}
      </Modal.Section>
    </Modal>
  );
}

function severityTone(severity: string) {
  if (severity === "High") return "critical";
  if (severity === "Medium") return "warning";
  return "success";
}

function formatField(field: string) {
  switch (field) {
    case "title":
      return "Title";
    case "metadata":
      return "Metadata";
    case "template":
      return "Template";
    default:
      return "Description";
  }
}

function fallbackSnippet(product: WorkspaceProductContext | undefined, field: string) {
  if (!product) return "";
  if (field === "title") return product.title;
  if (field === "metadata") return product.metafields[0]?.value ?? "";
  if (field === "template") return "Template snippet unavailable";
  return product.descriptionText;
}
