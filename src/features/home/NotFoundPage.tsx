import { ButtonLink } from "../../ui/Button";
import { PageHeader } from "../../ui/PageHeader";

export function NotFoundPage() {
  return (
    <div>
      <PageHeader title="That page doesn't exist">Check the address, or go back to the start page.</PageHeader>
      <div className="mt-8">
        <ButtonLink to="/">Go home</ButtonLink>
      </div>
    </div>
  );
}
