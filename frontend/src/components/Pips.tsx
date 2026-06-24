import type { Pip } from "@/lib/tokens";

interface PipsProps {
  pips: Pip[];
  /** balanced (intensity 0) → neutral axis tick instead of segments */
  balanced?: boolean;
  width?: number;
  height?: number;
  radius?: number;
  gap?: number;
}

// Filled segments whose count + color carry intensity. Balanced shows a single
// neutral axis tick — present and calm, never an empty/broken cell.
export function Pips({
  pips,
  balanced = false,
  width = 6,
  height = 16,
  radius = 2,
  gap = 3,
}: PipsProps) {
  if (balanced) {
    return (
      <span style={{ display: "flex", alignItems: "center", height: 16 }}>
        <span
          style={{
            width: 30,
            height: 2,
            background: "var(--balanced)",
            borderRadius: 1,
          }}
        />
      </span>
    );
  }
  return (
    <span style={{ display: "flex", gap, alignItems: "flex-end" }}>
      {pips.map((p, i) => (
        <span
          key={i}
          style={{
            width,
            height,
            borderRadius: radius,
            background: p.color,
          }}
        />
      ))}
    </span>
  );
}
