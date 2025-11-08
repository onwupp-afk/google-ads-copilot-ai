/*
  Warnings:

  - You are about to drop the column `createdAt` on the `ProductScanHistory` table. All the data in the column will be lost.
  - You are about to drop the column `riskScore` on the `ProductScanHistory` table. All the data in the column will be lost.
  - You are about to drop the column `violationsCount` on the `ProductScanHistory` table. All the data in the column will be lost.
  - Added the required column `violations` to the `ProductScanHistory` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "ScanSchedule_shopDomain_productId_idx";

-- AlterTable
ALTER TABLE "ProductScanHistory" DROP COLUMN "createdAt",
DROP COLUMN "riskScore",
DROP COLUMN "violationsCount",
ADD COLUMN     "scannedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "violations" INTEGER NOT NULL,
ALTER COLUMN "complianceScore" DROP DEFAULT;

-- RenameIndex
ALTER INDEX "ScanSchedule_shopDomain_productId_unique" RENAME TO "ScanSchedule_shopDomain_productId_key";
