import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import PDFDocument from "pdfkit";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import type { ComplianceFinding } from "../models/scan.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const format = (url.searchParams.get("format") ?? "csv").toLowerCase();
  const scanId = url.searchParams.get("scanId");
  const market = url.searchParams.get("market");

  if (!scanId || !market) {
    return json({ error: "Missing scan or market" }, { status: 400 });
  }

  const scan = await prisma.scan.findUnique({ where: { id: scanId } });
  if (!scan || scan.shopDomain !== session.shop) {
    return json({ error: "Scan not found" }, { status: 404 });
  }

  const results = ((scan.results as ComplianceFinding[] | null) ?? []).filter(
    (result) => result.market === market,
  );
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const baseFilename = `compliance_scan_${session.shop}_${market}_${timestamp}`;

  if (format === "pdf") {
    const pdfBuffer = await buildPdf(results, {
      shop: session.shop,
      market,
      startedAt: scan.startedAt,
    });
    return new Response(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${baseFilename}.pdf"`,
      },
    });
  }

  const csv = buildCsv(results);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="${baseFilename}.csv"`,
    },
  });
};

function buildCsv(results: ComplianceFinding[]) {
  const header = [
    "Product Title",
    "Status",
    "Compliance Score",
    "Violations",
    "Policy",
    "Law",
    "Severity",
    "Risk",
    "Why it matters",
    "AI guidance",
  ];

  const rows = results.flatMap((result) => {
    if (!result.violations.length) {
      return [
        [
          escapeCsv(result.productTitle),
          "Clean",
          String(result.complianceScore ?? 100),
          "0",
          "",
          "",
          "",
          "",
          "",
          "",
        ],
      ];
    }

    return result.violations.map((violation) => [
      escapeCsv(result.productTitle),
      result.status,
      String(result.complianceScore ?? 0),
      String(result.violations.length),
      escapeCsv(violation.policy),
      escapeCsv(violation.law),
      violation.severity,
      formatRisk(violation.riskScore),
      escapeCsv(violation.whyMatters),
      escapeCsv(violation.suggestion),
    ]);
  });

  return [header, ...rows].map((row) => row.join(",")).join("\n");
}

function escapeCsv(value: string) {
  if (value.includes(",") || value.includes("\"")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

async function buildPdf(
  results: ComplianceFinding[],
  meta: { shop: string; market: string; startedAt: Date },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(18).text("Google Ads Policy Copilot Report");
    doc.moveDown();
    doc.fontSize(12).text(`Shop: ${meta.shop}`);
    doc.text(`Market: ${meta.market.toUpperCase()}`);
    doc.text(`Generated: ${new Date().toLocaleString()}`);
    doc.text(`Scan started: ${meta.startedAt.toLocaleString()}`);
    doc.moveDown();

    results.forEach((result, index) => {
      doc.fontSize(14).text(`${index + 1}. ${result.productTitle}`);
      doc.fontSize(11).text(`Status: ${result.status} • Score: ${result.complianceScore ?? 0}%`);
      if (!result.violations.length) {
        doc.text("No violations detected.");
      } else {
        result.violations.forEach((violation, violationIndex) => {
          doc.moveDown(0.25);
          doc.fontSize(11).text(
            `${violationIndex + 1}) ${violation.policy} — ${violation.law} (${violation.severity}, ${formatRisk(violation.riskScore)} risk)`,
          );
          doc.fontSize(10).text(`Issue: ${violation.issue}`);
          doc.text(`Why it matters: ${violation.whyMatters}`);
          doc.text(`AI guidance: ${violation.suggestion}`);
          if (violation.sourceUrl) {
            doc.fillColor("#1c6ff8").text(violation.sourceUrl, { link: violation.sourceUrl });
            doc.fillColor("#000000");
          }
        });
      }
      doc.moveDown();
      if (index < results.length - 1) {
        doc.moveDown();
        doc.strokeColor("#cccccc").moveTo(40, doc.y).lineTo(doc.page.width - 40, doc.y).stroke();
        doc.moveDown();
      }
    });

    doc.end();
  });
}

function formatRisk(score: number) {
  return `${Math.round(Math.min(1, Math.max(0, score)) * 100)}%`;
}
