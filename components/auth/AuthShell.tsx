import type { ReactNode } from "react";

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center p-6">
      <div className="mb-8 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-accent-ink">
          <svg viewBox="0 0 64 64" width="16" height="16" fill="currentColor"><path d="M20 44V20h6v18h14v6H20z" /><circle cx="43" cy="24" r="4" /></svg>
        </span>
        <span className="text-base font-semibold tracking-tight">Lumen</span>
      </div>
      <div className="w-full max-w-sm rounded-2xl border bg-surface p-6 shadow-sm">{children}</div>
    </main>
  );
}
