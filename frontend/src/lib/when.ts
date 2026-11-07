// The app is English only, whatever the browser's language is: 24-hour time and "29 Oct".
const LOCALE = "en-GB";

// A short, human date for the drafts list: "Today, 09:12", "Yesterday", the weekday for the last week, then "29 Oct"
// (with the year when it is not this year). `now` is a parameter so the function is easy to reason about.
export function whenLabel(ms: number, now = new Date()): string {
  const d = new Date(ms);
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate());
  const days = Math.round((day(now).getTime() - day(d).getTime()) / 86400000);
  const time = d.toLocaleTimeString(LOCALE, { hour: "2-digit", minute: "2-digit" });
  if (days <= 0) return `Today, ${time}`;
  if (days === 1) return "Yesterday";
  if (days < 7) return d.toLocaleDateString(LOCALE, { weekday: "short" });
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString(LOCALE, sameYear ? { day: "numeric", month: "short" } : { day: "numeric", month: "short", year: "numeric" });
}

// The timestamp of a version in the Keep or Overwrite dialog: always a short date and the time ("6 Nov, 22:36"), with the year when it is not
// this year, so two versions are never compared by the time alone.
const stampFormat = (year: "numeric" | undefined) =>
  new Intl.DateTimeFormat(LOCALE, { day: "numeric", month: "short", year, hour: "2-digit", minute: "2-digit" });
const withYear = stampFormat("numeric");
const withoutYear = stampFormat(undefined);
export function whenStamp(ms: number, now = new Date()): string {
  const d = new Date(ms);
  return (d.getFullYear() === now.getFullYear() ? withoutYear : withYear).format(d);
}
