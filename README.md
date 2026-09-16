# Lumen — AI chat application

A production-quality chat assistant: streaming replies from a real LLM, persistent
conversations in Postgres (Supabase) with per-user authentication, a pluggable
provider layer, and a polished responsive interface.

Nothing is faked. If a provider key isn't configured the app tells you what to set;
if Supabase isn't configured it runs in a clearly-labelled demo mode.

## Quick start (demo mode, 2 minutes)

```bash
npm install
cp .env.example .env.local
# edit .env.local: set AI_PROVIDER and the matching API key
npm run dev            # http://localhost:3000
```

Demo mode = no sign-in; each browser gets a guest session whose conversations are
stored server-side in `DATA_DIR` (default `./data`). Good for local evaluation only.

## Production setup (Supabase auth + Postgres)

1. Create a Supabase project and run `supabase/schema.sql` in the SQL editor.
   It creates `conversations`, `messages`, `settings` with row-level security so
   users can only ever touch their own rows. Users live in `auth.users`.
2. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in your env.
   (Only the public anon key is used in the browser; RLS enforces access.)
3. Set the provider key, then `npm run build && npm start`.

Deploys anywhere Next.js 15 runs (Vercel, Render, Fly, Docker). The rate limiter is
in-memory per instance — swap `lib/server/rate-limit.ts` for Redis/Upstash when
running several instances.

## Environment variables

See `.env.example` — every variable is documented there. Key ones:

| Variable | Purpose |
|---|---|
| `AI_PROVIDER` | `openai` \| `anthropic` \| `gemini` |
| `OPENAI_API_KEY`, `OPENAI_BASE_URL` | OpenAI or any OpenAI-compatible endpoint (Groq, OpenRouter, Ollama…) |
| `ANTHROPIC_API_KEY`, `GEMINI_API_KEY` | Other providers |
| `MODEL_FAST` / `MODEL_BALANCED` / `MODEL_ADVANCED` | Real model ids behind the Fast / Balanced / Advanced selector |
| `AI_CONTEXT_TOKEN_BUDGET` | When exceeded, older messages are summarized into a rolling summary |
| `NEXT_PUBLIC_SUPABASE_*` | Enables auth + Postgres; unset = demo mode |
| `RATE_LIMIT_*`, `MAX_MESSAGE_CHARS` | Abuse limits |

## Features

- New chat, multiple conversations, auto-generated titles, rename, delete, clear all
- Streaming responses with a stop button; partial replies are kept
- Edit a message (truncates the branch and regenerates), regenerate, retry after errors
- Copy responses / copy code, like & dislike (persisted)
- Search across titles and message content (debounced, server-side)
- Markdown with GFM tables, syntax-highlighted code blocks, safe rendering (no raw HTML)
- Model selector showing the actual model id for each tier
- Settings: theme, enter-to-send, timestamps, Markdown, model, temperature, max tokens,
  custom system prompt, export (TXT / Markdown / JSON), data deletion — all persisted
- Responsive: sidebar becomes a drawer on mobile; keyboard-navigable; reduced-motion aware

## Architecture

```
app/            routes (App Router) and API route handlers under app/api
components/     ui primitives, sidebar, chat, composer, markdown, settings, auth
lib/ai/         provider interface + openai / anthropic / gemini implementations,
                context management (summarization), title generation, system prompt
lib/store/      ConversationStore interface; SupabaseStore (RLS) and LocalStore (demo)
lib/auth/       session resolution (Supabase JWT or guest cookie)
lib/server/     request helpers: auth+rate limit context, validation (zod), errors
lib/client/     fetch wrapper and NDJSON chat stream reader
hooks/ utils/ types/ supabase/ scripts/
```

`POST /api/chat` streams NDJSON events (`meta`, `delta`, `done`, `error`). The
assistant row is created before streaming; content is written on completion, stop
or failure. Empty rows are removed so a failed generation leaves no ghost message.

## Tests

```bash
npm run mock-llm &                           # OpenAI-compatible mock (tests only)
OPENAI_API_KEY=test OPENAI_BASE_URL=http://127.0.0.1:8788/v1 npm run build
OPENAI_API_KEY=test OPENAI_BASE_URL=http://127.0.0.1:8788/v1 npm start &
npm run test:api                             # 18 end-to-end API test groups
```

Covers streaming, context, edit/regenerate/stop, titles, settings, provider errors,
validation, CSRF, per-user authorization, pagination, search and rate limiting.

## Not implemented (and not claimed by the assistant)

Web browsing, file/image upload, voice input, sharing, folders. The default system
prompt instructs the model to say these aren't available rather than pretend.
