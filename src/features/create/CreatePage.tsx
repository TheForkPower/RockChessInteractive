import { ComingSoon } from "../../ui/ComingSoon";

export function CreatePage() {
  return (
    <ComingSoon
      title="Create a card"
      description="Paste a PGN or FEN, pick the position, then add an explanation and a clickable continuation."
      arrives="The board arrives in milestone 1 and card creation in milestone 2."
    />
  );
}
