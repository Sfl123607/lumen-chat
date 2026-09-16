import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isSupabaseConfigured } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { createSupabaseServerClient } from "@/lib/auth/supabase-server";
import type { AuthMode } from "@/types";

export const GUEST_COOKIE = "chat_guest_id";

export interface Session {
  mode: AuthMode;
  userId: string;
  email: string | null;
  /** Present in supabase mode; queries run under this user's RLS policies. */
  supabase: SupabaseClient | null;
}

/**
 * Resolves the current user. In Supabase mode this validates the JWT with
 * Supabase (never trusts the cookie contents). In demo mode the guest id
 * cookie set by the middleware identifies the visitor.
 */
export async function getSession(): Promise<Session | null> {
  if (isSupabaseConfigured()) {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return null;
    return { mode: "supabase", userId: data.user.id, email: data.user.email ?? null, supabase };
  }
  const store = await cookies();
  const guest = store.get(GUEST_COOKIE)?.value;
  if (!guest || !/^[a-f0-9-]{36}$/.test(guest)) return null;
  return { mode: "demo", userId: `guest:${guest}`, email: null, supabase: null };
}

export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) throw new AppError("unauthorized", "You need to be signed in to do that.");
  return session;
}
