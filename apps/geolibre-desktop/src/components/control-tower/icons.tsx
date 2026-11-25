import type { CtLens } from "../../lib/control-tower";

const PATHS: Record<CtLens["icon"] | "ask" | "tour" | "close" | "play", string> = {
  network:
    "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm-9 9h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18",
  sourcing: "M4 18l6-9 4 5 6-8M4 18h.01M20 6h.01",
  routes:
    "M5 6m-2.5 0a2.5 2.5 0 1 0 5 0 2.5 2.5 0 1 0-5 0M19 18m-2.5 0a2.5 2.5 0 1 0 5 0 2.5 2.5 0 1 0-5 0M7 7c6 0 4 10 10 10",
  inbound: "M3 17h18M5 17l2-6h10l2 6M9 11V7h6v4",
  scenarios: "M12 3l9 16H3zM12 10v4M12 17v.5",
  installed: "M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM8 20h8M12 16v4",
  ask: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z",
  tour: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM10 8l6 4-6 4z",
  close: "M6 6l12 12M18 6L6 18",
  play: "M8 5l12 7-12 7z",
};

/** Line icon used by the Control Tower chrome. */
export function CtIcon({ name, className }: { name: keyof typeof PATHS; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className ?? "h-5 w-5"}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
