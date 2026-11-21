import { useEffect, type ComponentType, type SVGProps } from "react";
import { Link, NavLink, Outlet } from "react-router";
import { installTutorialDeckOnce } from "../data/seed";
import { CreateIcon, DecksIcon, HomeIcon, SettingsIcon } from "../ui/Icons";
import { Wordmark } from "../ui/Logo";

type NavItem = {
  to: string;
  label: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  end?: boolean;
};

const items: NavItem[] = [
  { to: "/", label: "Home", Icon: HomeIcon, end: true },
  { to: "/decks", label: "Decks", Icon: DecksIcon },
  { to: "/create", label: "Create", Icon: CreateIcon },
  { to: "/settings", label: "Settings", Icon: SettingsIcon },
];

/**
 * One navigation landmark, laid out two ways: inline in the top bar on wide
 * screens, and as a fixed tab bar along the bottom on phones.
 */
export function Shell() {
  // First visit: put the starter deck in place. If storage is blocked there is
  // nothing to add it to, and the pages already explain that.
  useEffect(() => {
    installTutorialDeckOnce().catch(() => {});
  }, []);

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only rounded-xl bg-surface px-4 py-2 font-semibold focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50"
      >
        Skip to content
      </a>

      <header className="border-b-2 border-line bg-paper">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-5 sm:px-8">
          <Link to="/" aria-label="RockChess Recall, home" className="rounded-xl">
            <Wordmark />
          </Link>

          <nav
            aria-label="Main"
            className="fixed inset-x-0 bottom-0 z-30 border-t-2 border-line bg-surface pb-[env(safe-area-inset-bottom)] md:static md:border-0 md:bg-transparent md:pb-0"
          >
            <ul className="mx-auto flex max-w-md justify-around gap-1 px-2 py-1.5 md:max-w-none md:justify-end md:p-0">
              {items.map(({ to, label, Icon, end }) => (
                <li key={to} className="flex-1 md:flex-none">
                  <NavLink
                    to={to}
                    end={end}
                    className={({ isActive }) =>
                      [
                        "flex flex-col items-center gap-0.5 rounded-xl px-3 py-2 text-xs font-semibold transition-colors md:flex-row md:px-4 md:text-base",
                        isActive ? "bg-brand-wash text-brand" : "text-ink-soft hover:bg-line/60 hover:text-ink",
                      ].join(" ")
                    }
                  >
                    <Icon className="md:hidden" />
                    {label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-5 py-10 pb-28 sm:px-8 md:py-14 md:pb-16">
        <Outlet />
      </main>
    </div>
  );
}
