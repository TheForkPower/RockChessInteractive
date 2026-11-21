import type { ReactNode } from "react";
import { CheckIcon, CrossIcon, InfoIcon } from "./Icons";

type FeedbackProps = {
  tone: "good" | "bad" | "info";
  title: string;
  /** Tighter spacing, for small spaces such as a card beside the page copy. */
  compact?: boolean;
  children?: ReactNode;
};

const tones = {
  good: { box: "bg-good-wash text-good-edge", icon: <CheckIcon />, badge: "bg-good text-white" },
  bad: { box: "bg-bad-wash text-bad-edge", icon: <CrossIcon />, badge: "bg-bad text-white" },
  info: { box: "bg-brand-wash text-brand-edge", icon: <InfoIcon />, badge: "bg-brand text-white" },
};

/** Result banner shown after the player answers. Announced to screen readers. */
export function Feedback({ tone, title, compact = false, children }: FeedbackProps) {
  const t = tones[tone];
  return (
    <div role="status" className={`flex items-start ${compact ? "gap-3 rounded-2xl p-3" : "gap-4 rounded-[1.25rem] p-5"} ${t.box}`}>
      <span className={`mt-0.5 grid shrink-0 place-items-center rounded-full ${compact ? "size-7" : "size-9"} ${t.badge}`}>{t.icon}</span>
      <div>
        <p className={`font-display font-bold ${compact ? "text-base" : "text-xl"}`}>{title}</p>
        {children ? <div className={`mt-1 ${compact ? "text-sm" : "text-base"}`}>{children}</div> : null}
      </div>
    </div>
  );
}
