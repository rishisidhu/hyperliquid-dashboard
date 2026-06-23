# Design tokens & core logic — Phase 3 reference

Source: Claude Design mockup (`Crowd_Dashboard.html`). That file is the **visual target** but is written in Claude Design's own templating (`<sc-for>`, `DCLogic`) — NOT React. Phase 3 re-implements the design in React/Next.js. The assets below are directly portable: copy the tokens and translate the small logic functions almost verbatim.

## Aesthetic decisions (locked)
- Anchor: dark trading terminal. Dense, data-first, restrained base + meaning-carrying accent.
- Intensity (0→1): filled segments ("pips") whose count AND color (OKLCH lightness+chroma) ramp with intensity. 0 = neutral axis tick (calm, not empty).
- Long vs short: colorblind-safe. Long = teal (hue 195), Short = amber (hue 70). NEVER red/green. Direction carried by THREE redundant channels: plain-language label, accent hue, and segments. 24h change column is monochrome with ▲/▽ carets (not red/green).
- Type: Geist (UI) + JetBrains Mono (all numerics, tabular).
- States required: balanced, mild, extreme, warming (pulsing dot + "Building history…", never fake zeros), stale (row dimmed to 50% + STALE chip).
- Tone: descriptive, never prescriptive. No buy/sell.

## CSS custom properties (copy verbatim into the frontend)
```css
:root{
  /* base & surfaces */
  --bg:#08090b; --surface-1:#0d0f13; --surface-2:#13161c; --surface-3:#1a1e25;
  --border:#1e222a; --border-strong:#2b313b;
  /* text tiers */
  --text-1:#e9ecf1; --text-2:#a6aebb; --text-3:#6b7480; --text-4:#454c56;
  /* meaning */
  --long:oklch(0.74 0.12 195); --long-dim:oklch(0.5 0.045 195);
  --short:oklch(0.78 0.135 70); --short-dim:oklch(0.56 0.055 70);
  --balanced:#5a626d;
  --rising:oklch(0.78 0.1 155); --unwinding:oklch(0.66 0.085 285); --flat:#6b7480;
  --stale:oklch(0.74 0.1 60); --pip-off:#262b34;
  /* layout: board column template */
  --board-cols: minmax(150px,1.3fr) minmax(184px,1.5fr) 116px 104px 92px 104px 150px;
}
body{ background:var(--bg); color:var(--text-1);
  font-family:'Geist',system-ui,sans-serif; font-size:13px; line-height:1.45;
  -webkit-font-smoothing:antialiased; text-rendering:optimizeLegibility; }
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.28}}      /* live dot */
@keyframes warm{0%,100%{opacity:.85;transform:scale(1)}50%{opacity:.35;transform:scale(.7)}} /* warming dot */
```

## Intensity → color ramp + pips (translate to JS/TS verbatim)
```js
// side: 'long' | 'short' | 'none'; t: intensity 0..1
function skewColor(side, t){
  if(side==='none') return 'var(--balanced)';
  if(side==='long') return `oklch(${(0.50+0.26*t).toFixed(3)} ${(0.045+0.105*t).toFixed(3)} 195)`;
  return `oklch(${(0.55+0.24*t).toFixed(3)} ${(0.055+0.105*t).toFixed(3)} 70)`; // short
}
function pipCount(t){ return t<=0 ? 0 : Math.max(1, Math.ceil(t*5)); } // 0..5
function pips(side, t){
  const n=pipCount(t), col=skewColor(side,t);
  return Array.from({length:5},(_,i)=>({ color: i<n ? col : 'var(--pip-off)' }));
}
```

## Formatters (translate verbatim)
```js
function usd(n){
  const a=Math.abs(n);
  if(a>=1e9) return '$'+(n/1e9).toFixed(2)+'B';
  if(a>=1e6){ const v=n/1e6; return '$'+(v>=100?v.toFixed(0):v.toFixed(1))+'M'; }
  if(a>=1e3) return '$'+(n/1e3).toFixed(0)+'K';
  return '$'+n.toFixed(0);
}
function pct(n){ return (n>0?'+':'')+n.toFixed(2)+'%'; }
function price(n){
  if(n>=1000) return n.toLocaleString('en-US',{maximumFractionDigits:0});
  if(n>=1)    return n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:4});
  return n.toPrecision(3);
}
```

## OI-trend view model
- warming → pulsing dot + "Warming up" (italic, --text-3). Never fake zeros.
- rising → ▲ "Rising" in --rising + pctChange
- unwinding → ▼ "Unwinding" in --unwinding + pctChange
- flat → — "Flat" in --flat

## Headline strip
- Two cards: "Most crowded longs right now" / "Most crowded shorts right now".
- Sort each side by skew.intensity desc; exclude stale rows; show top item large (coin, leverage chip, label, big mono funding %, pips, one-line plain-language interpretation) + next 2 as compact rows.
- Funding-weighting note from SPEC: headline ranking should be intensity (funding) — consider funding×OI later (SPEC open question). Mockup uses intensity desc.

## Board columns (left→right)
Market (coin + leverage chip + price; STALE chip when stale) · Crowd skew (pips + label) · Funding ann. (mono, colored by sign) · Open int. (usd) · 24h (mono, ▲/▽ caret, monochrome) · 24h vol (usd) · OI trend.

## NOT portable (rebuild as React)
The `<sc-for>`/`<sc-if>`/`{{ }}` template scaffolding and `DCLogic` class → rebuild as React components + props. The `rowVM`/`trendVM`/`interp` methods are good logic blueprints — port their behavior, not their syntax.
