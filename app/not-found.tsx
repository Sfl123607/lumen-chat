import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="max-w-md text-center">
        <h1 className="text-lg font-semibold">Page not found</h1>
        <p className="mt-2 text-sm text-muted">That link doesn't point anywhere.</p>
        <Link href="/" className="mt-5 inline-flex h-9 items-center rounded-lg bg-accent px-4 text-sm font-medium text-accent-ink">Back to chat</Link>
      </div>
    </main>
  );
}
