"use client";
import { cn } from "@/utils/cn";

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}

export function Switch({ checked, onChange, label, description, disabled }: SwitchProps) {
  return (
    <label className={cn("flex items-center justify-between gap-4 py-2.5 cursor-pointer", disabled && "opacity-50 cursor-not-allowed")}>
      <span>
        <span className="block text-sm font-medium">{label}</span>
        {description && <span className="block text-[13px] text-muted">{description}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-6 w-10 shrink-0 rounded-full transition-colors duration-150",
          checked ? "bg-accent" : "bg-raised border",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-150",
            checked ? "translate-x-4" : "translate-x-0",
            !checked && "bg-surface",
          )}
        />
      </button>
    </label>
  );
}
