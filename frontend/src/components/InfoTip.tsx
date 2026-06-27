"use client";

import { useEffect, useId, useRef, useState } from "react";
import { GLOSSARY, type GlossaryKey } from "@/lib/glossary";

const mono = "var(--font-num)";

interface InfoTipProps {
  term: GlossaryKey;
  /** Stop click/keydown from bubbling (e.g. inside a sortable column header). */
  stopPropagation?: boolean;
}

// Accessible term tooltip (SPEC §4.6). Reachable by keyboard (real <button>,
// focus opens), touch (click toggles), and pointer (hover opens). Escape and
// outside-click/blur close it; aria-describedby links trigger → tooltip.
// Zero deps; styled from the dark-terminal tokens.
export function InfoTip({ term, stopPropagation }: InfoTipProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const tipId = useId();
  const entry = GLOSSARY[term];

  useEffect(() => {
    if (!open) return;
    const onDocPointer = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDocPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDocPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const guard = (e: React.SyntheticEvent) => {
    if (stopPropagation) e.stopPropagation();
  };

  return (
    <span ref={wrapRef} style={{ position: "relative", display: "inline-flex" }}>
      <button
        type="button"
        aria-label={`What is ${entry.term}?`}
        aria-expanded={open}
        aria-describedby={open ? tipId : undefined}
        onClick={(e) => {
          guard(e);
          setOpen((v) => !v);
        }}
        onKeyDown={guard}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 13,
          height: 13,
          marginLeft: 4,
          padding: 0,
          border: "1px solid var(--border-strong)",
          borderRadius: "50%",
          background: "transparent",
          color: "var(--text-3)",
          fontFamily: mono,
          fontSize: 9,
          lineHeight: 1,
          cursor: "help",
          flex: "none",
        }}
      >
        i
      </button>
      {open && (
        <span
          id={tipId}
          role="tooltip"
          // Tooltip is descriptive text; clicks inside shouldn't sort/close-row.
          onClick={guard}
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            zIndex: 50,
            width: 264,
            padding: "10px 12px",
            background: "var(--surface-3)",
            border: "1px solid var(--border-strong)",
            borderRadius: 7,
            boxShadow: "0 8px 24px rgba(0,0,0,.45)",
            textTransform: "none",
            letterSpacing: "normal",
            cursor: "auto",
          }}
        >
          <span
            style={{
              display: "block",
              fontSize: 11.5,
              fontWeight: 600,
              color: "var(--text-1)",
              marginBottom: 4,
            }}
          >
            {entry.term}
          </span>
          <span
            style={{
              display: "block",
              fontSize: 12,
              lineHeight: 1.5,
              color: "var(--text-2)",
              fontWeight: 400,
            }}
          >
            {entry.body}
          </span>
        </span>
      )}
    </span>
  );
}
