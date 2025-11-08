-- CreateTable
CREATE TABLE "ProductScanHistory" (
    "id" TEXT NOT NULL,
    "scanId" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productTitle" TEXT NOT NULL,
    "market" TEXT NOT NULL,
    "riskScore" DOUBLE PRECISION NOT NULL,
    "violationsCount" INTEGER NOT NULL,
    "complianceScore" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductScanHistory_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ProductScanHistory" ADD CONSTRAINT "ProductScanHistory_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "Scan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "ProductScanHistory_productId_market_idx" ON "ProductScanHistory"("productId", "market");
CREATE INDEX "ProductScanHistory_shopDomain_market_idx" ON "ProductScanHistory"("shopDomain", "market");
