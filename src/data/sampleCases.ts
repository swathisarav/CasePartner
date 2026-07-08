// Hand-authored practice cases bundled with the app, so a newcomer can start
// an interview immediately — no PDF, no LLM parsing step. These are plain
// CaseData plus a little presentation metadata. IDs are stable so saving/
// starting one is idempotent.
import type { CaseData } from "../types/case";

export interface SampleCase {
  case: CaseData;
  difficulty: "Beginner" | "Intermediate";
  archetype: string;
  blurb: string;
}

const FIXED_DATE = "2026-01-01T00:00:00.000Z";

const coffeeCo: CaseData = {
  id: "sample-coffeeco-profitability",
  title: "CoffeeCo — Profitability",
  prompt:
    "Our client, CoffeeCo, is a chain of 120 coffee shops across the Midwest. Over the past two years their profits have declined by 30%, even though revenue has stayed flat. The CEO has asked us to diagnose why profits are falling and recommend how to restore them. How would you approach this?",
  background: [
    "- Revenue has been flat at about $240M per year. Average ticket is $6 and customer traffic is stable.",
    "- The profit decline is concentrated in in-store costs, not corporate overhead.",
    "- Competitors have not changed their pricing meaningfully over the period.",
    "- About two years ago, CoffeeCo switched to premium suppliers for its coffee beans and dairy.",
    "- There have been no major changes to store count, labor rates, or rent.",
  ].join("\n"),
  expertFramework: [
    { label: "Revenue", points: ["Price per cup", "Volume / traffic", "Product mix"] },
    {
      label: "Costs",
      points: ["COGS (beans, dairy, cups)", "Store labor", "Rent / occupancy", "Corporate overhead"],
    },
    {
      label: "External factors",
      points: ["Competitor pricing", "Input-cost inflation", "Consumer trends"],
    },
  ],
  exhibits: [
    {
      id: "exhibit-1",
      title: "Cost per cup by component (2 years ago vs. today)",
      description:
        "Per-cup cost broken out by component. The key insight is that COGS — specifically beans and dairy — rose sharply after the premium-supplier switch, while labor and rent were roughly flat.",
      columns: ["Cost component", "2 years ago", "Today"],
      rows: [
        ["Beans", "$0.80", "$1.30"],
        ["Dairy", "$0.40", "$0.65"],
        ["Labor", "$1.50", "$1.60"],
        ["Rent", "$0.90", "$0.95"],
        ["Other", "$0.40", "$0.40"],
      ],
      stage: "analysis",
      topicHint: "cost breakdown / cost per cup",
    },
  ],
  recommendationNotes:
    "COGS per cup rose roughly 48% (beans +62%, dairy +63%), driven by the premium-supplier switch, while other costs were flat — that is the profit leak. Recommend renegotiating or exiting the premium supplier contracts to target ~$0.60/cup in savings (~$24M annual profit recovery across ~40M cups), and consider a selective 3–5% price increase on premium drinks to protect margin. Risks: quality/brand perception; next steps: run a supplier RFP and A/B test pricing in a subset of stores.",
  createdAt: FIXED_DATE,
  sourceFileName: "Sample case (built in)",
};

const verdeMart: CaseData = {
  id: "sample-verdemart-market-entry",
  title: "VerdeMart — Meal-Kit Market Entry",
  prompt:
    "Our client, VerdeMart, is a regional grocery chain with 60 stores and about $900M in annual revenue. Growth has stalled, and they are considering launching a subscription meal-kit delivery service to reignite it. Should VerdeMart enter the meal-kit market?",
  background: [
    "- VerdeMart has ~2 million loyalty members; leadership wants to grow revenue without opening new stores.",
    "- The meal-kit market is growing ~15% per year but two large national players already compete on price.",
    "- VerdeMart has strong local supplier relationships and its own refrigerated distribution network.",
    "- Estimated upfront investment to launch is about $40M (technology, packing facilities, marketing).",
    "- Target customers would initially be existing loyalty members in dense metro areas.",
    "- Management's goal is a business that can reach profitability within ~3 years.",
  ].join("\n"),
  expertFramework: [
    {
      label: "Market attractiveness",
      points: ["Market size & growth", "Competitive intensity", "Customer demand / willingness to switch"],
    },
    {
      label: "Company fit",
      points: ["Existing capabilities (distribution, suppliers)", "Brand permission", "Access to customers (loyalty base)"],
    },
    {
      label: "Economics",
      points: ["Unit economics per box", "Upfront investment & breakeven", "Customer acquisition cost & retention"],
    },
    {
      label: "Risks & alternatives",
      points: ["Cannibalization of in-store grocery", "Execution risk vs. national players", "Partner/acquire instead of build"],
    },
  ],
  exhibits: [
    {
      id: "exhibit-1",
      title: "Meal-kit unit economics (per box)",
      description:
        "Contribution per box. The insight is that each box contributes ~$12 after variable costs, so profitability hinges on acquisition cost and how many boxes a customer buys before churning.",
      columns: ["Line item", "Per box"],
      rows: [
        ["Price to customer", "$60"],
        ["Food & ingredients", "-$32"],
        ["Packaging & fulfillment", "-$10"],
        ["Delivery", "-$6"],
        ["Contribution margin", "$12"],
      ],
      stage: "analysis",
      topicHint: "unit economics / contribution per box",
    },
    {
      id: "exhibit-2",
      title: "Customer acquisition & retention assumptions",
      description:
        "Acquisition cost and expected purchase behavior. Insight: at $75 CAC and ~10 boxes per customer lifetime, lifetime contribution (~$120) comfortably exceeds CAC — the model works if retention holds.",
      columns: ["Metric", "Value"],
      rows: [
        ["Customer acquisition cost (CAC)", "$75"],
        ["Avg. boxes per customer (lifetime)", "10"],
        ["Lifetime contribution", "$120"],
        ["Target customers, year 1", "150,000"],
      ],
      stage: "analysis",
      topicHint: "customer acquisition / lifetime value / breakeven",
    },
  ],
  recommendationNotes:
    "Recommend entering, but selectively — VerdeMart should leverage its loyalty base, refrigerated distribution, and local suppliers rather than competing head-on nationally. Unit economics are favorable: ~$12 contribution per box and ~$120 lifetime contribution vs. $75 CAC. With 150k year-1 customers, contribution ≈ $18M against a $40M investment, implying breakeven in roughly 2–3 years if retention holds — within the CEO's target. Recommend a phased pilot in 2–3 dense metros before national rollout. Key risks: retention/churn, cannibalization of in-store sales, and execution against scaled competitors.",
  createdAt: FIXED_DATE,
  sourceFileName: "Sample case (built in)",
};

const metroSizing: CaseData = {
  id: "sample-metro-market-sizing",
  title: "Metro Coffee — Market Sizing",
  prompt:
    "Before we dig into a client's problem, I'd like to see how you estimate. How many cups of coffee are purchased outside the home per day in a city of 2 million people? Walk me through your thinking — I care about your structure and assumptions more than the exact number.",
  background: [
    "- Treat this as a typical developed-country city; you can make reasonable assumptions and state them.",
    "- Adults make up roughly 78% of the population.",
    "- Assume about 75% of adults drink coffee.",
    "- Coffee drinkers average about 2 cups per day.",
    "- Assume roughly 40% of cups are purchased outside the home (café, kiosk, work), the rest made at home.",
  ].join("\n"),
  expertFramework: [
    {
      label: "Population funnel",
      points: ["Total population", "Share who are adults", "Share who drink coffee"],
    },
    {
      label: "Consumption",
      points: ["Cups per coffee-drinker per day", "Total cups per day"],
    },
    {
      label: "Purchased share",
      points: ["% purchased outside home vs. made at home", "Purchased cups per day"],
    },
  ],
  exhibits: [
    {
      id: "exhibit-1",
      title: "Estimation assumptions",
      description:
        "The assumption set for the estimate. Insight: chaining these gives ~0.9–1.0M purchased cups/day; a strong candidate lays out the funnel before plugging in numbers and sanity-checks the result.",
      columns: ["Assumption", "Value"],
      rows: [
        ["City population", "2,000,000"],
        ["Adults (% of pop.)", "78%"],
        ["Coffee drinkers (% of adults)", "75%"],
        ["Cups per drinker per day", "2"],
        ["Purchased outside home", "40%"],
      ],
      stage: "analysis",
      topicHint: "estimation assumptions",
    },
  ],
  recommendationNotes:
    "Expected structure: 2,000,000 population × 78% adults ≈ 1.56M adults; × 75% coffee drinkers ≈ 1.17M drinkers; × 2 cups/day ≈ 2.34M cups/day total; × 40% purchased outside home ≈ ~0.94M purchased cups per day. A good answer lands around 0.9–1.0M purchased cups/day (or ~2.3M cups total) and — more importantly — shows a clean population→consumption→purchased funnel, states assumptions explicitly, and sanity-checks the result. The exact number matters far less than the structure and reasonableness of assumptions.",
  createdAt: FIXED_DATE,
  sourceFileName: "Sample case (built in)",
};

export const SAMPLE_CASES: SampleCase[] = [
  {
    case: coffeeCo,
    difficulty: "Beginner",
    archetype: "Profitability",
    blurb: "A coffee chain's profits are falling while revenue holds steady. Find the leak.",
  },
  {
    case: metroSizing,
    difficulty: "Beginner",
    archetype: "Market sizing",
    blurb: "Estimate daily coffee purchases in a city of 2M — practice structured estimation.",
  },
  {
    case: verdeMart,
    difficulty: "Intermediate",
    archetype: "Market entry",
    blurb: "Should a regional grocer launch a meal-kit delivery business? Weigh the case.",
  },
];

export const SAMPLE_CASE_IDS = new Set(SAMPLE_CASES.map((s) => s.case.id));
