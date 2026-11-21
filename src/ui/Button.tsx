import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Link, type LinkProps } from "react-router";
import { buttonClass, type ButtonSize, type ButtonVariant } from "./buttonClass";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

/**
 * `disabled` marks the button as unavailable with aria-disabled rather than the
 * native attribute, so it stays focusable and screen readers can still reach
 * the explanation linked with aria-describedby.
 */
export function Button({
  variant = "primary",
  size = "md",
  disabled = false,
  className = "",
  onClick,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      aria-disabled={disabled || undefined}
      className={`${buttonClass(variant, size)} ${className}`.trim()}
      onClick={(event) => {
        if (disabled) {
          event.preventDefault();
          return;
        }
        onClick?.(event);
      }}
    />
  );
}

type ButtonLinkProps = LinkProps & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
};

export function ButtonLink({ variant = "primary", size = "md", className = "", ...rest }: ButtonLinkProps) {
  return <Link {...rest} className={`${buttonClass(variant, size)} ${className}`.trim()} />;
}
