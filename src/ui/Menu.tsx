import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Link } from "react-router";
import { DotsIcon } from "./Icons";

export type MenuItem =
  | { label: string; to: string; danger?: boolean }
  | { label: string; onSelect: () => void; danger?: boolean };

type Props = {
  /** What the button is called for screen readers, such as "More options for Famous moves". */
  label: string;
  items: MenuItem[];
  /** Colours for the button when it sits on a coloured background. */
  tone?: "light" | "dark";
  /** Show this word on the button instead of the three dots. */
  text?: ReactNode;
  /** Classes for the button when it shows text. */
  textClass?: string;
  /** Where the list opens. "up-on-small" opens upwards on narrow screens, for a menu in a bar along the bottom. */
  placement?: "below" | "up-on-small";
};

const itemClass =
  "block w-full rounded-xl px-3 py-2 text-left font-semibold text-ink hover:bg-line/60 focus-visible:bg-line/60";

/**
 * A button that opens a short list of actions. Arrow keys move through the
 * list, Escape or a click elsewhere closes it, and focus goes back to the button.
 */
export function Menu({ label, items, tone = "light", text, textClass = "", placement = "below" }: Props) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  function close(returnFocus: boolean) {
    setOpen(false);
    if (returnFocus) trigger.current?.focus();
  }

  useEffect(() => {
    if (!open) return;
    root.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    function away(event: MouseEvent | FocusEvent) {
      if (root.current && event.target instanceof Node && !root.current.contains(event.target)) setOpen(false);
    }
    document.addEventListener("mousedown", away);
    document.addEventListener("focusin", away);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("focusin", away);
    };
  }, [open]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!open) return;
    const entries = Array.from(root.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    const at = entries.indexOf(document.activeElement as HTMLElement);
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close(true);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      entries[(at + 1) % entries.length]?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      entries[(at - 1 + entries.length) % entries.length]?.focus();
    } else if (event.key === "Home") {
      event.preventDefault();
      entries[0]?.focus();
    } else if (event.key === "End") {
      event.preventDefault();
      entries[entries.length - 1]?.focus();
    } else if (event.key === "Tab") {
      setOpen(false);
    }
  }

  return (
    <div ref={root} className="relative" onKeyDown={onKeyDown}>
      <button
        ref={trigger}
        type="button"
        aria-label={text ? undefined : label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={
          text
            ? textClass
            : [
                "grid size-10 place-items-center rounded-full transition-colors",
                tone === "dark" ? "text-white hover:bg-white/20" : "text-ink hover:bg-line/60",
                open ? (tone === "dark" ? "bg-white/25" : "bg-line/60") : "",
              ].join(" ")
        }
      >
        {text ?? <DotsIcon />}
      </button>
      {open ? (
        <div
          role="menu"
          aria-label={label}
          className={[
            "absolute right-0 z-30 w-52 rounded-2xl border-2 border-line bg-surface p-1.5 shadow-lg",
            placement === "up-on-small" ? "bottom-full mb-2 md:bottom-auto md:top-full md:mb-0 md:mt-1" : "top-full mt-1",
          ].join(" ")}
        >
          {items.map((item) =>
            "to" in item ? (
              <Link
                key={item.label}
                role="menuitem"
                to={item.to}
                className={`${itemClass} ${item.danger ? "!text-bad-edge" : ""}`}
                onClick={() => setOpen(false)}
              >
                {item.label}
              </Link>
            ) : (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                className={`${itemClass} ${item.danger ? "!text-bad-edge" : ""}`}
                onClick={() => {
                  setOpen(false);
                  item.onSelect();
                }}
              >
                {item.label}
              </button>
            ),
          )}
        </div>
      ) : null}
    </div>
  );
}
