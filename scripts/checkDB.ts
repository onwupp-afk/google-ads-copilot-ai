import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

(async () => {
  try {
    await prisma.$connect();
    console.log("✅ Database connection successful!");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("❌ Database connection failed:", message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
