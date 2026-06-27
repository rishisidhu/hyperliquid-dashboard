"use client";

import { useEffect, useRef } from "react";

const mono = "var(--font-num)";

interface HowToReadPanelProps {
  open: boolean;
  onClose: () => void;
}

interface Section {
  heading: string;
  body: string;
}

// One collapsible explainer screen (SPEC §4.6). Strictly descriptive — defines
// what the numbers mean and what the signal does/doesn't tell you; never advises
// on holding, entering, or exiting a position.
const SECTIONS: Section[] = [
  {
    heading: "What this board shows",
    body: "A read on how crowded each Hyperliquid perp is, taken from funding — the fee that flows between longs and shorts. One row per market, one story: which side the crowd is leaning, and what it's paying to stay there.",
  },
  {
    heading: "Funding = crowd positioning",
    body: "On a perp, funding is the honest, native proxy for positioning. Positive funding means longs pay shorts — the crowd is leaning long and paying to hold. Negative means the reverse. We don't fabricate a long/short trader count; funding is the truthful signal the public API actually exposes.",
  },
  {
    heading: "Crowd skew & intensity",
    body: "The skew badge reads positioning straight off funding: teal for crowded longs, amber for crowded shorts, a neutral tick when funding is near zero. More filled segments mean a more stretched, one-sided book. The scale is logarithmic, so the extreme tail stays distinct from the common range.",
  },
  {
    heading: "What crowding does and doesn't tell you",
    body: "Crowding shows where positioning is concentrated, and that stretched positioning can unwind sharply. It does not indicate direction or timing — a crowded market can stay crowded, or unwind, and the funding figure alone says nothing about which.",
  },
  {
    heading: "OI trend",
    body: "The arrow compares open interest now versus about 20 minutes ago: rising means the crowd is adding positions, unwinding means positions are closing. Right after the backend restarts it reads \"warming up\" until enough history accumulates — never a fake zero.",
  },
  {
    heading: "Cross-venue comparison",
    body: "Expand any row to see the same market's funding on other exchanges. Each venue charges funding on its own interval (e.g. 1h vs 8h), so every rate is annualized to a common basis — that's what makes the comparison fair, and shows whether the crowding is Hyperliquid-specific or market-wide.",
  },
];

export function HowToReadPanel({ open, onClose }: HowToReadPanelProps) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    // Move focus into the dialog for keyboard users.
    closeRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        background: "rgba(8,9,11,.72)",
        backdropFilter: "blur(3px)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "60px 20px",
        overflowY: "auto",
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="howto-title"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 640,
          background: "var(--surface-1)",
          border: "1px solid var(--border-strong)",
          borderRadius: 11,
          boxShadow: "0 20px 60px rgba(0,0,0,.55)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px",
            borderBottom: "1px solid var(--border)",
            position: "sticky",
            top: 0,
            background: "var(--surface-1)",
            borderRadius: "11px 11px 0 0",
          }}
        >
          <span
            id="howto-title"
            style={{ fontSize: 14, fontWeight: 600, letterSpacing: ".01em" }}
          >
            How to read this board
          </span>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 26,
              height: 26,
              border: "1px solid var(--border)",
              borderRadius: 6,
              background: "var(--surface-2)",
              color: "var(--text-2)",
              fontSize: 14,
              cursor: "pointer",
              fontFamily: mono,
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ padding: "8px 20px 20px" }}>
          {SECTIONS.map((s) => (
            <section key={s.heading} style={{ padding: "13px 0", borderBottom: "1px solid var(--border)" }}>
              <h3
                style={{
                  margin: "0 0 5px",
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: "var(--text-1)",
                }}
              >
                {s.heading}
              </h3>
              <p
                style={{
                  margin: 0,
                  fontSize: 12.5,
                  lineHeight: 1.55,
                  color: "var(--text-2)",
                  textWrap: "pretty",
                }}
              >
                {s.body}
              </p>
            </section>
          ))}

          {/* Tone line — descriptive, never prescriptive. */}
          <p
            style={{
              margin: "14px 0 0",
              fontSize: 11.5,
              lineHeight: 1.55,
              color: "var(--text-3)",
              fontStyle: "italic",
            }}
          >
            This board describes what the numbers mean. It doesn&apos;t tell you what
            to do — that&apos;s your call. Not financial advice.
          </p>
        </div>
      </div>
    </div>
  );
}
