import { useOverview } from "../../data/hooks";
import type { Overview } from "../../data/progress";
import { ButtonLink } from "../../ui/Button";

/** "12 due, 7 new", or why there is nothing to do. */
function overviewLine(overview: Overview): string {
  const parts = [overview.due > 0 ? `${overview.due} due` : "", overview.fresh > 0 ? `${overview.fresh} new` : ""].filter(Boolean);
  if (parts.length > 0) return parts.join(", ");
  return overview.newTotal > 0 ? "Today's new cards are done" : "Nothing due";
}

/** The combined session: everything that is due, then today's new cards. */
export function SessionStart() {
  const overview = useOverview();
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
      <ButtonLink to="/review?all=1" size="lg">
        Start learning &amp; review
      </ButtonLink>
      {overview ? <p className="text-lg font-semibold text-ink-soft">{overviewLine(overview)}</p> : null}
    </div>
  );
}
