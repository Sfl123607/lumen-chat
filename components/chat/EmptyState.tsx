"use client";
import { BookOpen, Code2, Lightbulb, Puzzle, ScanText } from "lucide-react";
import { useChat } from "@/components/chat/ChatProvider";

const EXAMPLES = [
  { icon: BookOpen, label: "Explain something", prompt: "Explain how public-key cryptography works, using a simple analogy first and then the real mechanics." },
  { icon: Code2, label: "Help me code", prompt: "Write a TypeScript function that debounces another function, with types and a short usage example." },
  { icon: Lightbulb, label: "Brainstorm ideas", prompt: "Give me 10 name ideas for a weekend farmers' market app, with a one-line pitch for each." },
  { icon: ScanText, label: "Analyze text", prompt: "I'll paste a paragraph next. Summarize its main argument in two sentences and point out any weak reasoning." },
  { icon: Puzzle, label: "Solve a problem", prompt: "My Node.js server's memory grows over time until it crashes. Walk me through how to find the leak." },
];

export function EmptyState() {
  const { requestPrefill, status } = useChat();
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center px-4 py-10 text-center anim-fade-up">
      <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">How can I help?</h2>
      <p className="mt-2 max-w-md text-sm text-muted">Ask anything, brainstorm ideas, learn something new, or get help with a task.</p>

      {status && !status.ai.configured && (
        <div role="status" className="mt-6 w-full max-w-lg rounded-xl border border-accent/30 bg-accent-soft p-4 text-left text-sm">
          <p className="font-medium text-accent">Almost ready: connect an AI provider</p>
          <p className="mt-1 text-ink/80">{status.ai.setupMessage}</p>
        </div>
      )}

      <ul className="mt-8 flex flex-wrap justify-center gap-2" aria-label="Example prompts">
        {EXAMPLES.map(({ icon: Icon, label, prompt }) => (
          <li key={label}>
            <button
              type="button"
              onClick={() => requestPrefill(prompt)}
              className="inline-flex h-9 items-center gap-2 rounded-full border bg-surface px-3.5 text-[13px] font-medium text-ink transition-colors hover:bg-raised"
            >
              <Icon size={15} className="text-accent" /> {label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
