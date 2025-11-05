import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { setTimeout as sleep } from "node:timers/promises";

import open from "open";
import { PrismaClient, Prisma } from "@prisma/client";

const execFileAsync = promisify(execFile);
const POLL_INTERVAL_MS = 2000;
const TIMEOUT_MS = 4 * 60 * 1000;

type EnvConfig = {
  shopDomain: string;
  appUrl: string;
  host: string;
  sessionDb: string;
  sessionDbAbsolute: string;
  envPath: string;
  adminToken: string | null;
};

let prisma: PrismaClient | null = null;

async function main() {
  const env = resolveEnv();
  await ensurePrisma(env.sessionDbAbsolute);

  if (!env.adminToken) {
    await performHandshake(env);
  } else {
    console.log(
      `ℹ️ Existing Admin API token detected (token ${maskToken(env.adminToken)}) — skipping OAuth handshake.`,
    );
  }

  const latestToken = await attemptTokenLookup(env.shopDomain);
  if (latestToken) {
    await upsertEnvToken(env.envPath, latestToken);
  }

  const sqliteToken = await verifyWithSqlite(
    env.sessionDbAbsolute,
    env.shopDomain,
  );

  if (sqliteToken) {
    console.log("✅ Token retrieved and stored successfully.");
  } else {
    console.error("❌ OAuth handshake failed — retrying.");
    process.exitCode = 1;
  }

  await disconnectPrisma();
}

async function performHandshake(env: EnvConfig) {
  const handshakeUrl = `${stripTrailingSlash(env.appUrl)}/auth/login?shop=${encodeURIComponent(env.shopDomain)}`;
  console.log(`Opening OAuth handshake: ${handshakeUrl}`);

  await open(handshakeUrl);

  try {
    const token = await waitForToken(env.shopDomain);
    await upsertEnvToken(env.envPath, token);
    console.log(
      `✅ OAuth handshake complete for ${env.shopDomain} — .env updated (token ${maskToken(token)})`,
    );
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
  const host =
    process.env.HOST && process.env.HOST.trim().length > 0
      ? process.env.HOST
      : rawAppUrl;
  const sessionDb =
    process.env.SHOPIFY_SESSION_DB &&
    process.env.SHOPIFY_SESSION_DB.trim().length > 0
      ? process.env.SHOPIFY_SESSION_DB
      : "prisma/dev.sqlite";
  const sessionDbAbsolute = path.isAbsolute(sessionDb)
    ? sessionDb
    : path.resolve(process.cwd(), sessionDb);
  const adminToken =
    process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN &&
    process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN.trim().length > 0
      ? process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN.trim()
      : null;

  if (!shopDomain) {
    throw new Error("SHOP_DOMAIN is required in .env");
  }
  if (!rawAppUrl) {
    throw new Error("SHOPIFY_APP_URL is required in .env");
  }
  if (!host) {
    throw new Error("HOST must be set or fallback from SHOPIFY_APP_URL");
  }

  return {
    shopDomain,
    appUrl: rawAppUrl,
    host,
    sessionDb,
    sessionDbAbsolute,
    envPath,
    adminToken,
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

async function ensurePrisma(absoluteDb: string) {
  if (prisma) return;

  prisma = new PrismaClient({
    datasources: {
      db: {
        url: `file:${absoluteDb}`,
      },
    },
  });
}

async function disconnectPrisma() {
  if (!prisma) return;
  try {
    await prisma.$disconnect();
  } catch (error) {
    console.warn("Failed to disconnect Prisma cleanly", error);
  } finally {
    prisma = null;
  }
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
  if (!prisma) return null;

  try {
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

    if (session?.accessToken) {
      return session.accessToken;
    }
  } catch (error) {
    if (missingUpdatedAt(error)) {
      try {
        const rows = await prisma.$queryRaw<Array<{ accessToken: string }>>(
          Prisma.sql`
          SELECT accessToken
          FROM Session
          WHERE shop = ${shopDomain}
            AND accessToken IS NOT NULL
          ORDER BY updatedAt DESC
          LIMIT 1
        `,
        );

        if (rows.length > 0 && rows[0]?.accessToken) {
          return rows[0].accessToken;
        }
      } catch (rawError) {
        if (missingUpdatedAt(rawError)) {
          const fallbackRows = await prisma.$queryRaw<
            Array<{ accessToken: string }>
          >(Prisma.sql`
            SELECT accessToken
            FROM Session
            WHERE shop = ${shopDomain}
              AND accessToken IS NOT NULL
            ORDER BY rowid DESC
            LIMIT 1
          `);

          if (fallbackRows.length > 0 && fallbackRows[0]?.accessToken) {
            return fallbackRows[0].accessToken;
          }
        } else {
          throw rawError;
        }
      }
    } else {
      throw error;
    }
  }

  return null;
}

function missingUpdatedAt(error: unknown) {
  return error instanceof Error && /updatedAt/i.test(error.message ?? "");
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

async function verifyWithSqlite(dbPath: string, shopDomain: string) {
  try {
    const { stdout } = await execFileAsync("sqlite3", [
      dbPath,
      `SELECT accessToken FROM Session WHERE shop = '${shopDomain}' AND accessToken IS NOT NULL ORDER BY updatedAt DESC LIMIT 1;`,
    ]);
    const token = stdout.trim();
    if (token.length > 0) {
      console.log(`SQLite verification token: ${maskToken(token)}`);
      return token;
    }
    console.warn("SQLite verification returned no rows.");
    return null;
  } catch (error) {
    if (
      error instanceof Error &&
      /no such column: updatedAt/i.test(error.message)
    ) {
      try {
        const { stdout } = await execFileAsync("sqlite3", [
          dbPath,
          `SELECT accessToken FROM Session WHERE shop = '${shopDomain}' AND accessToken IS NOT NULL ORDER BY rowid DESC LIMIT 1;`,
        ]);
        const token = stdout.trim();
        if (token.length > 0) {
          console.log(`SQLite verification token: ${maskToken(token)}`);
          return token;
        }
        console.warn("SQLite verification returned no rows.");
        return null;
      } catch (fallbackError) {
        console.warn("SQLite verification fallback failed", fallbackError);
        return null;
      }
    }
    console.warn("SQLite verification failed", error);
    return null;
  }
}

function maskToken(token: string | null) {
  if (!token) return "unknown";
  return token.length > 6 ? `${token.slice(0, 6)}…` : token;
}

main().catch(async (error) => {
  console.error(error);
  await disconnectPrisma();
  process.exit(1);
});
