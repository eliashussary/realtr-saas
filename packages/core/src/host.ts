/** Strip a port from the currently supported hostname form and normalize casing/whitespace. */
export function normalizeHost(host: string): string {
  return (host.split(":")[0] ?? host).trim().toLowerCase()
}
