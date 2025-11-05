export type ScanIssue = {
  id: number;
  market: string;
  issue: string;
  severity: "Low" | "Medium" | "High";
};

export type MarketOverview = {
  id: string;
  region: string;
  policyPack: string;
  version: string;
  compliance: number;
};

export type ScanSummary = {
  id: string;
  runAt: string;
  market: string;
  violations: number;
  aiFixes: number;
  status: "Queued" | "Running" | "Completed";
  suggestedFixes: string[];
};

export type AuditRecord = {
  id: string;
  runAt: string;
  market: string;
  score: number;
  fixedPercent: number;
};

export function useScanData() {
  return {
    lastScan: "2025-11-05T15:00:00Z",
    complianceScore: 87,
    activeViolations: 6,
    markets: [
      {
        id: "uk",
        region: "United Kingdom",
        policyPack: "Policy Pack UK",
        version: "2025.10",
        compliance: 91,
      },
      {
        id: "eu",
        region: "European Union",
        policyPack: "Policy Pack EU",
        version: "2025.9",
        compliance: 84,
      },
      {
        id: "us",
        region: "United States",
        policyPack: "Policy Pack US",
        version: "2025.7",
        compliance: 89,
      },
      {
        id: "au",
        region: "Australia",
        policyPack: "Policy Pack AU",
        version: "2025.6",
        compliance: 93,
      },
      {
        id: "ca",
        region: "Canada",
        policyPack: "Policy Pack CA",
        version: "2025.5",
        compliance: 88,
      },
    ] satisfies MarketOverview[],
    issues: [
      {
        id: 1,
        market: "UK",
        issue: "Medical claim detected",
        severity: "High",
      },
      {
        id: 2,
        market: "EU",
        issue: "Missing return policy copy",
        severity: "Medium",
      },
      {
        id: 3,
        market: "US",
        issue: "Restricted keywords in ad headline",
        severity: "High",
      },
    ] satisfies ScanIssue[],
    scans: [
      {
        id: "scan-1045",
        runAt: "2025-11-05T15:00:00Z",
        market: "UK",
        violations: 4,
        aiFixes: 3,
        status: "Completed",
        suggestedFixes: [
          "Rewrite medical claim in headline to remove prohibited language.",
          "Link to compliant prescription policy.",
        ],
      },
      {
        id: "scan-1044",
        runAt: "2025-11-02T10:00:00Z",
        market: "EU",
        violations: 2,
        aiFixes: 2,
        status: "Completed",
        suggestedFixes: [
          "Add localized refund policy snippet to landing page.",
        ],
      },
      {
        id: "scan-1043",
        runAt: "2025-10-29T19:30:00Z",
        market: "US",
        violations: 5,
        aiFixes: 4,
        status: "Completed",
        suggestedFixes: [
          "Remove restricted keyword from description.",
          "Add FTC compliant disclaimer to footer.",
        ],
      },
    ] satisfies ScanSummary[],
    audits: [
      {
        id: "audit-2025-10",
        runAt: "2025-10-31T08:00:00Z",
        market: "UK",
        score: 92,
        fixedPercent: 86,
      },
      {
        id: "audit-2025-09",
        runAt: "2025-09-30T08:00:00Z",
        market: "EU",
        score: 88,
        fixedPercent: 79,
      },
      {
        id: "audit-2025-08",
        runAt: "2025-08-30T08:00:00Z",
        market: "US",
        score: 90,
        fixedPercent: 82,
      },
    ] satisfies AuditRecord[],
  };
}
