import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

type EnvRecord = Record<string, string>;

const WORKING_DIR = process.cwd();
const ENV_PATH = path.join(WORKING_DIR, ".env");
const PROJECT_JSON_PATH = path.join(WORKING_DIR, ".shopify", "project.json");
const DEV_COMMAND = process.env.SHOPIFY_DEV_COMMAND?.split(" ") || [
  "shopify",
  "app",
  "dev",
];

async function main() {
  const envVars = await readEnv();

  const appUrl = process.env.SHOPIFY_APP_URL || envVars.SHOPIFY_APP_URL;
  if (!appUrl) {
    console.error(
      "❌ Missing SHOPIFY_APP_URL. Please verify your .env configuration.",
    );
    process.exit(1);
  }

  const shopDomain = await resolveShopDomain(envVars);
  if (!shopDomain) {
    console.error(
      "❌ Unable to determine shop domain. Set SHOP_DOMAIN in .env or .shopify/project.json.",
    );
    process.exit(1);
  }

  process.env.SHOPIFY_APP_URL = appUrl;

  const devProcess = spawn(DEV_COMMAND[0]!, DEV_COMMAND.slice(1), {
    stdio: "inherit",
    env: process.env,
  });

  devProcess.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });

  forwardSignals(devProcess);

  runHandshakeFlow(appUrl, shopDomain)
    .catch((error) => {
      console.error("❌ OAuth failed — please check redirect URLs");
      if (error) {
        console.error(error);
      }
    })
    .finally(() => {
      // Keep process alive while dev server runs.
    });
}

async function runHandshakeFlow(appUrl: string, shopDomain: string) {
  const reachable = await waitForApp(appUrl);
  if (!reachable) {
    throw new Error(
      `Could not reach ${appUrl}. Verify your deployment is accessible.`,
    );
  }

  const triggered = await triggerHandshake(appUrl, shopDomain);
  if (!triggered) {
    throw new Error("Handshake endpoint did not respond as expected.");
  }

  const token = await waitForAdminToken(shopDomain);
  if (!token) {
    throw new Error("Access token was not stored in the session database.");
  }

  await upsertEnvValue("SHOPIFY_ADMIN_API_ACCESS_TOKEN", token);
  console.log("✅ OAuth handshake complete — Admin API token saved");
}

async function readEnv(): Promise<EnvRecord> {
  const env: EnvRecord = {};
  try {
    const raw = await fs.readFile(ENV_PATH, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      if (!line || line.trim().startsWith("#") || !line.includes("=")) {
        continue;
      }
      const index = line.indexOf("=");
      const key = line.slice(0, index).trim();
      const value = line.slice(index + 1).trim();
      env[key] = value;
    }
  } catch {
    // File may not exist yet.
  }
  return env;
}

async function upsertEnvValue(key: string, value: string) {
  let lines: string[] = [];
  try {
    const contents = await fs.readFile(ENV_PATH, "utf8");
    lines = contents.split(/\r?\n/);
  } catch {
    // File will be created.
  }

  let replaced = false;
  const updated = lines.map((line) => {
    if (!line || line.startsWith("#") || !line.includes("=")) {
      return line;
    }
    if (line.startsWith(`${key}=`)) {
      replaced = true;
      return `${key}=${value}`;
    }
    return line;
  });

  if (!replaced) {
    updated.push(`${key}=${value}`);
  }

  const sanitized = updated.filter(
    (line, idx) => !(line === "" && idx === updated.length - 1),
  );
  sanitized.push(""); // Ensure trailing newline.

  await fs.writeFile(ENV_PATH, sanitized.join("\n"), "utf8");
}

async function resolveShopDomain(envVars: EnvRecord) {
  if (process.env.SHOP_DOMAIN) {
    return process.env.SHOP_DOMAIN;
  }
  if (envVars.SHOP_DOMAIN) {
    return envVars.SHOP_DOMAIN;
  }

  try {
    const raw = await fs.readFile(PROJECT_JSON_PATH, "utf8");
    const parsed = JSON.parse(raw) as Record<
      string,
      { dev_store_url?: string }
    >;
    const firstEntry = Object.values(parsed)[0];
    if (!firstEntry?.dev_store_url) {
      return null;
    }
    const url = firstEntry.dev_store_url.startsWith("http")
      ? new URL(firstEntry.dev_store_url)
      : new URL(`https://${firstEntry.dev_store_url}`);
    return url.hostname;
  } catch {
    return null;
  }
}

async function waitForApp(appUrl: string, attempts = 60, intervalMs = 2000) {
  const url = new URL(appUrl);
  for (let count = 0; count < attempts; count += 1) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      const response = await fetch(url.toString(), {
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (response.ok || (response.status >= 200 && response.status < 500)) {
        return true;
      }
    } catch {
      // Swallow and retry.
    }
    await delay(intervalMs);
  }
  return false;
}

async function triggerHandshake(appUrl: string, shopDomain: string) {
  const url = new URL("/auth", appUrl);
  url.searchParams.set("shop", shopDomain);

  try {
    const response = await fetch(url.toString(), {
      redirect: "manual",
    });
    return response.status >= 200 && response.status < 400;
  } catch {
    return false;
  }
}

async function waitForAdminToken(shopDomain: string, retries = 60) {
  process.env.NODE_ENV = process.env.NODE_ENV || "development";
  const prismaModule = await import("../app/db.server");
  const prisma = prismaModule.default;

  let warned = false;
  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      const session = await prisma.session.findFirst({
        where: {
          shop: shopDomain,
          isOnline: false,
        },
        orderBy: {
          expires: "desc",
        },
      });
      if (session?.accessToken) {
        return session.accessToken;
      }
    } catch (error) {
      if (!warned) {
        console.warn("Waiting for session store…", error);
        warned = true;
      }
    }
    await delay(2000);
  }

  return null;
}

function forwardSignals(child: ReturnType<typeof spawn>) {
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      if (!child.killed) {
        child.kill(signal);
      }
    });
  }
}

main().catch((error) => {
  console.error("❌ OAuth failed — please check redirect URLs");
  if (error) {
    console.error(error);
  }
  process.exit(1);
});
