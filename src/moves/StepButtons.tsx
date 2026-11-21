import { Button } from "../ui/Button";
import { ChevronLeftIcon, ChevronRightIcon, SkipEndIcon, SkipStartIcon } from "../ui/Icons";

type Props = {
  canBack: boolean;
  canForward: boolean;
  onStart: () => void;
  onBack: () => void;
  onForward: () => void;
  onEnd: () => void;
};

/** Start, previous, next and end buttons for stepping through moves. */
export function StepButtons({ canBack, canForward, onStart, onBack, onForward, onEnd }: Props) {
  return (
    <div className="flex items-center justify-center gap-2" role="group" aria-label="Step through the moves">
      <Button variant="secondary" aria-label="Back to the start" disabled={!canBack} onClick={onStart}>
        <SkipStartIcon />
      </Button>
      <Button variant="secondary" aria-label="Previous move" disabled={!canBack} onClick={onBack}>
        <ChevronLeftIcon />
      </Button>
      <Button variant="secondary" aria-label="Next move" disabled={!canForward} onClick={onForward}>
        <ChevronRightIcon />
      </Button>
      <Button variant="secondary" aria-label="Forward to the end" disabled={!canForward} onClick={onEnd}>
        <SkipEndIcon />
      </Button>
    </div>
  );
}
