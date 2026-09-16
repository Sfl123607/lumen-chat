"use client";
import { Check, Copy } from "lucide-react";
import type { ReactNode } from "react";
import { useCopy } from "@/hooks/useCopy";

interface Props { language: string | null; code: string; children: ReactNode }

/** Fenced code block with a language label and copy button. */
export function CodeBlock({ language, code, children }: Props) {
  const { copied, copy } = useCopy();
  return (
    <div className="not-prose my-2 overflow-hidden rounded-xl border bg-canvas">
      <div className="flex h-8 items-center justify-between border-b bg-raised/60 pl-3 pr-1">
        <span className="text-[11px] font-medium text-muted">{language ?? "text"}</span>
        <button
          type="button"
          onClick={() => copy(code)}
          aria-label={copied ? "Copied" : "Copy code"}
          className="inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-[11px] text-muted transition-colors hover:bg-raised hover:text-ink"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? "Copied" : "Copy"}
        </button>
      </div>
      {children}
    </div>
  );
}
