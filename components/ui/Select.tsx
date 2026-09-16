"use client";
import { ChevronDown } from "lucide-react";
import { cn } from "@/utils/cn";

interface SelectProps<T extends string> {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: string }>;
  label: string;
  id?: string;
  className?: string;
}

export function Select<T extends string>({ value, onChange, options, label, id, className }: SelectProps<T>) {
  return (
    <div className={cn("relative", className)}>
      <select
        id={id}
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="h-9 w-full appearance-none rounded-lg border bg-surface pl-3 pr-8 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted" />
    </div>
  );
}
