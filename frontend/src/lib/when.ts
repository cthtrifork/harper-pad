// The app is English only, whatever the browser's language is: 24-hour time and "29 Oct". The text is built by hand, without Intl or
// toLocale*String: they load the browser's locale data (over 100 ms on a phone the first time, and the result differs between engines).
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const two = (n: number) => String(n).padStart(2, "0");

// "09:12", in the device's time zone.
export const clock = (d: Date): string => `${two(d.getHours())}:${two(d.getMinutes())}`;

// A short, human date for the drafts list: "Today, 09:12", "Yesterday", the weekday for the last week, then "29 Oct"
// (with the year when it is not this year). `now` is a parameter so the function is easy to reason about.
export function whenLabel(ms: number, now = new Date()): string {
  const d = new Date(ms);
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate());
  const days = Math.round((day(now).getTime() - day(d).getTime()) / 86400000);
  if (days <= 0) return `Today, ${clock(d)}`;
  if (days === 1) return "Yesterday";
  if (days < 7) return DAYS[d.getDay()];
  const date = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return d.getFullYear() === now.getFullYear() ? date : `${date} ${d.getFullYear()}`;
}

// The timestamp of a version in the Keep or Overwrite dialog: always a short date and the time ("6 Nov, 22:36"), with the year when it is not
// this year, so two versions are never compared by the time alone.
export function whenStamp(ms: number, now = new Date()): string {
  const d = new Date(ms);
  const year = d.getFullYear() === now.getFullYear() ? "" : ` ${d.getFullYear()}`;
  return `${d.getDate()} ${MONTHS[d.getMonth()]}${year}, ${clock(d)}`;
}
