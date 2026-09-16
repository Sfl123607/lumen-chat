import type { Session } from "@/lib/auth/session";
import type { ConversationStore } from "@/lib/store/types";
import { SupabaseStore } from "@/lib/store/supabase-store";
import { LocalStore } from "@/lib/store/local-store";

export function getStore(session: Session): ConversationStore {
  if (session.mode === "supabase" && session.supabase) return new SupabaseStore(session.supabase, session.userId);
  return new LocalStore(session.userId);
}

export type { ConversationStore } from "@/lib/store/types";
export { LIMITS } from "@/lib/store/types";
