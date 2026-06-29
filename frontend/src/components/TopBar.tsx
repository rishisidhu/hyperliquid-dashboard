"use client";

import type { Theme } from "@/lib/types";

interface TopBarProps {
  connected: boolean;
  stale: boolean; // backend serving last-known during an upstream blip
  updatedAgo: string | null; // e.g. "2s ago" or null when never connected
  marketCount: number;
  query: string;
  onQuery: (q: string) => void;
  onHowToRead: () => void;
  theme: Theme;
  onToggleTheme: () => void;
}

const mono = "var(--font-num)";

export function TopBar({
  connected,
  stale,
  updatedAgo,
  marketCount,
  query,
  onQuery,
  onHowToRead,
  theme,
  onToggleTheme,
}: TopBarProps) {
  // Three states: reconnecting (stream down) · stale (connected but upstream
  // blip, serving last-known) · live (connected + fresh).
  const status = !connected
    ? { color: "var(--stale)", pulse: false, text: "reconnecting…" }
    : stale
      ? { color: "var(--stale)", pulse: false, text: `stale · last updated ${updatedAgo ?? "—"}` }
      : { color: "var(--rising)", pulse: true, text: `live · updated ${updatedAgo ?? "—"}` };
  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 30,
        display: "flex",
        alignItems: "center",
        gap: 18,
        height: 52,
        padding: "0 22px",
        background: "var(--header-bg)",
        backdropFilter: "blur(8px)",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 9 }}>
        <span
          style={{
            fontFamily: mono,
            fontWeight: 700,
            letterSpacing: ".14em",
            fontSize: 14,
            color: "var(--text-1)",
          }}
        >
          CROWD
        </span>
        <span
          style={{ fontSize: 11.5, color: "var(--text-3)", letterSpacing: ".02em" }}
        >
          positioning · hyperliquid perps
        </span>
      </div>
      <div style={{ flex: 1 }} />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          fontSize: 11.5,
          color: "var(--text-2)",
        }}
      >
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: status.color,
            boxShadow: `0 0 0 3px color-mix(in oklch, ${status.color}, transparent 80%)`,
            animation: status.pulse ? "pulse 2s ease-in-out infinite" : "none",
          }}
        />
        <span style={{ fontFamily: mono }}>{status.text}</span>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          height: 30,
          padding: "0 11px",
          background: "var(--surface-1)",
          border: "1px solid var(--border)",
          borderRadius: 6,
          color: "var(--text-2)",
          fontSize: 12,
          minWidth: 188,
        }}
      >
        <span style={{ opacity: 0.7 }}>⌕</span>
        <input
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder={`Search ${marketCount} markets…`}
          aria-label="Search markets"
          style={{
            border: "none",
            outline: "none",
            background: "transparent",
            color: "var(--text-1)",
            fontFamily: "var(--font-ui)",
            fontSize: 12,
            width: "100%",
          }}
        />
      </div>
      {/* Education entry point — opens the "How to read this board" panel. */}
      <button
        type="button"
        onClick={onHowToRead}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          height: 30,
          padding: "0 11px",
          background: "var(--surface-1)",
          border: "1px solid var(--border)",
          borderRadius: 6,
          color: "var(--text-2)",
          fontSize: 12,
          cursor: "pointer",
          fontFamily: "var(--font-ui)",
        }}
      >
        <span style={{ opacity: 0.7 }}>?</span>
        <span>How to read this board</span>
      </button>
      {/* Theme toggle — dark is default; light is opt-in (persisted). */}
      <button
        type="button"
        onClick={onToggleTheme}
        aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
        title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 30,
          height: 30,
          background: "var(--surface-1)",
          border: "1px solid var(--border)",
          borderRadius: 6,
          color: "var(--text-2)",
          fontSize: 13,
          cursor: "pointer",
          fontFamily: "var(--font-ui)",
        }}
      >
        {theme === "dark" ? "☀" : "☾"}
      </button>
    </div>
  );
}
