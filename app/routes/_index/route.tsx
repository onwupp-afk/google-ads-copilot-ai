import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { Link } from "@remix-run/react";
import clsx from "clsx";

import styles from "./styles.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return null;
};

export default function App() {
  const features = [
    {
      title: "Multi-Market Compliance",
      description:
        "Enforce localized policy packs across Google Ads, Shopping feeds, and Shopify Markets.",
    },
    {
      title: "AI Rewrite Engine",
      description:
        "Auto-generate compliant copy the instant violations are detected—before disapprovals hit.",
    },
    {
      title: "Agency Dashboard",
      description:
        "Track policy scores, violations, and approvals across every storefront from a single command center.",
    },
  ];

  return (
    <div className={styles.index}>
      <main className={styles.hero}>
        <div className={styles.badge}>Google Ads Policy Copilot AI</div>
        <h1 className={styles.heading}>Policy Intelligence That Fixes Itself</h1>
        <p className={styles.text}>
          Detect, justify, and fix Google Ads and Shopping policy issues — automatically.
        </p>
        <div className={styles.actions}>
          <a className={clsx(styles.button, styles.primary)} href="/auth">
            Connect Your Store
          </a>
          <Link className={clsx(styles.button, styles.secondary)} to="/app">
            Go to Dashboard
          </Link>
        </div>
      </main>
      <section className={styles.features}>
        {features.map((feature) => (
          <article key={feature.title} className={styles.featureCard}>
            <h2>{feature.title}</h2>
            <p>{feature.description}</p>
          </article>
        ))}
      </section>
      <footer className={styles.footer}>
        Google Ads Policy Copilot AI — built for agencies and policy-critical brands.
      </footer>
    </div>
  );
}
