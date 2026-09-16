"use client";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { cn } from "@/utils/cn";

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
}

interface MenuProps {
  items: MenuItem[];
  /** Renders the trigger; receives props to spread on a button. */
  trigger: (props: { onClick: (e: React.MouseEvent) => void; "aria-haspopup": "menu"; "aria-expanded": boolean; "aria-controls": string }) => ReactNode;
  align?: "left" | "right";
}

/** Keyboard-navigable dropdown menu. */
export function Menu({ items, trigger, align = "right" }: MenuProps) {
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!rootRef.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setOpen(false); return; }
      if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx((i) => (i + 1) % items.length); }
      if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx((i) => (i - 1 + items.length) % items.length); }
      if (e.key === "Enter" || e.key === " ") {
        const item = items[activeIdx];
        if (item && !item.disabled) { e.preventDefault(); setOpen(false); item.onSelect(); }
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open, items, activeIdx]);

  useEffect(() => {
    if (open) rootRef.current?.querySelector<HTMLElement>(`[data-idx="${activeIdx}"]`)?.focus();
  }, [open, activeIdx]);

  return (
    <div ref={rootRef} className="relative inline-block">
      {trigger({
        onClick: (e) => { e.stopPropagation(); e.preventDefault(); setActiveIdx(0); setOpen((o) => !o); },
        "aria-haspopup": "menu",
        "aria-expanded": open,
        "aria-controls": id,
      })}
      {open && (
        <div
          id={id}
          role="menu"
          className={cn(
            "absolute z-40 mt-1 min-w-44 rounded-xl border bg-surface p-1 shadow-lg anim-fade-up",
            align === "right" ? "right-0" : "left-0",
          )}
        >
          {items.map((item, i) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              data-idx={i}
              disabled={item.disabled}
              tabIndex={i === activeIdx ? 0 : -1}
              onClick={(e) => { e.stopPropagation(); e.preventDefault(); setOpen(false); item.onSelect(); }}
              onMouseEnter={() => setActiveIdx(i)}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors focus:outline-none",
                item.danger ? "text-danger" : "text-ink",
                i === activeIdx && "bg-raised",
                item.disabled && "opacity-40 cursor-not-allowed",
              )}
            >
              {item.icon && <span className="text-muted">{item.icon}</span>}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
