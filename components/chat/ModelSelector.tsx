"use client";
import { ChevronDown, Check } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { useChat } from "@/components/chat/ChatProvider";
import { cn } from "@/utils/cn";

/**
 * Picks the model tier for the next generation. Shows the real model id each
 * tier maps to; when two tiers resolve to the same model, says so.
 */
export function ModelSelector({ disabled }: { disabled?: boolean }) {
  const { status, modelTier, setModelTier } = useChat();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  const tiers = status?.ai.tiers ?? [];
  const current = tiers.find((t) => t.tier === modelTier);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const modelCount = new Set(tiers.map((t) => t.model)).size;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled || tiers.length === 0}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={id}
        aria-label={`Model: ${current?.label ?? "loading"}`}
        className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-[13px] font-medium text-muted transition-colors hover:bg-raised hover:text-ink disabled:opacity-50"
      >
        {current?.label ?? "Model"} <ChevronDown size={14} />
      </button>
      {open && (
        <ul id={id} role="listbox" aria-label="Model" className="absolute bottom-full left-0 z-30 mb-1 w-72 rounded-xl border bg-surface p-1 shadow-lg anim-fade-up">
          {tiers.map((t) => (
            <li key={t.tier} role="option" aria-selected={t.tier === modelTier}>
              <button
                type="button"
                onClick={() => { setModelTier(t.tier); setOpen(false); }}
                className={cn("flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left hover:bg-raised", t.tier === modelTier && "bg-raised")}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{t.label}</span>
                  <span className="block text-xs text-muted">{t.description}</span>
                  <span className="mt-0.5 block truncate font-mono text-[11px] text-faint">{t.model}</span>
                </span>
                {t.tier === modelTier && <Check size={15} className="mt-0.5 shrink-0 text-accent" />}
              </button>
            </li>
          ))}
          {modelCount < tiers.length && (
            <li className="px-2.5 pb-1 pt-1.5 text-[11px] text-faint">Some tiers use the same model. Set MODEL_FAST / MODEL_BALANCED / MODEL_ADVANCED to change this.</li>
          )}
        </ul>
      )}
    </div>
  );
}
