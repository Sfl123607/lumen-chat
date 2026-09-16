"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { createSupabaseBrowserClient } from "@/lib/auth/supabase-browser";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const next = params.get("next") ?? "/";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    const supabase = createSupabaseBrowserClient();
    if (!supabase) { setError("Authentication isn't configured on this server."); return; }
    if (mode === "signup" && password.length < 8) { setError("Use a password with at least 8 characters."); return; }
    setBusy(true);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) { setError(friendly(error.message)); return; }
        router.replace(safeNext);
        router.refresh();
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) { setError(friendly(error.message)); return; }
        if (data.session) { router.replace("/"); router.refresh(); }
        else setNotice("Check your inbox for a confirmation link, then sign in.");
      }
    } catch {
      setError("Couldn't reach the authentication service. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="w-full max-w-sm" noValidate>
      <h1 className="text-xl font-semibold tracking-tight">{mode === "login" ? "Sign in" : "Create your account"}</h1>
      <p className="mt-1 text-sm text-muted">{mode === "login" ? "Your conversations are waiting." : "Conversations are private to your account."}</p>

      <div className="mt-6 space-y-3">
        <div>
          <label htmlFor="email" className="text-sm font-medium">Email</label>
          <input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label htmlFor="password" className="text-sm font-medium">Password</label>
          <input id="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={mode === "signup" ? 8 : undefined} value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} />
        </div>
      </div>

      {error && <p role="alert" className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
      {notice && <p role="status" className="mt-3 rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent">{notice}</p>}

      <Button type="submit" variant="primary" className="mt-5 w-full" disabled={busy || !email || !password}>
        {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
      </Button>

      <p className="mt-4 text-center text-sm text-muted">
        {mode === "login" ? (
          <>No account? <Link href="/signup" className="text-accent underline underline-offset-2">Create one</Link></>
        ) : (
          <>Already have an account? <Link href="/login" className="text-accent underline underline-offset-2">Sign in</Link></>
        )}
      </p>
    </form>
  );
}

const inputCls = "mt-1 h-10 w-full rounded-lg border bg-surface px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent";

function friendly(message: string): string {
  if (/invalid login credentials/i.test(message)) return "That email and password don't match.";
  if (/already registered/i.test(message)) return "An account with that email already exists. Try signing in.";
  if (/rate limit/i.test(message)) return "Too many attempts. Wait a minute and try again.";
  if (/failed to fetch|network|fetch/i.test(message)) return "Couldn't reach the authentication service. Check the Supabase URL and try again.";
  return message;
}
