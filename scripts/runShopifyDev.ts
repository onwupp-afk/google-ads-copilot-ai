import "dotenv/config";
import { spawn } from "node:child_process";
import prisma from "../app/db.server";

const shopDomain = process.env.SHOP_DOMAIN?.trim();

if (!shopDomain) {
  console.error(
    "❌ SHOP_DOMAIN is missing. Add it to your .env before running `npm run dev`.",
  );
  process.exit(1);
}

async function bootstrap() {
  try {
    const shopCount = await prisma.shop.count();
    console.log(`🎉 Database connected and ready (shops: ${shopCount})`);
  } catch (error) {
    console.error("❌ Failed to connect to the database", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }

  const child = spawn(
    "shopify",
    ["app", "dev", "--store", shopDomain],
    {
      stdio: "inherit",
      env: process.env,
    },
  );

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });
}

bootstrap();
