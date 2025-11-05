import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";

import open from "open";
import prisma from "../app/db.server";

const POLL_INTERVAL_MS = 2000;
const TIMEOUT_MS = 4 * 60 * 1000;

type EnvConfig = {
  shopDomain: string;
  appUrl: string;
  envPath: string;
  adminToken: string | null;
  apiKey: string;
  scopes: string;
  authCallbackUrl: string;
  environment: "production" | "development";
};

type SessionSnapshot = {
  id: string;
  accessToken: string | null;
  expires: Date | null;
};

async function main() {
  const env = resolveEnv();

  console.log(`SHOPIFY_APP_URL → ${env.appUrl}`);
  console.log(`SHOPIFY_API_KEY → ${env.apiKey}`);

  const session = await ensureOfflineSession(env.shopDomain);
  const tokenState = await getTokenState(env, session);

  if (tokenState.status === "valid") {
    console.log("✅ Existing token valid — skipping OAuth");
    await upsertEnvTokenWithRetry(env.envPath, tokenState.token);
    await upsertSessionToken(session.id, tokenState.token);
    console.log("✅ Token validated");
    await prisma.$disconnect();
    return;
  }

  console.log("⚙️ Running OAuth handshake...");
  await performHandshake(env, session.id);

  const refreshedToken = await getTokenState(env, session);
  if (refreshedToken.status !== "valid") {
    console.error("❌ OAuth handshake failed — no token available after retry.");
    process.exitCode = 1;
    await prisma.$disconnect();
    return;
  }

  await upsertEnvTokenWithRetry(env.envPath, refreshedToken.token);
  await upsertSessionToken(session.id, refreshedToken.token);

  console.log("🔑 Token received and stored successfully");
  console.log("✅ Token validated");

  await prisma.$disconnect();
}

async function performHandshake(env: EnvConfig, sessionId: string) {
  const redirectUri =
    env.environment === "production"
      ? "https://aithorapp.co.uk/api/auth/callback"
      : env.authCallbackUrl || `${stripTrailingSlash(env.appUrl)}/api/auth/callback`;

  const state = generateState(sessionId);
  const installUrl = `https://${env.shopDomain}/admin/oauth/install?client_id=${encodeURIComponent(
    env.apiKey,
  )}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(
    env.scopes,
  )}&state=${encodeURIComponent(state)}`;

  console.log(`🌐 Opening install URL: ${installUrl}`);
  await open(installUrl);

  try {
    const token = await waitForToken(env.shopDomain);
    await upsertEnvTokenWithRetry(env.envPath, token);
    await upsertSessionToken(sessionId, token);
  } catch (error) {
    console.error(
      "❌ Timed out waiting for the Admin API token. Approve the app in the Shopify window, then rerun npm run auto:oauth.",
    );
    if (error instanceof Error) {
      console.error(error.message);
    }
    throw error;
  }
}

function resolveEnv(): EnvConfig {
  const envPath = path.resolve(process.cwd(), ".env");

  const shopDomain = requireEnv("SHOP_DOMAIN");
  const rawAppUrl = requireEnv("SHOPIFY_APP_URL");
  const adminToken =
    process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN &&
    process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN.trim().length > 0
      ? process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN.trim()
      : null;

  return {
    shopDomain,
    appUrl: stripTrailingSlash(rawAppUrl),
    envPath,
    adminToken,
    apiKey: requireEnv("SHOPIFY_API_KEY"),
    scopes: requireEnv("SCOPES"),
    authCallbackUrl:
      process.env.SHOPIFY_AUTH_CALLBACK_URL &&
      process.env.SHOPIFY_AUTH_CALLBACK_URL.trim().length > 0
        ? process.env.SHOPIFY_AUTH_CALLBACK_URL.trim()
        : `${stripTrailingSlash(rawAppUrl)}/auth/callback`,
    environment: process.env.NODE_ENV === "production" ? "production" : "development",
  };
}

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value || value.trim().length === 0) {
    throw new Error(`${key} is missing from environment variables.`);
  }
  return value;
}

function stripTrailingSlash(url: string) {
  return url.replace(/\/$/, "");
}

async function waitForToken(shopDomain: string) {
  const deadline = Date.now() + TIMEOUT_MS;

  while (Date.now() < deadline) {
    const token = await attemptTokenLookup(shopDomain);
    if (token) {
      return token;
    }
    await sleep(POLL_INTERVAL_MS);
  }

  throw new Error("Timed out while waiting for the Admin API token.");
}

async function attemptTokenLookup(shopDomain: string): Promise<string | null> {
  const session = await prisma.session.findFirst({
    where: {
      shop: shopDomain,
      accessToken: {
        not: null,
      },
    },
    orderBy: {
      updatedAt: "desc",
    },
  });

  return session?.accessToken ?? null;
}

async function upsertEnvToken(envPath: string, token: string) {
  let contents = "";
  try {
    contents = await fs.readFile(envPath, "utf8");
  } catch {
    contents = "";
  }

  const lines = contents.split(/\r?\n/);
  let replaced = false;

  const updated = lines.map((line) => {
    if (line.startsWith("SHOPIFY_ADMIN_API_ACCESS_TOKEN=")) {
      replaced = true;
      return `SHOPIFY_ADMIN_API_ACCESS_TOKEN=${token}`;
    }
    return line;
  });

  if (!replaced) {
    updated.push(`SHOPIFY_ADMIN_API_ACCESS_TOKEN=${token}`);
  }

  await fs.writeFile(
    envPath,
    `${updated
      .filter((line, index) => !(line === "" && index === updated.length - 1))
      .join("\n")}\n`,
    "utf8",
  );
}

async function upsertEnvTokenWithRetry(envPath: string, token: string, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      await upsertEnvToken(envPath, token);
      return;
    } catch (error) {
      console.error(`Failed to update .env on attempt ${attempt}`, error);
      if (attempt === retries) {
        throw error;
      }
    }
  }
}

async function ensureOfflineSession(shopDomain: string): Promise<SessionSnapshot> {
  const offlineId = `offline_${shopDomain}`;

  const existing = await prisma.session.findUnique({
    where: {
      id: offlineId,
    },
  });

  if (existing) {
    return {
      id: existing.id,
      accessToken: existing.accessToken,
      expires: existing.expires ?? null,
    };
  }

  await prisma.session.create({
    data: {
      id: offlineId,
      shop: shopDomain,
      state: "offline",
      isOnline: false,
      scope: process.env.SCOPES ?? "",
      accessToken: "",
    },
  });

  return {
    id: offlineId,
    accessToken: "",
    expires: null,
  };
}

async function upsertSessionToken(sessionId: string, token: string) {
  await prisma.session.update({
    where: { id: sessionId },
    data: {
      accessToken: token,
      isOnline: false,
    },
  });
}

async function getTokenState(env: EnvConfig, session: SessionSnapshot) {
  const latestSession = await prisma.session.findUnique({
    where: { id: session.id },
  });

  const token =
    latestSession?.accessToken ||
    session.accessToken ||
    env.adminToken ||
    (await attemptTokenLookup(env.shopDomain)) ||
    null;

  if (!token) {
    return { status: "missing" as const, token: null };
  }

  const expires = latestSession?.expires ?? session.expires;
  if (expires && expires <= new Date()) {
    console.warn("Detected expired Admin API token — forcing re-handshake.");
    return { status: "expired" as const, token: null };
  }

  return { status: "valid" as const, token };
}

function generateState(seed: string) {
  return `${seed}-${randomUUID()}`;
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
