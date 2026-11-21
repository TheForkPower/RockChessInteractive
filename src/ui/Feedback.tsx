import type { ReactNode } from "react";
import { CheckIcon, CrossIcon } from "./Icons";

type FeedbackProps = {
  tone: "good" | "bad";
  title: string;
  children?: ReactNode;
};

const tones = {
  good: { box: "bg-good-wash text-good-edge", icon: <CheckIcon />, badge: "bg-good text-white" },
  bad: { box: "bg-bad-wash text-bad-edge", icon: <CrossIcon />, badge: "bg-bad text-white" },
};

/** Result banner shown after the player answers. Announced to screen readers. */
export function Feedback({ tone, title, children }: FeedbackProps) {
  const t = tones[tone];
  return (
    <div role="status" className={`flex items-start gap-4 rounded-[1.25rem] p-5 ${t.box}`}>
      <span className={`mt-0.5 grid size-9 shrink-0 place-items-center rounded-full ${t.badge}`}>{t.icon}</span>
      <div>
        <p className="font-display text-xl font-bold">{title}</p>
        {children ? <div className="mt-1 text-base">{children}</div> : null}
      </div>
    </div>
  );
}
