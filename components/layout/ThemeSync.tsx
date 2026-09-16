"use client";
import { useEffect } from "react";
import { useTheme } from "next-themes";
import { useChat } from "@/components/chat/ChatProvider";

/** Keeps the saved appearance setting and next-themes in sync. */
export function ThemeSync() {
  const { settings, settingsLoaded } = useChat();
  const { setTheme, theme } = useTheme();
  useEffect(() => {
    if (settingsLoaded && theme !== settings.theme) setTheme(settings.theme);
  }, [settings.theme, settingsLoaded, setTheme, theme]);
  return null;
}
