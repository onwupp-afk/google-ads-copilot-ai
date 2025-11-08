-- Legacy migration recreated to satisfy Prisma history
-- Ensures ProductScanHistory table exists

CREATE TABLE IF NOT EXISTS "ProductScanHistory" (
    "id" TEXT NOT NULL,
    "scanId" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "market" TEXT NOT NULL,
    "riskScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "violationsCount" INTEGER NOT NULL DEFAULT 0,
    "complianceScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductScanHistory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ProductScanHistory_productId_market_idx"
  ON "ProductScanHistory"("productId", "market");

CREATE INDEX IF NOT EXISTS "ProductScanHistory_shopDomain_market_idx"
  ON "ProductScanHistory"("shopDomain", "market");

ALTER TABLE "ProductScanHistory"
  ADD CONSTRAINT "ProductScanHistory_scanId_fkey"
  FOREIGN KEY ("scanId") REFERENCES "Scan"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
