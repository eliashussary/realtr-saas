import { promises as dns } from "node:dns"
import type { DnsResolver } from "./verify"

// Real DNS resolver adapter over node:dns for the verification service. Thin I/O wrapper — the
// verification logic and its tests live in verify.ts against the injectable DnsResolver port.
export const nodeDnsResolver: DnsResolver = {
  async resolveCname(hostname: string): Promise<string[]> {
    try {
      return await dns.resolveCname(hostname)
    } catch {
      return []
    }
  },
  async resolveTxt(hostname: string): Promise<string[]> {
    try {
      // node returns TXT as string[][] (a record can be split into chunks); join each record.
      const records = await dns.resolveTxt(hostname)
      return records.map((chunks) => chunks.join(""))
    } catch {
      return []
    }
  },
}
