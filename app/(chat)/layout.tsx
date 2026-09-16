import { ChatProvider } from "@/components/chat/ChatProvider";
import { AppShell } from "@/components/layout/AppShell";
import { ErrorBoundary } from "@/components/layout/ErrorBoundary";

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary>
      <ChatProvider>
        <AppShell>{children}</AppShell>
      </ChatProvider>
    </ErrorBoundary>
  );
}
