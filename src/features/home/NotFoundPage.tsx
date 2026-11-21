import { ButtonLink } from "../../ui/Button";

export function NotFoundPage() {
  return (
    <div>
      <h1 className="text-5xl font-bold sm:text-6xl">Illegal move!</h1>
      <p className="mt-4 text-lg text-ink-soft">There's no page at this address.</p>
      <div className="mt-8">
        <ButtonLink to="/">Back to the start</ButtonLink>
      </div>
    </div>
  );
}
