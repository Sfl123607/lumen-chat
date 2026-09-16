"use client";
import { useEffect, useState } from "react";
import { Download, Trash2 } from "lucide-react";
import { useChat } from "@/components/chat/ChatProvider";
import { Dialog } from "@/components/ui/Dialog";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Switch } from "@/components/ui/Switch";
import { DEFAULT_SYSTEM_PROMPT } from "@/lib/ai/system-prompt";
import type { ModelTier, Theme } from "@/types";
import type { ExportFormat } from "@/utils/export";
import { cn } from "@/utils/cn";

type Tab = "appearance" | "chat" | "ai" | "data";
const TABS: Array<{ id: Tab; label: string }> = [
  { id: "appearance", label: "Appearance" },
  { id: "chat", label: "Chat" },
  { id: "ai", label: "AI" },
  { id: "data", label: "Data" },
];

export function SettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { settings, updateSettings, status, activeId, activeConversation, exportConversation, deleteConversation, clearAllConversations, conversations } = useChat();
  const [tab, setTab] = useState<Tab>("appearance");
  const [prompt, setPrompt] = useState(settings.systemPrompt ?? "");
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => { setPrompt(settings.systemPrompt ?? ""); }, [settings.systemPrompt, open]);

  const savePrompt = () => {
    const t = prompt.trim();
    void updateSettings({ systemPrompt: t && t !== DEFAULT_SYSTEM_PROMPT ? t : null });
  };
  const promptDirty = (prompt.trim() || null) !== (settings.systemPrompt ?? null);

  return (
    <>
      <Dialog open={open} onClose={onClose} title="Settings" className="sm:max-w-xl">
        <div className="flex gap-1 border-b pb-2" role="tablist" aria-label="Settings sections">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              type="button"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={cn("rounded-lg px-3 py-1.5 text-sm font-medium transition-colors", tab === t.id ? "bg-raised text-ink" : "text-muted hover:text-ink")}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="min-h-[300px] pt-3" role="tabpanel">
          {tab === "appearance" && (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium">Theme</p>
                <div className="mt-2 grid grid-cols-3 gap-2" role="radiogroup" aria-label="Theme">
                  {(["light", "dark", "system"] as Theme[]).map((t) => (
                    <button
                      key={t}
                      type="button"
                      role="radio"
                      aria-checked={settings.theme === t}
                      onClick={() => void updateSettings({ theme: t })}
                      className={cn("h-10 rounded-lg border text-sm capitalize transition-colors", settings.theme === t ? "border-accent bg-accent-soft text-accent" : "hover:bg-raised")}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-[13px] text-muted">System follows your device's light or dark setting.</p>
              </div>
            </div>
          )}

          {tab === "chat" && (
            <div className="divide-y">
              <Switch label="Enter to send" description="Off: Enter adds a line, Ctrl/Cmd+Enter sends." checked={settings.enterToSend} onChange={(v) => void updateSettings({ enterToSend: v })} />
              <Switch label="Show timestamps" description="Display when each message was sent." checked={settings.showTimestamps} onChange={(v) => void updateSettings({ showTimestamps: v })} />
              <Switch label="Render Markdown" description="Format headings, lists, tables and code blocks in replies." checked={settings.renderMarkdown} onChange={(v) => void updateSettings({ renderMarkdown: v })} />
            </div>
          )}

          {tab === "ai" && (
            <div className="space-y-5">
              <div>
                <label htmlFor="default-model" className="text-sm font-medium">Default model</label>
                <Select<ModelTier>
                  id="default-model"
                  label="Default model"
                  className="mt-1.5"
                  value={settings.modelTier}
                  onChange={(v) => void updateSettings({ modelTier: v })}
                  options={(status?.ai.tiers ?? []).map((t) => ({ value: t.tier, label: `${t.label} — ${t.model}` }))}
                />
                <p className="mt-1.5 text-[13px] text-muted">Provider: {status?.ai.provider ?? "…"}. Model ids come from your environment configuration.</p>
              </div>

              <div>
                <label htmlFor="temperature" className="flex items-center justify-between text-sm font-medium">
                  Temperature <span className="tabular-nums text-muted">{settings.temperature.toFixed(1)}</span>
                </label>
                <input
                  id="temperature"
                  type="range" min={0} max={2} step={0.1}
                  value={settings.temperature}
                  onChange={(e) => void updateSettings({ temperature: Number(e.target.value) })}
                  className="mt-2 w-full accent-accent"
                />
                <p className="mt-1 text-[13px] text-muted">Lower is more focused and deterministic; higher is more varied. Some models ignore this.</p>
              </div>

              <div>
                <label htmlFor="max-tokens" className="flex items-center justify-between text-sm font-medium">
                  Maximum response length <span className="tabular-nums text-muted">{settings.maxTokens.toLocaleString()} tokens</span>
                </label>
                <input
                  id="max-tokens"
                  type="range" min={256} max={8192} step={256}
                  value={settings.maxTokens}
                  onChange={(e) => void updateSettings({ maxTokens: Number(e.target.value) })}
                  className="mt-2 w-full accent-accent"
                />
              </div>

              <div>
                <label htmlFor="system-prompt" className="text-sm font-medium">System prompt</label>
                <textarea
                  id="system-prompt"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={6}
                  maxLength={8000}
                  placeholder={DEFAULT_SYSTEM_PROMPT}
                  className="mt-1.5 w-full resize-y rounded-lg border bg-canvas px-3 py-2 font-mono text-[13px] leading-5 placeholder:text-faint focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                />
                <div className="mt-2 flex items-center justify-between gap-2">
                  <p className="text-[13px] text-muted">Leave empty to use the built-in default.</p>
                  <div className="flex gap-2">
                    {settings.systemPrompt && <Button size="sm" onClick={() => { setPrompt(""); void updateSettings({ systemPrompt: null }); }}>Reset</Button>}
                    <Button size="sm" variant="primary" onClick={savePrompt} disabled={!promptDirty}>Save prompt</Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === "data" && (
            <div className="space-y-5">
              <section>
                <p className="text-sm font-medium">Export current conversation</p>
                <p className="mt-0.5 text-[13px] text-muted">{activeConversation ? `"${activeConversation.title}"` : "Open a conversation to export it."}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(["md", "txt", "json"] as ExportFormat[]).map((f) => (
                    <Button key={f} size="sm" disabled={!activeId} onClick={() => activeId && void exportConversation(activeId, f)}>
                      <Download size={14} /> {f.toUpperCase()}
                    </Button>
                  ))}
                </div>
              </section>
              <section className="rounded-xl border border-danger/20 p-3">
                <p className="text-sm font-medium">Danger zone</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button size="sm" variant="danger" disabled={!activeId} onClick={() => setConfirmDelete(true)}><Trash2 size={14} /> Delete this conversation</Button>
                  <Button size="sm" variant="danger" disabled={conversations.length === 0} onClick={() => setConfirmClear(true)}><Trash2 size={14} /> Clear all history</Button>
                </div>
              </section>
              <p className="text-[13px] text-muted">
                {status?.auth.mode === "supabase" ? "Your conversations are stored in your account's database and are only visible to you." : "Demo mode: conversations are stored on this server for your guest session only."}
              </p>
            </div>
          )}
        </div>
      </Dialog>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete this conversation?"
        description="All of its messages will be removed. This can't be undone."
        confirmLabel="Delete"
        danger
        onConfirm={() => { setConfirmDelete(false); if (activeId) void deleteConversation(activeId); onClose(); }}
      />
      <ConfirmDialog
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        title="Clear all conversation history?"
        description={`This deletes all ${conversations.length} conversation${conversations.length === 1 ? "" : "s"} and their messages permanently.`}
        confirmLabel="Clear everything"
        danger
        onConfirm={() => { setConfirmClear(false); void clearAllConversations().then(onClose).catch(() => undefined); }}
      />
    </>
  );
}
