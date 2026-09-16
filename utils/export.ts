import type { Conversation, Message } from "@/types";
import { formatFull } from "@/utils/format";

export type ExportFormat = "txt" | "md" | "json";

export function buildExport(conversation: Conversation, messages: Message[], format: ExportFormat): { content: string; mime: string; ext: string } {
  const visible = messages.filter((m) => m.role !== "system" && m.content.trim().length > 0);
  if (format === "json") {
    return {
      mime: "application/json",
      ext: "json",
      content: JSON.stringify(
        {
          id: conversation.id,
          title: conversation.title,
          createdAt: conversation.createdAt,
          updatedAt: conversation.updatedAt,
          messages: visible.map((m) => ({ id: m.id, role: m.role, content: m.content, model: m.model, createdAt: m.createdAt })),
        },
        null,
        2,
      ),
    };
  }
  if (format === "md") {
    const body = visible
      .map((m) => `## ${m.role === "user" ? "You" : "Assistant"}\n\n_${formatFull(m.createdAt)}_\n\n${m.content}`)
      .join("\n\n---\n\n");
    return { mime: "text/markdown", ext: "md", content: `# ${conversation.title}\n\n${body}\n` };
  }
  const body = visible.map((m) => `[${formatFull(m.createdAt)}] ${m.role === "user" ? "You" : "Assistant"}:\n${m.content}`).join("\n\n");
  return { mime: "text/plain", ext: "txt", content: `${conversation.title}\n${"=".repeat(Math.min(conversation.title.length, 60))}\n\n${body}\n` };
}

export function downloadText(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function safeFilename(title: string): string {
  return title.replace(/[^\w\s-]+/g, "").trim().replace(/\s+/g, "-").slice(0, 60) || "conversation";
}
