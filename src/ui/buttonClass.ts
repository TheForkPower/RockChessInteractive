export type ButtonVariant = "primary" | "secondary" | "good" | "caution" | "danger";
export type ButtonSize = "md" | "lg";

export function buttonClass(variant: ButtonVariant = "primary", size: ButtonSize = "md") {
  return `btn btn-${variant}${size === "lg" ? " btn-lg" : ""}`;
}
