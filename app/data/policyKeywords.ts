export type PolicyRule = {
  category: string;
  severity: "high" | "medium" | "low";
  keywords: string[];
  description: string;
};

export const POLICY_KEYWORDS: Record<string, PolicyRule[]> = {
  default: [
    {
      category: "Medical Claims",
      severity: "high",
      description: "Unsubstantiated medical or therapeutic promises",
      keywords: ["cure", "miracle", "heal instantly", "reverse disease", "prescription strength"],
    },
    {
      category: "CBD / Controlled Substances",
      severity: "high",
      description: "Mentions of CBD, THC, or other restricted substances",
      keywords: ["cbd", "thc", "cannabis", "hemp extract"],
    },
    {
      category: "Superlatives & Guarantees",
      severity: "medium",
      description: "Absolutes that often trigger Google Ads policy warnings",
      keywords: ["best", "guaranteed", "100% success", "risk-free"],
    },
    {
      category: "Weight Loss Claims",
      severity: "medium",
      description: "Bold weight loss promises",
      keywords: ["burn fat", "rapid weight loss", "lose inches", "detox"],
    },
  ],
  uk: [
    {
      category: "Medicinal Claims (MHRA)",
      severity: "high",
      description: "UK MHRA regulated medicinal language",
      keywords: ["mhra approved", "nhs backed", "treats", "clinical cure"],
    },
  ],
  us: [
    {
      category: "FDA Compliance",
      severity: "high",
      description: "Statements implying FDA approval",
      keywords: ["fda approved", "fda cleared"],
    },
  ],
  eu: [
    {
      category: "CE Marking",
      severity: "medium",
      description: "Missing CE or EU certification references",
      keywords: ["ce mark", "ce certified"],
    },
  ],
  au: [
    {
      category: "TGA Advertising",
      severity: "high",
      description: "Australia TGA restricted wording",
      keywords: ["tga approved", "australian register of therapeutic goods"],
    },
  ],
};

export function getPolicyRules(market: string) {
  const key = market.toLowerCase();
  return [...(POLICY_KEYWORDS.default ?? []), ...(POLICY_KEYWORDS[key] ?? [])];
}
