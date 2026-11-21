import { useState, type ReactNode } from "react";
import { saveSettings } from "../../data/progress";
import { useSettings } from "../../data/hooks";
import { STORAGE_ERROR } from "../../data/repo";
import { IDLE_CHOICES, NEW_PER_DAY_CHOICES, RETENTION_CHOICES, type Settings } from "../../domain/settings";
import { Feedback } from "../../ui/Feedback";
import { Segmented } from "../../ui/Segmented";

const idleLabel = (seconds: number) => (seconds < 60 ? `${seconds} s` : `${seconds / 60} min`);

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="panel max-w-2xl space-y-6 p-6">
      <h2 id={id} className="text-2xl font-bold">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Setting({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <p className="font-display text-lg font-bold">{label}</p>
      {hint ? <p className="mt-1 text-sm text-ink-soft">{hint}</p> : null}
      <div className="mt-3">{children}</div>
    </div>
  );
}

export function SettingsPage() {
  const settings = useSettings();
  const [problem, setProblem] = useState<string | null>(null);

  async function change(patch: Partial<Settings>) {
    setProblem(null);
    try {
      await saveSettings(patch);
    } catch {
      setProblem(STORAGE_ERROR);
    }
  }

  return (
    <div className="space-y-8">
      <h1 className="text-4xl font-bold sm:text-5xl">Settings</h1>

      {problem ? (
        <div className="max-w-xl">
          <Feedback tone="bad" title="That didn't save">
            {problem}
          </Feedback>
        </div>
      ) : null}

      <Section id="scheduling" title="Scheduling">
        <Setting label="New cards per day" hint="How many cards you haven't seen are introduced each day, across all decks.">
          <Segmented
            label="New cards per day"
            value={String(settings.newPerDay)}
            options={NEW_PER_DAY_CHOICES.map((value) => ({ value: String(value), label: String(value) }))}
            onChange={(value) => void change({ newPerDay: Number(value) })}
          />
        </Setting>
        <Setting label="How much you want to remember" hint="Higher means more reviews.">
          <Segmented
            label="How much you want to remember"
            value={String(settings.desiredRetention)}
            options={RETENTION_CHOICES.map((value) => ({ value: String(value), label: `${Math.round(value * 100)}%` }))}
            onChange={(value) => void change({ desiredRetention: Number(value) })}
          />
        </Setting>
      </Section>

      <Section id="timing" title="Response time">
        <Setting label="Suggest Easy for quick answers" hint="It only ever raises the suggestion. A slow answer never lowers it, and you choose the grade.">
          <Segmented
            label="Suggest Easy for quick answers"
            value={settings.timeSignal ? "on" : "off"}
            options={[
              { value: "on", label: "On" },
              { value: "off", label: "Off" },
            ]}
            onChange={(value) => void change({ timeSignal: value === "on" })}
          />
        </Setting>
        <Setting label="A pause counts as thinking for up to" hint="After that, the time is treated as idle and left out.">
          <Segmented
            label="A pause counts as thinking for up to"
            value={String(settings.idleSeconds)}
            options={IDLE_CHOICES.map((value) => ({ value: String(value), label: idleLabel(value) }))}
            onChange={(value) => void change({ idleSeconds: Number(value) })}
          />
        </Setting>
      </Section>
    </div>
  );
}
