-- AlterTable
ALTER TABLE "ProductScanHistory" ADD COLUMN     "aiConfidenceAvg" DOUBLE PRECISION,
ADD COLUMN     "issues" JSONB,
ADD COLUMN     "resolvedIssues" INTEGER,
ADD COLUMN     "scopeUsed" TEXT,
ADD COLUMN     "totalIssues" INTEGER;

-- CreateTable
CREATE TABLE "FixLog" (
    "id" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "fixType" TEXT NOT NULL,
    "fieldUpdated" TEXT NOT NULL,
    "scopeUsed" TEXT NOT NULL,
    "aiModelVersion" TEXT,
    "market" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "errorMessage" TEXT,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "FixLog_pkey" PRIMARY KEY ("id")
);
