import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const shop = await prisma.shop.create({
    data: {
      domain: "aithor-test-store.myshopify.com",
      plan: "plus",
      country: "GB",
      currency: "GBP",
    },
  });

  const scan = await prisma.scan.create({
    data: {
      shopId: shop.id,
      market: "UK",
      category: "E-bikes",
      status: "completed",
    },
  });

  await prisma.audit.create({
    data: {
      scanId: scan.id,
      ruleCode: "GOOG-EBIKE-01",
      severity: "medium",
      message: "Contains speed claim",
      suggestion: "Replace 'fastest' with 'high-performance'",
    },
  });

  console.log("✅ Neon DB seeded successfully");
}

main()
  .catch((error) => {
    console.error("❌ Failed to seed Neon DB", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
