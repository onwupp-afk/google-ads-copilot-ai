import "dotenv/config";
import { spawn } from "node:child_process";

const shopDomain = process.env.SHOP_DOMAIN?.trim();

if (!shopDomain) {
  console.error(
    "❌ SHOP_DOMAIN is missing. Add it to your .env before running `npm run dev`.",
  );
  process.exit(1);
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
