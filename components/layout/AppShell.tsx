"use client";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { PanelLeft } from "lucide-react";
import { Sidebar } from "@/components/sidebar/Sidebar";
import { SettingsDialog } from "@/components/settings/SettingsDialog";
import { ThemeSync } from "@/components/layout/ThemeSync";
import { IconButton } from "@/components/ui/IconButton";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useChat } from "@/components/chat/ChatProvider";
import { cn } from "@/utils/cn";

const SIDEBAR_KEY = "lumen:sidebar-open";

export function AppShell({ children }: { children: ReactNode }) {
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const [desktopOpen, setDesktopOpen] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { activeId, activeConversation } = useChat();

  // Small UI preference lives in localStorage (not application data).
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(SIDEBAR_KEY);
      if (saved === "0") setDesktopOpen(false);
    } catch { /* private mode */ }
  }, []);
  const toggleDesktop = useCallback(() => {
    setDesktopOpen((o) => {
      try { window.localStorage.setItem(SIDEBAR_KEY, o ? "0" : "1"); } catch { /* ignore */ }
      return !o;
    });
  }, []);

  // Close the drawer when navigating on mobile.
  useEffect(() => { setDrawerOpen(false); }, [activeId]);
  // Escape closes the drawer.
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setDrawerOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  const openSidebar = () => (isDesktop ? toggleDesktop() : setDrawerOpen(true));
  const sidebarVisible = isDesktop ? desktopOpen : drawerOpen;

  return (
    <div className="flex h-dvh overflow-hidden bg-canvas">
      <ThemeSync />

      {/* Mobile scrim */}
      {!isDesktop && drawerOpen && (
        <div className="fixed inset-0 z-30 bg-black/40 anim-fade-in lg:hidden" onClick={() => setDrawerOpen(false)} aria-hidden="true" />
      )}

      <aside
        id="sidebar"
        aria-label="Conversations"
        aria-hidden={!sidebarVisible}
        className={cn(
          "z-40 flex h-full w-72 shrink-0 flex-col border-r bg-surface transition-transform duration-200 ease-out",
          isDesktop ? "relative" : "fixed inset-y-0 left-0 shadow-xl",
          sidebarVisible ? "translate-x-0" : "-translate-x-full",
          isDesktop && !desktopOpen && "absolute",
        )}
        style={isDesktop && !desktopOpen ? { position: "absolute", visibility: "hidden" } : undefined}
      >
        <Sidebar onOpenSettings={() => setSettingsOpen(true)} onClose={() => (isDesktop ? toggleDesktop() : setDrawerOpen(false))} />
      </aside>

      <div className="relative flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-2 px-2 sm:px-3">
          {(!isDesktop || !desktopOpen) && (
            <IconButton label="Open sidebar" onClick={openSidebar} aria-controls="sidebar" aria-expanded={sidebarVisible}>
              <PanelLeft size={18} />
            </IconButton>
          )}
          <h1 className="min-w-0 flex-1 truncate text-sm font-medium text-muted">
            {activeConversation?.title ?? (activeId ? "" : "New chat")}
          </h1>
        </header>
        {children}
      </div>

      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
