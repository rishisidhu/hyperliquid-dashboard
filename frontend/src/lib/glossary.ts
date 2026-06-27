// Single source of education copy (SPEC §4.6). Used by InfoTip tooltips and the
// "How to read this board" panel. Tone: descriptive, never prescriptive —
// each entry defines what a number means + what it implies for a trade, with no
// buy/sell or "should". Keep this the one place this copy lives.

export interface GlossaryEntry {
  term: string; // display title
  body: string; // one plain sentence: definition + what it means for a trade
}

export const GLOSSARY = {
  funding: {
    term: "Funding",
    body: "The recurring fee for holding a perp. Positive = longs pay shorts (the crowd is leaning long and paying to stay in); negative = shorts pay longs.",
  },
  annualized: {
    term: "Annualized",
    body: "The funding rate scaled to a yearly figure so markets are comparable. It's a live snapshot of the current rate, not a prediction it'll persist.",
  },
  premium: {
    term: "Premium",
    body: "How far the perp's mark price sits above (+) or below (−) the underlying oracle price — the gap funding works to pull back toward zero.",
  },
  openInterest: {
    term: "Open interest",
    body: "The dollar value of positions currently open in this market. Larger open interest means more capital is committed, so the crowd signal carries more weight.",
  },
  crowdSkew: {
    term: "Crowd skew",
    body: "How one-sided positioning is, read from funding. More filled segments = a more stretched, crowded book on that side (teal = long, amber = short).",
  },
  oiTrend: {
    term: "OI trend",
    body: "Whether open interest is rising or unwinding versus about 20 minutes ago — the crowd adding to positions, or closing them out.",
  },
  oiCap: {
    term: "At open-interest cap",
    body: "This market has hit Hyperliquid's open-interest limit — no new positions can be opened until the cap is raised or open interest falls.",
  },
  change24h: {
    term: "24h change",
    body: "Price change over the last 24 hours. Shown in one neutral colour with ▲/▽ — direction only, not a judgement.",
  },
  volume24h: {
    term: "24h volume",
    body: "Total traded value over the last 24 hours — how active this market is.",
  },
  crossVenue: {
    term: "Cross-venue funding",
    body: "The same market's funding on other exchanges, each annualized to a common basis, so you can see if the crowding is Hyperliquid-specific or market-wide.",
  },
  fundingInterval: {
    term: "Funding interval & next funding",
    body: "How often each venue charges funding (e.g. 1h vs 8h) and when the next charge lands. Intervals differ between venues, which is why each rate is annualized to compare fairly.",
  },
} as const satisfies Record<string, GlossaryEntry>;

export type GlossaryKey = keyof typeof GLOSSARY;
