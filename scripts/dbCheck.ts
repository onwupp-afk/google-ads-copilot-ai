import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const [sessions, shops, scans, audits] = await Promise.all([
    prisma.session.findMany({ select: { id: true, shop: true, updatedAt: true } }),
    prisma.shop.findMany({ select: { id: true, domain: true } }),
    prisma.scan.findMany({ select: { id: true, market: true, status: true } }),
    prisma.audit.findMany({ select: { id: true, ruleCode: true } }),
  ]);

  console.log("Sessions: ");
  console.table(sessions);
  console.log("Shops: ");
  console.table(shops);
  console.log("Scans: ");
  console.table(scans);
  console.log("Audits: ");
  console.table(audits);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
