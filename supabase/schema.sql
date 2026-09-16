-- Lumen chat schema for Supabase (Postgres).
-- Run this in the Supabase SQL editor (or `supabase db push`) before starting the app
-- with NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY set.
--
-- Users live in auth.users (Supabase Auth). Every application row carries
-- user_id and is protected by row-level security so a user can only ever
-- read or write their own data, even if the application layer has a bug.

create extension if not exists pgcrypto;

-- ── conversations ──────────────────────────────────────────────
create table if not exists public.conversations (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  title            text not null default 'New chat' check (char_length(title) between 1 and 120),
  title_is_custom  boolean not null default false,
  summary          text,
  summary_through  timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists conversations_user_updated_idx
  on public.conversations (user_id, updated_at desc, id desc);

-- ── messages ───────────────────────────────────────────────────
create table if not exists public.messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references public.conversations (id) on delete cascade,
  user_id          uuid not null references auth.users (id) on delete cascade,
  role             text not null check (role in ('system', 'user', 'assistant')),
  content          text not null default '' check (char_length(content) <= 200000),
  model            text,
  feedback         text check (feedback in ('up', 'down')),
  created_at       timestamptz not null default clock_timestamp()
);

create index if not exists messages_conversation_created_idx
  on public.messages (conversation_id, created_at);
create index if not exists messages_user_created_idx
  on public.messages (user_id, created_at desc);
-- Trigram index makes ILIKE search fast on large histories (optional but recommended).
create extension if not exists pg_trgm;
create index if not exists messages_content_trgm_idx
  on public.messages using gin (content gin_trgm_ops);
create index if not exists conversations_title_trgm_idx
  on public.conversations using gin (title gin_trgm_ops);

-- ── settings (one row per user) ────────────────────────────────
create table if not exists public.settings (
  user_id          uuid primary key references auth.users (id) on delete cascade,
  theme            text not null default 'system' check (theme in ('light', 'dark', 'system')),
  enter_to_send    boolean not null default true,
  show_timestamps  boolean not null default true,
  render_markdown  boolean not null default true,
  model_tier       text not null default 'balanced' check (model_tier in ('fast', 'balanced', 'advanced')),
  temperature      numeric(3,2) not null default 0.7 check (temperature between 0 and 2),
  max_tokens       integer not null default 2048 check (max_tokens between 64 and 16384),
  system_prompt    text check (system_prompt is null or char_length(system_prompt) <= 8000),
  updated_at       timestamptz not null default now()
);

-- ── row-level security ─────────────────────────────────────────
alter table public.conversations enable row level security;
alter table public.messages      enable row level security;
alter table public.settings      enable row level security;

drop policy if exists "conversations: owner" on public.conversations;
create policy "conversations: owner" on public.conversations
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "messages: owner" on public.messages;
create policy "messages: owner" on public.messages
  for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.conversations c where c.id = conversation_id and c.user_id = auth.uid())
  );

drop policy if exists "settings: owner" on public.settings;
create policy "settings: owner" on public.settings
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- No anonymous access at all.
revoke all on public.conversations, public.messages, public.settings from anon;
grant select, insert, update, delete on public.conversations, public.messages, public.settings to authenticated;
