// Public Landing Page — not embedded in Shopify.

import type { MetaFunction } from "@remix-run/node";
import { Link } from "@remix-run/react";
import { motion } from "framer-motion";

export const meta: MetaFunction = () => [
  { title: "Google Ads Copilot AI | Policy Intelligence That Fixes Itself" },
  {
    name: "description",
    content:
      "Google Ads Copilot AI keeps your Google Ads and Shopping campaigns compliant with automated policy intelligence, AI rewrite suggestions, and agency-ready dashboards.",
  },
];

const SECTION_VARIANTS = {
  hidden: { opacity: 0, y: 32 },
  visible: { opacity: 1, y: 0 },
};

const features = [
  {
    title: "Multi-Market Policy Intelligence",
    description:
      "Scan every Shopify Market with localized Google Ads rules. Flag, prioritize, and justify issues before campaigns launch.",
    metric: "12+ regions monitored",
  },
  {
    title: "AI Rewrite Suggestions",
    description:
      "Generate compliant ad copy on the spot. Explain violations to marketing teams and approve fixes in a click.",
    metric: "83% faster resolution",
  },
  {
    title: "Agency Workflow Dashboard",
    description:
      "Coordinate multi-store policy reviews, schedule audits, and export audit-ready evidence for clients and platforms.",
    metric: "Unlimited storefronts",
  },
];

const testimonials = [
  {
    quote:
      "“Policy Copilot gives our performance teams the receipts we need. Clients see the exact fix and rationale in minutes.”",
    author: "Amelia Chen",
    role: "VP of Performance · Elevate Growth",
  },
  {
    quote:
      "“We run fifty campaigns across six markets. Copilot keeps everything in policy without slowing conversions.”",
    author: "Liam Patel",
    role: "Director of Ecommerce · Trailhead Outfitters",
  },
  {
    quote:
      "“The exportable audit reports make Shopify Plus compliance reviews painless. Our ops team loves it.”",
    author: "Sofia Martínez",
    role: "Head of Operations · Aurora Collective",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white font-sans text-slate-900">
      <HeroSection />
      <FeaturesSection />
      <PreviewSection />
      <TestimonialsSection />
      <CtaBanner />
      <Footer />
    </div>
  );
}

function HeroSection() {
  return (
    <section className="relative overflow-hidden bg-slate-950 text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_-20%,rgba(124,106,255,0.4),transparent_55%),radial-gradient(circle_at_80%_0%,rgba(15,23,42,0.9),transparent_65%)]" />
      <div className="relative mx-auto flex max-w-6xl flex-col gap-12 px-6 py-24 md:flex-row md:items-center md:py-28">
        <motion.div
          initial={{ opacity: 0, y: 32 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="max-w-xl space-y-7"
        >
          <span className="inline-flex items-center rounded-full bg-white/10 px-4 py-1 text-xs font-semibold uppercase tracking-widest text-white/60">
            Google Ads Copilot AI
          </span>
          <h1 className="text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
            Policy Intelligence That Fixes Itself
          </h1>
          <p className="text-lg text-white/80">
            Detect, justify, and fix Google Ads & Shopping policy violations automatically. Launch
            campaigns with confidence across every market.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              to="/auth/login"
              className="inline-flex items-center justify-center rounded-full bg-white px-6 py-3 text-sm font-semibold text-slate-900 shadow-lg shadow-slate-900/20 transition hover:-translate-y-0.5 hover:bg-slate-100"
            >
              Install on Shopify
            </Link>
            <a
              href="#features"
              className="inline-flex items-center justify-center rounded-full border border-white/30 px-6 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-white/10"
            >
              View Features
            </a>
          </div>
          <dl className="grid grid-cols-2 gap-4 text-left text-sm text-white/70 sm:grid-cols-3">
            <div>
              <dt className="font-semibold text-white">99.9% uptime</dt>
              <dd className="text-xs text-white/60">Policy monitoring infrastructure</dd>
            </div>
            <div>
              <dt className="font-semibold text-white">6 continents</dt>
              <dd className="text-xs text-white/60">Localized Google Ads coverage</dd>
            </div>
            <div>
              <dt className="font-semibold text-white">48h onboarding</dt>
              <dd className="text-xs text-white/60">From install to compliance insights</dd>
            </div>
          </dl>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, scale: 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.7, delay: 0.1 }}
          className="relative w-full max-w-lg"
        >
          <div className="absolute -inset-4 rounded-[2.5rem] bg-indigo-300/30 blur-3xl" />
          <div className="relative overflow-hidden rounded-[2.25rem] border border-white/15 bg-white/5 p-6 backdrop-blur">
            <header className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 p-4">
              <div>
                <p className="text-xs uppercase tracking-widest text-white/60">Live dashboard</p>
                <p className="mt-1 text-sm font-medium text-white">AITHOR Compliance Center</p>
              </div>
              <span className="rounded-full bg-emerald-400/20 px-3 py-1 text-xs font-semibold text-emerald-100">
                Synced
              </span>
            </header>
            <div className="mt-6 grid gap-4">
              <div className="rounded-xl bg-white/10 p-4">
                <p className="text-xs text-white/70">Global compliance score</p>
                <p className="mt-2 text-3xl font-semibold text-white">94%</p>
                <p className="mt-2 text-xs text-emerald-200">28 violations resolved in the last 24h</p>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-white/10 p-4">
                <div>
                  <p className="text-xs text-white/60">Next scheduled sweep</p>
                  <p className="mt-1 text-sm font-semibold text-white">EU & AU product feeds</p>
                </div>
                <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/70">
                  In 2h
                </span>
              </div>
              <div className="rounded-xl bg-white/10 p-4">
                <p className="text-xs text-white/60">AI rewrite suggestion</p>
                <p className="mt-2 text-sm text-white/80">
                  “Replace restricted medical term in headline. Insert compliant disclaimer referencing
                  local regulations.”
                </p>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function FeaturesSection() {
  return (
    <section id="features" className="bg-white">
      <motion.div
        className="mx-auto max-w-6xl px-6 py-20 text-center"
        variants={SECTION_VARIANTS}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.3 }}
        transition={{ duration: 0.5 }}
      >
        <span className="rounded-full bg-slate-100 px-4 py-1 text-xs font-semibold uppercase tracking-widest text-slate-500">
          Why teams choose Copilot
        </span>
        <h2 className="mt-5 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
          Automate every step of Google Ads compliance
        </h2>
        <p className="mt-4 text-base text-slate-600">
          Stay ahead of policy updates with intelligent monitoring, AI-generated fixes, and workflows
          tuned for ecommerce operators.
        </p>
        <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <motion.article
              key={feature.title}
              variants={SECTION_VARIANTS}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.45 }}
              className="h-full rounded-3xl border border-slate-100 bg-white p-8 text-left shadow-sm shadow-slate-900/5 transition hover:-translate-y-1 hover:shadow-md"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-indigo-400">
                {feature.metric}
              </p>
              <h3 className="mt-3 text-xl font-semibold text-slate-900">{feature.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-slate-600">
                {feature.description}
              </p>
            </motion.article>
          ))}
        </div>
      </motion.div>
    </section>
  );
}

function PreviewSection() {
  return (
    <motion.section
      variants={SECTION_VARIANTS}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.25 }}
      transition={{ duration: 0.6 }}
      className="bg-slate-50"
    >
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-12 px-6 py-20 md:flex-row md:gap-16">
        <div className="md:w-1/2">
          <h2 className="text-3xl font-semibold tracking-tight text-slate-900">
            A control center for every policy conversation
          </h2>
          <p className="mt-4 text-base leading-relaxed text-slate-600">
            Visualize policy alignment across feeds, ad groups, and campaigns. Copilot centralizes
            briefing notes, AI-generated fixes, and approval history so marketing, legal, and client
            teams stay in sync.
          </p>
          <ul className="mt-6 space-y-3 text-sm text-slate-600">
            <li>• Real-time posture by Google Ads account, region, and product line</li>
            <li>• Automatic policy tagging with context and recommended remediation</li>
            <li>• One-click exports for compliance reviews and stakeholder meetings</li>
          </ul>
        </div>
        <div className="md:w-1/2">
          <div className="relative rounded-[2.75rem] border border-slate-100 bg-white p-8 shadow-xl shadow-slate-900/10">
            <div className="absolute inset-0 -translate-y-4 rounded-[2.75rem] bg-gradient-to-tr from-slate-100 via-white to-white blur-2xl" />
            <div className="relative overflow-hidden rounded-[2rem] border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-slate-100">
              <img
                src="/images/dashboard-preview.png"
                alt="Google Ads Copilot AI dashboard preview"
                className="hidden w-full object-cover md:block"
              />
              <div className="flex h-64 flex-col items-center justify-center gap-2 text-center text-slate-500 md:hidden">
                <span className="text-sm uppercase tracking-[0.4em]">
                  Dashboard preview
                </span>
                <span className="text-xs text-slate-400">
                  Add /images/dashboard-preview.png for a custom mockup.
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.section>
  );
}

function TestimonialsSection() {
  return (
    <motion.section
      variants={SECTION_VARIANTS}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.25 }}
      transition={{ duration: 0.6 }}
      className="bg-white"
    >
      <div className="mx-auto max-w-6xl px-6 py-20">
        <div className="mb-12 text-center">
          <span className="rounded-full bg-slate-100 px-4 py-1 text-xs font-semibold uppercase tracking-widest text-slate-500">
            Testimonials
          </span>
          <h2 className="mt-5 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            Operations and performance teams rely on Copilot
          </h2>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {testimonials.map((testimonial) => (
            <article
              key={testimonial.author}
              className="h-full rounded-3xl border border-slate-100 bg-white p-8 shadow-sm shadow-slate-900/5"
            >
              <p className="text-lg leading-relaxed text-slate-700">{testimonial.quote}</p>
              <div className="mt-6">
                <p className="text-sm font-semibold text-slate-900">
                  {testimonial.author}
                </p>
                <p className="text-xs uppercase tracking-widest text-slate-500">
                  {testimonial.role}
                </p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </motion.section>
  );
}

function CtaBanner() {
  return (
    <motion.section
      variants={SECTION_VARIANTS}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.6 }}
      className="px-6 py-20"
    >
      <div className="mx-auto max-w-5xl overflow-hidden rounded-3xl bg-slate-950 text-white shadow-xl shadow-slate-900/30">
        <div className="bg-[radial-gradient(circle_at_top,_rgba(147,126,255,0.28),_transparent_60%)] px-8 py-16 text-center">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Give your campaigns a policy copilot
          </h2>
          <p className="mt-4 text-base text-white/80">
            Install in minutes and keep every Google Ads placement aligned with platform policies and
            client expectations.
          </p>
          <Link
            to="/auth/login"
            className="mt-6 inline-flex items-center justify-center rounded-full bg-white px-6 py-3 text-sm font-semibold text-slate-900 shadow-lg shadow-slate-900/30 transition hover:-translate-y-0.5 hover:bg-slate-100"
          >
            Install Now
          </Link>
        </div>
      </div>
    </motion.section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-slate-100 bg-white">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 px-6 py-8 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
        <p>© {new Date().getFullYear()} Google Ads Copilot AI. All rights reserved.</p>
        <div className="flex items-center gap-4">
          <a
            href="/privacy"
            className="transition hover:text-slate-700"
          >
            Privacy Policy
          </a>
          <a
            href="/terms"
            className="transition hover:text-slate-700"
          >
            Terms
          </a>
        </div>
      </div>
    </footer>
  );
}
