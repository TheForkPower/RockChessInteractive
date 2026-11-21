import type { ReactNode } from "react";

export const fieldClass =
  "w-full rounded-2xl border-2 border-line-strong bg-surface px-4 py-3 text-base text-ink placeholder:text-ink-soft/70 aria-[invalid=true]:border-bad";

type Aria = { id: string; "aria-describedby"?: string; "aria-invalid"?: true };

type FieldProps = {
  id: string;
  label: string;
  help?: ReactNode;
  error?: string | null;
  children: (aria: Aria) => ReactNode;
};

/** A label, optional help, the control, and an error line, wired together for screen readers. */
export function Field({ id, label, help, error, children }: FieldProps) {
  const describedBy = [help ? `${id}-help` : null, error ? `${id}-error` : null].filter(Boolean).join(" ");
  return (
    <div>
      <label htmlFor={id} className="block font-display text-lg font-bold">
        {label}
      </label>
      {help ? (
        <p id={`${id}-help`} className="mt-1 text-sm text-ink-soft">
          {help}
        </p>
      ) : null}
      <div className="mt-2">
        {children({
          id,
          ...(describedBy ? { "aria-describedby": describedBy } : {}),
          ...(error ? { "aria-invalid": true as const } : {}),
        })}
      </div>
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-2 font-semibold text-bad-edge">
          {error}
        </p>
      ) : null}
    </div>
  );
}
