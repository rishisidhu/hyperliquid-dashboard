import type { HeadlineItem } from "@/lib/viewModel";
import { Pips } from "./Pips";

const mono = "var(--font-num)";

interface CardProps {
  side: "long" | "short";
  title: string;
  top: (HeadlineItem & { interp: string }) | null;
  rest: HeadlineItem[];
}

function HeadlineCard({ side, title, top, rest }: CardProps) {
  const accent = side === "long" ? "var(--long)" : "var(--short)";
  return (
    <div
      style={{
        background: `linear-gradient(180deg, color-mix(in oklch, ${accent}, transparent 94%), var(--surface-1) 55%)`,
        border: "1px solid var(--border)",
        borderTop: `2px solid ${accent}`,
        borderRadius: 9,
        padding: "18px 20px 16px",
      }}
    >
      <div
        style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 15 }}
      >
        <span
          style={{ width: 8, height: 8, borderRadius: 2, background: accent }}
        />
        <span
          style={{
            fontSize: 11,
            letterSpacing: ".13em",
            textTransform: "uppercase",
            color: accent,
            fontWeight: 600,
          }}
        >
          {title}
        </span>
      </div>

      {top ? (
        <>
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 16,
            }}
          >
            <div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 9 }}>
                <span
                  style={{ fontSize: 23, fontWeight: 600, letterSpacing: "-.01em" }}
                >
                  {top.coin}
                </span>
                <span
                  style={{
                    fontFamily: mono,
                    fontSize: 10.5,
                    color: "var(--text-3)",
                    border: "1px solid var(--border-strong)",
                    borderRadius: 4,
                    padding: "1px 5px",
                  }}
                >
                  {top.lev}
                </span>
                <span style={{ fontSize: 12, color: accent, fontWeight: 500 }}>
                  {top.label}
                </span>
              </div>
              <div style={{ marginTop: 11 }}>
                <Pips pips={top.pips} width={7} height={17} radius={2} gap={4} />
              </div>
            </div>
            <div style={{ textAlign: "right", flex: "none" }}>
              <div
                style={{
                  fontFamily: mono,
                  fontSize: 27,
                  fontWeight: 600,
                  lineHeight: 1,
                  color: accent,
                }}
              >
                {top.funding}
              </div>
              <div
                style={{
                  fontSize: 10.5,
                  color: "var(--text-3)",
                  marginTop: 5,
                  letterSpacing: ".04em",
                }}
              >
                ANNUALIZED FUNDING
              </div>
            </div>
          </div>
          <div
            style={{
              marginTop: 14,
              fontSize: 12.5,
              color: "var(--text-2)",
              lineHeight: 1.5,
              textWrap: "pretty",
            }}
          >
            {top.interp}
          </div>
          <div
            style={{ height: 1, background: "var(--border)", margin: "14px 0 11px" }}
          />
          {rest.map((h) => (
            <div
              key={h.coin}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto auto",
                alignItems: "center",
                gap: 14,
                padding: "5px 0",
              }}
            >
              <span style={{ fontWeight: 500, fontSize: 13 }}>{h.coin}</span>
              <Pips pips={h.pips} width={5} height={13} radius={1.5} gap={3} />
              <span
                style={{
                  fontFamily: mono,
                  fontSize: 13,
                  color: accent,
                  textAlign: "right",
                  minWidth: 64,
                }}
              >
                {h.funding}
              </span>
            </div>
          ))}
        </>
      ) : (
        <div style={{ fontSize: 12.5, color: "var(--text-3)", padding: "8px 0" }}>
          No {side === "long" ? "crowded longs" : "crowded shorts"} right now.
        </div>
      )}
    </div>
  );
}

interface StripProps {
  longTop: (HeadlineItem & { interp: string }) | null;
  longRest: HeadlineItem[];
  shortTop: (HeadlineItem & { interp: string }) | null;
  shortRest: HeadlineItem[];
}

export function HeadlineStrip({
  longTop,
  longRest,
  shortTop,
  shortRest,
}: StripProps) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 14,
        marginBottom: 30,
      }}
    >
      <HeadlineCard
        side="long"
        title="Most crowded longs right now"
        top={longTop}
        rest={longRest}
      />
      <HeadlineCard
        side="short"
        title="Most crowded shorts right now"
        top={shortTop}
        rest={shortRest}
      />
    </div>
  );
}
