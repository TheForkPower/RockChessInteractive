import type { ReactNode } from "react";
import { PageHeader } from "./PageHeader";

type ComingSoonProps = {
  title: string;
  description: ReactNode;
  /** Which milestone delivers this page, in plain words. */
  arrives: string;
};

/** Honest placeholder: says what the page will do and when it is built. */
export function ComingSoon({ title, description, arrives }: ComingSoonProps) {
  return (
    <div>
      <PageHeader title={title}>{description}</PageHeader>
      <p className="panel mt-8 max-w-2xl px-6 py-5 text-ink-soft">Not built yet. {arrives}</p>
    </div>
  );
}
