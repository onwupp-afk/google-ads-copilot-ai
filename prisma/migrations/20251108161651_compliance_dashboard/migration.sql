-- Create ScanResult table
CREATE TABLE IF NOT EXISTS "ScanResult" (
    "id" TEXT NOT NULL,
    "scanId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productTitle" TEXT NOT NULL,
    "ruleRef" TEXT NOT NULL,
    "policy" TEXT,
    "law" TEXT,
    "market" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "riskScore" DOUBLE PRECISION NOT NULL,
    "aiGuidance" TEXT,
    "whyMatters" TEXT,
    "sourceUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ScanResult_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ScanResult_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "Scan"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "ScanResult_scanId_idx" ON "ScanResult"("scanId");
CREATE INDEX IF NOT EXISTS "ScanResult_productId_idx" ON "ScanResult"("productId");

-- Create ProductScanHistory table
CREATE TABLE IF NOT EXISTS "ProductScanHistory" (
    "id" TEXT NOT NULL,
    "scanId" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "market" TEXT NOT NULL,
    "complianceScore" DOUBLE PRECISION NOT NULL,
    "violations" INTEGER NOT NULL,
    "scannedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductScanHistory_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ProductScanHistory_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "Scan"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "ProductScanHistory_productId_market_idx" ON "ProductScanHistory"("productId", "market");
CREATE INDEX IF NOT EXISTS "ProductScanHistory_shopDomain_market_idx" ON "ProductScanHistory"("shopDomain", "market");

-- Create ScanSchedule table
CREATE TABLE IF NOT EXISTS "ScanSchedule" (
    "id" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "market" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "nextRun" TIMESTAMP(3),
    "lastRun" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ScanSchedule_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ScanSchedule_shopDomain_productId_idx" ON "ScanSchedule"("shopDomain", "productId");
CREATE UNIQUE INDEX IF NOT EXISTS "ScanSchedule_shopDomain_productId_unique" ON "ScanSchedule"("shopDomain", "productId");
