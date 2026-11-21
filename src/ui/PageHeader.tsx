import type { ReactNode } from "react";

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="max-w-2xl">
      <h1 className="text-4xl font-bold sm:text-5xl">{title}</h1>
      {children ? <p className="mt-4 text-lg text-ink-soft">{children}</p> : null}
    </header>
  );
}
