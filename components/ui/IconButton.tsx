"use client";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/utils/cn";

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Accessible name; also used as the tooltip. */
  label: string;
  size?: "sm" | "md";
  active?: boolean;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, className, size = "md", active = false, type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex items-center justify-center rounded-md text-muted transition-colors duration-150 hover:bg-raised hover:text-ink disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent",
        size === "sm" ? "h-7 w-7" : "h-8 w-8",
        active && "text-accent bg-accent-soft hover:bg-accent-soft hover:text-accent",
        className,
      )}
      {...props}
    />
  );
});
