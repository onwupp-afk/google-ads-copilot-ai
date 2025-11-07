/*
  Warnings:

  - The primary key for the `Scan` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `category` on the `Scan` table. All the data in the column will be lost.
  - You are about to drop the column `shopId` on the `Scan` table. All the data in the column will be lost.
  - You are about to drop the `Audit` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `shopDomain` to the `Scan` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Session` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Audit" DROP CONSTRAINT "Audit_scanId_fkey";

-- DropForeignKey
ALTER TABLE "Scan" DROP CONSTRAINT "Scan_shopId_fkey";

-- DropIndex
DROP INDEX "Scan_shopId_idx";

-- DropIndex
DROP INDEX "Scan_status_idx";

-- AlterTable
ALTER TABLE "Scan" DROP CONSTRAINT "Scan_pkey",
DROP COLUMN "category",
DROP COLUMN "shopId",
ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "complianceScore" DOUBLE PRECISION,
ADD COLUMN     "productsScanned" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "results" JSONB,
ADD COLUMN     "shopDomain" TEXT NOT NULL,
ADD COLUMN     "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "violations" INTEGER NOT NULL DEFAULT 0,
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "status" SET DEFAULT 'running',
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3),
ADD CONSTRAINT "Scan_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "expires" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Shop" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updatedAt" DROP DEFAULT,
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMP(3);

-- DropTable
DROP TABLE "Audit";
