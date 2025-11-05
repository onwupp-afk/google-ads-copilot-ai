CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS "Session" (
    "id" TEXT PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT FALSE,
    "scope" TEXT,
    "expires" TIMESTAMP,
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT FALSE,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT FALSE,
    "emailVerified" BOOLEAN DEFAULT FALSE,
    "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION set_session_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW."updatedAt" = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS session_updated_at ON "Session";
CREATE TRIGGER session_updated_at
BEFORE UPDATE ON "Session"
FOR EACH ROW EXECUTE FUNCTION set_session_updated_at();

CREATE TABLE IF NOT EXISTS "Shop" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "domain" TEXT NOT NULL UNIQUE,
    "plan" TEXT,
    "country" TEXT,
    "currency" TEXT,
    "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "Scan" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "shopId" UUID NOT NULL,
    "market" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT "Scan_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "Scan_shopId_idx" ON "Scan"("shopId");
CREATE INDEX IF NOT EXISTS "Scan_status_idx" ON "Scan"("status");

CREATE TABLE IF NOT EXISTS "Audit" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "scanId" UUID NOT NULL,
    "ruleCode" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "suggestion" TEXT,
    "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT "Audit_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "Scan"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "Audit_scanId_idx" ON "Audit"("scanId");
CREATE INDEX IF NOT EXISTS "Audit_ruleCode_idx" ON "Audit"("ruleCode");
