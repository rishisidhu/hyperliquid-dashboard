// Quiet portfolio footer — sits below the board, muted text tokens, themed for
// both light/dark. Text-only (no icon dep), no tracking, no external scripts.

const links = [
  { label: "Source", href: "https://github.com/rishisidhu/hyperliquid-dashboard" },
  { label: "LinkedIn", href: "https://www.linkedin.com/in/rishisid/" },
];

export function Footer() {
  // Current year — build-time for the static export, refreshed on each deploy.
  const year = new Date().getFullYear();

  return (
    <footer
      style={{
        borderTop: "1px solid var(--border)",
        marginTop: 44,
        paddingTop: 16,
        display: "flex",
        flexWrap: "wrap",
        gap: "8px 16px",
        justifyContent: "space-between",
        alignItems: "baseline",
        fontSize: 11.5,
        color: "var(--text-3)",
      }}
    >
      <span>
        Built by Rishi Sidhu · ©{" "}
        <span suppressHydrationWarning>{year}</span>
        <span style={{ color: "var(--text-4)" }}>
          {" "}
          · Crowd positioning for Hyperliquid perps
        </span>
      </span>
      <span style={{ display: "flex", gap: 16 }}>
        {links.map((l) => (
          <a
            key={l.label}
            href={l.href}
            target="_blank"
            rel="noopener noreferrer"
            className="footer-link"
          >
            {l.label}
          </a>
        ))}
      </span>
    </footer>
  );
}
