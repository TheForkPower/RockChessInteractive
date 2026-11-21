// Minimal typings for the parts of cm-chessboard (MIT) this app uses.
// The library ships without type declarations.

declare module "cm-chessboard/src/Chessboard.js" {
  export type BoardColor = "w" | "b";

  export const COLOR: { white: "w"; black: "b" };
  export const BORDER_TYPE: { none: "none"; thin: "thin"; frame: "frame" };
  export const INPUT_EVENT_TYPE: {
    moveInputStarted: "moveInputStarted";
    movingOverSquare: "movingOverSquare";
    validateMoveInput: "validateMoveInput";
    moveInputCanceled: "moveInputCanceled";
    moveInputFinished: "moveInputFinished";
  };

  export type MoveInputEvent = {
    type: string;
    chessboard: Chessboard;
    squareFrom?: string;
    squareTo?: string;
  };

  export type MarkerType = { class: string; slice: string };

  export type PromotionResult =
    | { type: "pieceSelected"; square: string; piece: string }
    | { type: "canceled" };

  export class Chessboard {
    constructor(context: HTMLElement, props?: Record<string, unknown>);
    setPosition(fen: string, animated?: boolean): Promise<void>;
    setOrientation(color: BoardColor, animated?: boolean): Promise<void>;
    getOrientation(): BoardColor;
    getPosition(): string;
    getPiece(square: string): string | null;
    enableMoveInput(handler: (event: MoveInputEvent) => boolean | void, color?: BoardColor): void;
    disableMoveInput(): void;
    cancelMoveInput(): void;
    destroy(): void;
    // Added by the Markers extension.
    addMarker(type: MarkerType, square: string): void;
    removeMarkers(type?: MarkerType, square?: string): void;
    addLegalMovesMarkers(moves: { from: string; to: string; promotion?: string }[]): void;
    removeLegalMovesMarkers(): void;
    // Added by the PromotionDialog extension.
    showPromotionDialog(square: string, color: BoardColor, callback: (result: PromotionResult) => void): void;
  }
}

declare module "cm-chessboard/src/extensions/markers/Markers.js" {
  export class Markers {}
}

declare module "cm-chessboard/src/extensions/promotion-dialog/PromotionDialog.js" {
  export class PromotionDialog {}
}
