import "dotenv/config";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

import open from "open";
import { PrismaClient } from "@prisma/client";

const POLL_INTERVAL_MS = 2000;
const TIMEOUT_MS = 4 * 60 * 1000;

async function main() {
  const env = resolveEnv();
  const prisma = createPrisma(env.sessionDbUrl);

  try {
    const handshakeUrl = buildHandshakeUrl(env.appUrl, env.shopDomain);
    console.log(`🔗 Opening OAuth handshake: ${handshakeUrl}`);
    await open(handshakeUrl);

    const token = await waitForToken(prisma, env.shopDomain);
    await upsertEnvToken(env.envPath, token);

    console.log(`✅ OAuth handshake complete — Admin API token saved (${maskToken(token)})`);
  } catch (error) {
    console.error("❌ OAuth failed — please check redirect URLs");
    if (error instanceof Error) {
      console.error(error.message);
    }
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

main();

function resolveEnv() {
  const shopDomain = requireEnv("SHOP_DOMAIN");
  const appUrl = stripTrailingSlash(requireEnv("SHOPIFY_APP_URL"));
  const envPath = path.resolve(process.cwd(), ".env");
  const sessionDbUrl = resolveSessionDbUrl();

  return {
    shopDomain,
    appUrl,
    envPath,
    sessionDbUrl,
  } as const;
}

function resolveSessionDbUrl() {
  const configured = process.env.SHOPIFY_SESSION_DB?.trim();
  if (configured) {
    if (/^[a-z]+:\/\//i.test(configured)) {
      return configured;
    }
    const absolutePath = path.isAbsolute(configured)
      ? configured
      : path.join(process.cwd(), configured);
    if (existsSync(absolutePath)) {
      return `file:${absolutePath}`;
    }
    console.warn(`[autoOAuth] Session DB not found at ${absolutePath}. Falling back to DATABASE_URL.`);
  }

  const fallback = process.env.DATABASE_URL || process.env.DIRECT_DATABASE_URL;
  if (!fallback) {
    throw new Error("DATABASE_URL (or DIRECT_DATABASE_URL) is required to poll Shopify sessions.");
  }
  return fallback;
}

function buildHandshakeUrl(appUrl: string, shopDomain: string) {
  const base = appUrl.replace(/\/$/, "");
  const url = `${base}/auth/login?shop=${encodeURIComponent(shopDomain)}`;
  return url;
}

function createPrisma(url: string) {
  return new PrismaClient({
    datasources: {
      db: { url },
    },
  });
}

async function waitForToken(prisma: PrismaClient, shopDomain: string) {
  const deadline = Date.now() + TIMEOUT_MS;

  while (Date.now() < deadline) {
    const record = await prisma.session.findFirst({
      where: {
        shop: shopDomain,
        accessToken: { not: null },
      },
      orderBy: { updatedAt: "desc" },
    });

    if (record?.accessToken) {
      return record.accessToken.trim();
    }

    await sleep(POLL_INTERVAL_MS);
  }

  throw new Error("Timed out waiting for Shopify Admin API token. Approve the app in the browser and rerun npm run auto:oauth.");
}

async function upsertEnvToken(envPath: string, token: string) {
  let contents = "";
  try {
    contents = await fs.readFile(envPath, "utf8");
  } catch {
    contents = "";
  }

  const normalized = contents.replace(/\r\n/g, "\n");
  const lines = normalized.length ? normalized.split("\n") : [];
  let tokenLineFound = false;

  const nextLines = lines.map((line) => {
    if (line.startsWith("SHOPIFY_ADMIN_API_ACCESS_TOKEN=")) {
      tokenLineFound = true;
      return `SHOPIFY_ADMIN_API_ACCESS_TOKEN=${token}`;
    }
    return line;
  });

  if (!tokenLineFound) {
    nextLines.push(`SHOPIFY_ADMIN_API_ACCESS_TOKEN=${token}`);
  }

  const serialized = `${nextLines.join("\n").replace(/\n*$/, "\n")}`;
  await fs.writeFile(envPath, serialized, "utf8");
}

function maskToken(token: string) {
  if (!token) return "";
  return `${token.slice(0, 6)}••••`;
}

function requireEnv(key: string) {
  const value = process.env[key];
  if (!value || value.trim().length === 0) {
    throw new Error(`${key} is required`);
  }
  return value.trim();
}

function stripTrailingSlash(value: string) {
  return value.replace(/\/$/, "");
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
