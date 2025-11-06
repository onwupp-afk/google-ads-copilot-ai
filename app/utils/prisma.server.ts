import { PrismaClient } from "@prisma/client";

const MAX_RETRIES = Number(process.env.PRISMA_CONNECTION_RETRIES ?? 5);
const RETRY_DELAY_MS = Number(process.env.PRISMA_CONNECTION_RETRY_DELAY_MS ?? 2000);

declare global {
  // eslint-disable-next-line no-var
  var __dbClient: PrismaClient | undefined;
  // eslint-disable-next-line no-var
  var __dbReadyPromise: Promise<PrismaClient> | undefined;
}

const prisma = globalThis.__dbClient ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__dbClient = prisma;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function connectWithRetry(
  client: PrismaClient,
  retries = MAX_RETRIES,
  delayMs = RETRY_DELAY_MS,
) {
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      await client.$connect();
      console.log("✅ Connected to Neon Postgres");
      return client;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`❌ Prisma connection failed (attempt ${attempt}/${retries}):`, message);
      if (attempt === retries) {
        throw error;
      }
      await wait(delayMs);
    }
  }
  return client;
}

const readyPromise = globalThis.__dbReadyPromise ?? connectWithRetry(prisma);

if (process.env.NODE_ENV !== "production") {
  globalThis.__dbReadyPromise = readyPromise;
}

readyPromise.catch((error) => {
  console.error("❌ Prisma failed to initialize:", error);
});

export async function getDb() {
  await readyPromise;
  return prisma;
}

export const db = prisma;
export default db;
export const dbReady = readyPromise;
