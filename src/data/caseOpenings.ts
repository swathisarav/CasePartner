// 50 predefined case openings for the "prompt capture" drill: hear one read
// aloud, note the key facts on paper, then reveal to self-check. No LLM — these
// are hand-authored so the drill works fully offline. `topic` is shown only on
// reveal so it doesn't give away the structure while you're listening.

export interface CaseOpening {
  id: string;
  topic: string;
  prompt: string;
}

export const CASE_OPENINGS: CaseOpening[] = [
  {
    id: "o1",
    topic: "Profitability",
    prompt:
      "Our client is a national office-supply retailer with 400 stores and about $3 billion in annual revenue. Their operating margin has slipped from 8% to 5% over the past three years while sales have stayed flat. The CEO wants us to find out why margins are eroding and how to fix it.",
  },
  {
    id: "o2",
    topic: "Market entry",
    prompt:
      "A large European grocery chain is considering launching a 15-minute grocery-delivery service in three major cities. They've asked whether they should enter this market and how to do it profitably.",
  },
  {
    id: "o3",
    topic: "Market sizing",
    prompt:
      "I'd like you to estimate the annual revenue of the airport coffee-shop market in the United States. Walk me through your assumptions.",
  },
  {
    id: "o4",
    topic: "Pricing",
    prompt:
      "Our client is a B2B software company launching a new analytics product. They're unsure how to price it — per seat, per usage, or a flat platform fee. How should they think about pricing to maximize revenue?",
  },
  {
    id: "o5",
    topic: "M&A",
    prompt:
      "A mid-size pharmaceutical company is considering acquiring a smaller biotech with one promising drug in late-stage trials, for about $2 billion. Should they make the acquisition?",
  },
  {
    id: "o6",
    topic: "Declining sales",
    prompt:
      "A casual-dining restaurant chain has seen same-store sales fall 12% over the past two years despite a stable economy. The board wants to understand the cause and turn it around.",
  },
  {
    id: "o7",
    topic: "Growth",
    prompt:
      "A regional video-streaming service has plateaued at 5 million subscribers. Leadership wants to double subscribers within three years. How would you help them grow?",
  },
  {
    id: "o8",
    topic: "Cost reduction",
    prompt:
      "A budget airline is under pressure from rising fuel and labor costs. The CFO wants to cut total costs by 15% without hurting on-time performance. Where would you look?",
  },
  {
    id: "o9",
    topic: "New product",
    prompt:
      "A consumer-goods company that sells shampoo is considering launching a premium organic line. Should they, and what would make it succeed?",
  },
  {
    id: "o10",
    topic: "Market entry",
    prompt:
      "A telecom operator in a developed market is deciding whether to enter the home-security and smart-home business. Advise them.",
  },
  {
    id: "o11",
    topic: "Operations / capacity",
    prompt:
      "A 300-bed hospital is turning away patients because its emergency department is overcrowded, yet leadership doesn't want to build new space. How can they increase effective capacity?",
  },
  {
    id: "o12",
    topic: "Profitability",
    prompt:
      "A chain of 60 fitness clubs has growing membership but falling profit per club. The owner wants to understand this disconnect and restore profitability.",
  },
  {
    id: "o13",
    topic: "Market sizing",
    prompt:
      "Estimate how many public EV charging stations a city of 1 million people will need by 2030.",
  },
  {
    id: "o14",
    topic: "Investment / PE",
    prompt:
      "A private-equity firm is evaluating a last-mile delivery company as an acquisition target. What would you analyze to decide whether it's a good investment?",
  },
  {
    id: "o15",
    topic: "Pricing",
    prompt:
      "A theme park is considering moving from flat-price tickets to dynamic pricing that varies by day and demand. Should they, and what are the risks?",
  },
  {
    id: "o16",
    topic: "Competitive response",
    prompt:
      "A regional bank is losing young customers to a fast-growing digital-only competitor. How should the bank respond?",
  },
  {
    id: "o17",
    topic: "Turnaround",
    prompt:
      "A once-popular apparel brand has lost half its market value in five years and is close to unprofitable. The new CEO has asked for a turnaround plan.",
  },
  {
    id: "o18",
    topic: "Growth",
    prompt:
      "A specialty coffee roaster sells mainly wholesale to cafés and wants to grow revenue by 50% over three years. What options should they consider?",
  },
  {
    id: "o19",
    topic: "Market entry",
    prompt:
      "A ride-hailing company operating in big cities wants to expand into small towns and rural areas. Should they, and how?",
  },
  {
    id: "o20",
    topic: "Profitability",
    prompt:
      "An airline's premium lounges are costing more than the revenue they seem to justify. Should the airline keep, shrink, or expand its lounge network?",
  },
  {
    id: "o21",
    topic: "New product",
    prompt:
      "A traditional automaker is deciding whether to launch a separate electric-vehicle brand or add EVs under its existing brand. How should they decide?",
  },
  {
    id: "o22",
    topic: "Market sizing",
    prompt:
      "Estimate the annual number of disposable diapers used in a country of 50 million people.",
  },
  {
    id: "o23",
    topic: "Operations",
    prompt:
      "A furniture manufacturer has rising defect rates and product returns that are eating into margin. How would you diagnose and reduce the problem?",
  },
  {
    id: "o24",
    topic: "Pricing",
    prompt:
      "A pharmaceutical company has a new drug that is far more effective than existing options for a rare disease. How should they set the price?",
  },
  {
    id: "o25",
    topic: "Market entry",
    prompt:
      "A global bank is considering entering the retail-banking market in a fast-growing African country. Should they?",
  },
  {
    id: "o26",
    topic: "Growth",
    prompt:
      "An online furniture retailer has strong website traffic but a low conversion rate. Leadership wants to grow revenue — where would you focus?",
  },
  {
    id: "o27",
    topic: "Profitability",
    prompt:
      "A regional grocery chain's profits are declining even though revenue is growing. The CEO wants to understand why growth isn't translating into profit.",
  },
  {
    id: "o28",
    topic: "M&A",
    prompt:
      "A large media company is considering buying a popular podcast network for about $500 million. Would you recommend the deal?",
  },
  {
    id: "o29",
    topic: "Declining sales",
    prompt:
      "A metropolitan newspaper's print revenue is falling 15% a year. They want a strategy to remain viable over the next decade.",
  },
  {
    id: "o30",
    topic: "Operations / capacity",
    prompt:
      "A shipping port is congested and ships are waiting days to unload. Regional trade is growing about 8% a year. How can the port handle the growth?",
  },
  {
    id: "o31",
    topic: "Market sizing",
    prompt:
      "Estimate how many gym memberships are sold each year in a city of 2 million people.",
  },
  {
    id: "o32",
    topic: "New market",
    prompt:
      "A large fertilizer company wants to expand into selling data-driven crop-advisory services to farmers. Should they, and how?",
  },
  {
    id: "o33",
    topic: "Pricing",
    prompt:
      "An airline is considering charging separately for carry-on bags. What should they weigh before doing this?",
  },
  {
    id: "o34",
    topic: "Profitability",
    prompt:
      "A luxury hotel chain has high occupancy but declining profit per room. Help the CEO understand and fix it.",
  },
  {
    id: "o35",
    topic: "Growth",
    prompt:
      "A commercial bank wants to grow its small-business lending. What would you look at to build a growth plan?",
  },
  {
    id: "o36",
    topic: "Turnaround",
    prompt:
      "A big-box electronics retailer is losing money as customers shift online. The board wants a plan to return to profitability.",
  },
  {
    id: "o37",
    topic: "Market entry",
    prompt:
      "A Western coffee chain wants to expand into a large Asian market where tea is the dominant drink. Should they enter, and how?",
  },
  {
    id: "o38",
    topic: "Supply chain",
    prompt:
      "A packaged-food company keeps running out of its best-selling product in stores while overstocking others. How would you fix its supply chain?",
  },
  {
    id: "o39",
    topic: "Market sizing",
    prompt:
      "Estimate how many pizzas are sold in the United States on a single day.",
  },
  {
    id: "o40",
    topic: "Investment",
    prompt:
      "An infrastructure fund is deciding whether to invest in building a large solar farm. What would you analyze?",
  },
  {
    id: "o41",
    topic: "Pricing / retention",
    prompt:
      "A subscription meal-kit company is losing many customers after the first month. Should they change their pricing or promotions, and how?",
  },
  {
    id: "o42",
    topic: "Profitability",
    prompt:
      "A trucking company's profit per mile has fallen sharply this year despite steady demand. What's driving it, and what can they do?",
  },
  {
    id: "o43",
    topic: "New product",
    prompt:
      "A retail bank is considering launching a 'buy now, pay later' feature in its app. Should they, and what are the risks?",
  },
  {
    id: "o44",
    topic: "Market entry",
    prompt:
      "A large pharmacy chain is considering adding in-store primary-care clinics. Advise them on whether and how to proceed.",
  },
  {
    id: "o45",
    topic: "Growth",
    prompt:
      "An enterprise-software company has strong customer retention but slow new-customer growth. How would you accelerate growth?",
  },
  {
    id: "o46",
    topic: "Margins",
    prompt:
      "A semiconductor maker's margins are falling as competitors cut prices. How should they protect profitability?",
  },
  {
    id: "o47",
    topic: "Operations / capacity",
    prompt:
      "A popular restaurant turns away customers on weekends but sits half-empty on weekdays. How can it increase profit without expanding?",
  },
  {
    id: "o48",
    topic: "Market sizing",
    prompt:
      "Estimate the number of streetlights in a city of 1 million people.",
  },
  {
    id: "o49",
    topic: "Portfolio / divestiture",
    prompt:
      "A diversified conglomerate is under pressure to sell off underperforming divisions. How would you decide which businesses to keep and which to sell?",
  },
  {
    id: "o50",
    topic: "Sustainability / cost",
    prompt:
      "A global apparel retailer wants to cut its supply-chain carbon emissions by 30% without raising costs. How would you approach this?",
  },
];

/** Fisher–Yates shuffle, returning a new array (originals untouched). */
export function shuffledOpenings(): CaseOpening[] {
  const a = [...CASE_OPENINGS];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
