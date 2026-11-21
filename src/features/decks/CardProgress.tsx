import { useState } from "react";
import { resetProgress } from "../../data/progress";
import { STORAGE_ERROR } from "../../data/repo";
import { useCardReviews, useSettings } from "../../data/hooks";
import { OUTCOME_LABELS } from "../../domain/review";
import { dueLabel, formatInterval, GRADE_LABELS, gradeOfRating, recallChance, type Schedule } from "../../domain/scheduling";
import { formatDuration } from "../../domain/timing";
import { Button } from "../../ui/Button";
import { Feedback } from "../../ui/Feedback";

const dateOf = (time: number) => new Date(time).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

function Fact({ label, children }: { label: string; children: string }) {
  return (
    <div>
      <dt className="text-sm font-semibold text-ink-soft">{label}</dt>
      <dd className="font-display text-lg font-bold">{children}</dd>
    </div>
  );
}

type Props = { cardId: string; schedule: Schedule | undefined };

/** When a card comes back, what the scheduler knows about it, and every review so far. */
export function CardProgress({ cardId, schedule }: Props) {
  const reviews = useCardReviews(cardId);
  const settings = useSettings();
  const [now] = useState(() => Date.now());
  const [confirming, setConfirming] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function reset() {
    setProblem(null);
    try {
      await resetProgress(cardId);
      setConfirming(false);
    } catch {
      setProblem(STORAGE_ERROR);
    }
  }

  return (
    <section aria-labelledby={`progress-${cardId}`} className="mt-8 border-t-2 border-line pt-6">
      <h3 id={`progress-${cardId}`} className="font-display text-lg font-bold">
        Progress
      </h3>
      {!schedule ? (
        <p className="mt-2 text-ink-soft">Not studied yet. It is new.</p>
      ) : (
        <>
          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
            <Fact label="Next review">{`${dateOf(schedule.due)}`}</Fact>
            <Fact label="Status">{dueLabel(schedule.due, now)}</Fact>
            <Fact label="Last gap">{formatInterval(schedule.scheduledDays)}</Fact>
            <Fact label="Reviews">{schedule.reps === 1 ? "1 review" : `${schedule.reps} reviews`}</Fact>
            <Fact label="Lapses">{String(schedule.lapses)}</Fact>
            <Fact label="Recall chance now">{`${Math.round(recallChance(schedule, now, settings.desiredRetention) * 100)}%`}</Fact>
            <Fact label="Stability">{formatInterval(schedule.stability)}</Fact>
            <Fact label="Difficulty">{`${schedule.difficulty.toFixed(1)} out of 10`}</Fact>
          </dl>

          {reviews && reviews.length > 0 ? (
            <div className="mt-6 overflow-x-auto">
              <table className="w-full min-w-[32rem] text-left text-sm">
                <caption className="pb-2 text-left font-semibold text-ink-soft">History, newest first</caption>
                <thead>
                  <tr className="border-b-2 border-line text-ink-soft">
                    <th scope="col" className="py-1.5 pr-3 font-semibold">Date</th>
                    <th scope="col" className="py-1.5 pr-3 font-semibold">Result</th>
                    <th scope="col" className="py-1.5 pr-3 font-semibold">Grade</th>
                    <th scope="col" className="py-1.5 pr-3 font-semibold">Time</th>
                    <th scope="col" className="py-1.5 font-semibold">Next gap</th>
                  </tr>
                </thead>
                <tbody>
                  {reviews.slice(0, 10).map((entry) => (
                    <tr key={entry.id} className="border-b border-line">
                      <td className="py-1.5 pr-3">{dateOf(entry.reviewedAt)}</td>
                      <td className="py-1.5 pr-3">{OUTCOME_LABELS[entry.outcome]}</td>
                      <td className="py-1.5 pr-3 font-semibold">{GRADE_LABELS[gradeOfRating(entry.rating)]}</td>
                      <td className="py-1.5 pr-3">{entry.timing.reliable ? formatDuration(entry.timing.activeMs) : "Not counted"}</td>
                      <td className="py-1.5">{formatInterval(entry.after.scheduledDays)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {reviews.length > 10 ? <p className="mt-2 text-sm text-ink-soft">Showing the latest 10 of {reviews.length}.</p> : null}
            </div>
          ) : null}

          <div className="mt-5">
            {confirming ? (
              <Feedback tone="bad" title="Reset this card's progress?">
                <p>It becomes a new card again, and its history is deleted. It can't be undone.</p>
                <div className="mt-4 flex gap-3">
                  <Button variant="danger" onClick={reset}>
                    Reset progress
                  </Button>
                  <Button variant="secondary" onClick={() => setConfirming(false)}>
                    Keep it
                  </Button>
                </div>
              </Feedback>
            ) : (
              <Button variant="secondary" onClick={() => setConfirming(true)}>
                Reset progress
              </Button>
            )}
            {problem ? (
              <p role="alert" className="mt-3 font-semibold text-bad-edge">
                {problem}
              </p>
            ) : null}
          </div>
        </>
      )}
    </section>
  );
}
