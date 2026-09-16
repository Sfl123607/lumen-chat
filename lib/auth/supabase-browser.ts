"use client";
import { createBrowserClient } from "@supabase/ssr";

/** Browser Supabase client. Only the public anon key is ever used in the browser. */
export function createSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createBrowserClient(url, key);
}
