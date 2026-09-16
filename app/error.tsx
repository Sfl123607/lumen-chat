"use client";
import { useEffect } from "react";
import { Button } from "@/components/ui/Button";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="max-w-md text-center">
        <h1 className="text-lg font-semibold">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted">The page hit an unexpected error. Reloading usually fixes it.</p>
        <div className="mt-5 flex justify-center gap-2">
          <Button variant="primary" onClick={reset}>Try again</Button>
          <Button onClick={() => window.location.assign("/")}>Go home</Button>
        </div>
      </div>
    </main>
  );
}
