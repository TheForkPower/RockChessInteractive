import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { backupFileName, exportBackup, importBackup, problemCount, readBackup, type ImportSummary, type ReadResult } from "../../data/backup";
import { downloadText } from "../../data/download";
import { protectionStatus, requestProtection, storageUsed, type Protection } from "../../data/persist";
import { STORAGE_ERROR } from "../../data/repo";
import { Button } from "../../ui/Button";
import { Feedback } from "../../ui/Feedback";

type Picked = { name: string; result: ReadResult };

const plural = (count: number, one: string, many = `${one}s`) => `${count.toLocaleString("en-GB")} ${count === 1 ? one : many}`;

function megabytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return mb < 0.1 ? "under 0.1 MB" : `${mb.toFixed(1)} MB`;
}

function dateOf(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "an unknown date" : date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

function summaryLine(summary: ImportSummary): string {
  if (summary.mode === "replace") {
    return `Restored ${plural(summary.decksAdded, "deck")} and ${plural(summary.cardsAdded, "card")}.`;
  }
  const parts = [`Added ${plural(summary.decksAdded, "deck")} and ${plural(summary.cardsAdded, "card")}`];
  if (summary.decksMerged > 0) parts.push(`${plural(summary.decksMerged, "deck")} were already here, so their cards went in there`);
  if (summary.cardsSkipped > 0) parts.push(`${plural(summary.cardsSkipped, "card")} were already here and were left as they are`);
  return `${parts.join(". ")}.`;
}

/** Backup and restore, and keeping the browser from clearing the data. */
export function DataSection() {
  const [picked, setPicked] = useState<Picked | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState<ImportSummary | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [protection, setProtection] = useState<Protection | null>(null);
  const [used, setUsed] = useState<number | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let live = true;
    void protectionStatus().then((value) => live && setProtection(value));
    void storageUsed().then((value) => live && setUsed(value));
    return () => {
      live = false;
    };
  }, []);

  async function download() {
    setProblem(null);
    setBusy(true);
    try {
      const backup = await exportBackup();
      downloadText(backupFileName(backup), JSON.stringify(backup));
    } catch {
      setProblem(STORAGE_ERROR);
    } finally {
      setBusy(false);
    }
  }

  async function choose(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setProblem(null);
    setDone(null);
    setConfirming(false);
    try {
      setPicked({ name: file.name, result: readBackup(await file.text()) });
    } catch {
      setPicked(null);
      setProblem("That file couldn't be read.");
    }
  }

  async function restore(mode: "merge" | "replace") {
    if (!picked || !picked.result.ok) return;
    setProblem(null);
    setBusy(true);
    try {
      setDone(await importBackup(picked.result.backup, mode));
      setPicked(null);
      setConfirming(false);
    } catch {
      setProblem("The backup wasn't restored, and nothing was changed. Storage may be blocked in this browser.");
    } finally {
      setBusy(false);
    }
  }

  async function protect() {
    setProtection(await requestProtection());
  }

  const result = picked?.result;
  const ready = result && result.ok ? result : null;

  return (
    <section aria-labelledby="data" className="panel max-w-2xl space-y-6 p-6">
      <h2 id="data" className="text-2xl font-bold">
        Your data
      </h2>
      <p className="text-ink-soft">Everything is saved in this browser only. A backup file is how you keep it safe, or move it somewhere else.</p>

      {problem ? (
        <Feedback tone="bad" title="That didn't work">
          {problem}
        </Feedback>
      ) : null}

      <div>
        <p className="font-display text-lg font-bold">Download a backup</p>
        <p className="mt-1 text-sm text-ink-soft">One file with your decks, cards, progress and settings. To save a single deck, use Export deck on its page.</p>
        <div className="mt-3">
          <Button disabled={busy} onClick={() => void download()}>
            Download backup
          </Button>
        </div>
      </div>

      <div>
        <p className="font-display text-lg font-bold">Restore from a file</p>
        <p className="mt-1 text-sm text-ink-soft">A backup, or a single deck you exported. The file is checked before anything changes.</p>
        <div className="mt-3">
          <Button variant="secondary" onClick={() => fileInput.current?.click()}>
            Choose a file
          </Button>
          <input ref={fileInput} type="file" accept=".json,application/json" className="sr-only" tabIndex={-1} aria-label="Backup file" onChange={choose} />
        </div>

        {result && !result.ok ? (
          <div className="mt-4">
            <Feedback tone="bad" title="Can't use that file">
              {result.error}
            </Feedback>
          </div>
        ) : null}

        {ready ? (
          <div className="mt-4 rounded-2xl bg-brand-wash p-5">
            <p className="font-display text-lg font-bold">{picked?.name}</p>
            <p className="mt-1">
              {ready.backup.scope === "deck" ? "A deck" : "A backup"} made on {dateOf(ready.backup.exportedAt)}:{" "}
              {plural(ready.backup.data.decks.length, "deck")}, {plural(ready.backup.data.cards.length, "card")}, {plural(ready.backup.data.reviews.length, "review")}.
            </p>
            {problemCount(ready.problems) > 0 ? (
              <p role="status" className="mt-2 font-semibold">
                Some of it can't be read and will be left out:{" "}
                {[
                  ready.problems.decks ? plural(ready.problems.decks, "deck") : "",
                  ready.problems.cards ? plural(ready.problems.cards, "card") : "",
                  ready.problems.reviews ? plural(ready.problems.reviews, "review") : "",
                  ready.problems.schedules ? plural(ready.problems.schedules, "schedule") : "",
                  ready.problems.sources ? plural(ready.problems.sources, "source") : "",
                ]
                  .filter(Boolean)
                  .join(", ")}
                .
              </p>
            ) : null}
            {ready.problems.adjusted > 0 ? (
              <p className="mt-2">{plural(ready.problems.adjusted, "card")} will be added without its saved line, which couldn't be read.</p>
            ) : null}

            {confirming ? (
              <div className="mt-4">
                <Feedback tone="bad" title="Replace everything in this browser?">
                  <p>
                    This deletes every deck, card and review here, then puts the backup in its place. It can't be undone, so download a backup of
                    what you have now first.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <Button variant="secondary" disabled={busy} onClick={() => void download()}>
                      Download what I have now
                    </Button>
                    <Button variant="danger" disabled={busy} onClick={() => void restore("replace")}>
                      Replace everything
                    </Button>
                    <Button variant="secondary" onClick={() => setConfirming(false)}>
                      Cancel
                    </Button>
                  </div>
                </Feedback>
              </div>
            ) : (
              <div className="mt-4 flex flex-wrap gap-3">
                <Button disabled={busy} onClick={() => void restore("merge")}>
                  Add to what I have
                </Button>
                {ready.backup.scope === "all" ? (
                  <Button variant="secondary" disabled={busy} onClick={() => setConfirming(true)}>
                    Replace everything
                  </Button>
                ) : null}
                <Button variant="secondary" onClick={() => setPicked(null)}>
                  Cancel
                </Button>
              </div>
            )}
          </div>
        ) : null}

        {done ? (
          <div className="mt-4">
            <Feedback tone="good" title={done.mode === "replace" ? "Restored" : "Added"}>
              {summaryLine(done)}
            </Feedback>
          </div>
        ) : null}
      </div>

      <div>
        <p className="font-display text-lg font-bold">Keep it from being cleared</p>
        <p className="mt-1 text-sm text-ink-soft">
          Browsers can delete a site's saved data when they are short of space. Asking to keep it makes that much less likely.
          {used !== null ? ` RockChess is using ${megabytes(used)}.` : ""}
        </p>
        <p className="mt-3 font-semibold" role="status">
          {protection === "protected"
            ? "This browser has agreed to keep your data."
            : protection === "unprotected"
              ? "Your data could be cleared if the browser runs short of space."
              : protection === "unsupported"
                ? "This browser doesn't say whether it will keep your data. Download a backup now and then."
                : ""}
        </p>
        {protection === "unprotected" ? (
          <div className="mt-3">
            <Button variant="secondary" onClick={() => void protect()}>
              Keep my data
            </Button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
