const timeFmt = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
const dateTimeFmt = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const fullFmt = new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/** Short timestamp: time today, date+time otherwise. */
export function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return timeFmt.format(d);
  return d.getFullYear() === now.getFullYear() ? dateTimeFmt.format(d) : fullFmt.format(d);
}

export function formatFull(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : fullFmt.format(d);
}

/** Groups conversations by recency bucket for the sidebar. */
export function recencyBucket(iso: string): "Today" | "Yesterday" | "Previous 7 days" | "Previous 30 days" | "Older" {
  const d = new Date(iso);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const day = 86_400_000;
  const t = d.getTime();
  if (t >= startOfToday) return "Today";
  if (t >= startOfToday - day) return "Yesterday";
  if (t >= startOfToday - 7 * day) return "Previous 7 days";
  if (t >= startOfToday - 30 * day) return "Previous 30 days";
  return "Older";
}
