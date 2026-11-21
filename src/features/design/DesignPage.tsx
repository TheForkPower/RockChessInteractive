import { Button, ButtonLink } from "../../ui/Button";
import { Feedback } from "../../ui/Feedback";
import { GradeButton } from "../../ui/GradeButton";
import { PageHeader } from "../../ui/PageHeader";

const swatches = [
  { name: "Paper", token: "paper", hex: "#f5f6f3" },
  { name: "Surface", token: "surface", hex: "#ffffff" },
  { name: "Ink", token: "ink", hex: "#1d2733" },
  { name: "Ink soft", token: "ink-soft", hex: "#566170" },
  { name: "Line", token: "line", hex: "#e2e5df" },
  { name: "Brand", token: "brand", hex: "#3a56d4" },
  { name: "Good", token: "good", hex: "#23874c" },
  { name: "Bad", token: "bad", hex: "#cc3b30" },
  { name: "Caution", token: "caution", hex: "#f2b33d" },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-14">
      <h2 className="text-2xl font-bold">{title}</h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

export function DesignPage() {
  return (
    <div>
      <PageHeader title="Design system">
        The building blocks every screen uses. Everything here is real and interactive, apart from the sample
        intervals on the grade buttons.
      </PageHeader>

      <Section title="Colour">
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-5">
          {swatches.map(({ name, token, hex }) => (
            <li key={token}>
              <div
                className="h-16 rounded-2xl border-2 border-line"
                style={{ background: `var(--color-${token})` }}
                role="img"
                aria-label={`${name} swatch`}
              />
              <p className="mt-2 font-semibold">{name}</p>
              <p className="text-sm text-ink-soft">{hex}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Type">
        <div className="panel space-y-5 p-6 sm:p-8">
          <p className="text-6xl/[1.05] font-bold">Bricolage Grotesque</p>
          <p className="text-3xl font-bold">Headings and buttons use Bricolage Grotesque.</p>
          <p className="max-w-prose text-lg">
            Body text uses Figtree. It stays calm and readable at length, so a line of explanation next to a board
            never competes with the position.
          </p>
          <p className="text-sm text-ink-soft">Small text for notes and secondary detail.</p>
        </div>
      </Section>

      <Section title="Buttons">
        <div className="panel flex flex-wrap items-center gap-5 p-6 sm:p-8">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="good">Good</Button>
          <Button variant="caution">Caution</Button>
          <Button variant="danger">Danger</Button>
          <Button disabled>Unavailable</Button>
          <Button size="lg">Large primary</Button>
          <ButtonLink to="/" variant="secondary">
            Link styled as a button
          </ButtonLink>
        </div>
        <p className="mt-3 max-w-prose text-sm text-ink-soft">
          Buttons press down onto their lower edge. Unavailable buttons stay focusable so the reason beside them can be
          read aloud.
        </p>
      </Section>

      <Section title="Grade buttons">
        <div className="panel p-6 sm:p-8">
          <div role="group" aria-label="Grade buttons" className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <GradeButton grade="again" interval="1 min" />
            <GradeButton grade="hard" interval="6 min" />
            <GradeButton grade="good" interval="1 day" />
            <GradeButton grade="easy" interval="4 days" />
          </div>
          <p className="mt-4 text-sm text-ink-soft">
            Sample intervals, for layout only. Real intervals come from the scheduler in milestone 4.
          </p>
        </div>
      </Section>

      <Section title="Feedback">
        <div className="grid gap-4 md:grid-cols-2">
          <Feedback tone="good" title="Correct">
            Nf3 develops the knight and prepares d4.
          </Feedback>
          <Feedback tone="bad" title="Not quite">
            The move you wanted was Nf3.
          </Feedback>
        </div>
      </Section>
    </div>
  );
}
