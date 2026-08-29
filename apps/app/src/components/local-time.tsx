/**
 * Renders an ISO timestamp in the viewer's local time. The server and client render in different
 * locales/timezones, so this is an inherent SSR mismatch — suppressHydrationWarning lets the client
 * value win without a console error. Use for any user-facing timestamp.
 */
export function LocalTime({ iso }: { iso: string }) {
  return <span suppressHydrationWarning>{new Date(iso).toLocaleString()}</span>
}
