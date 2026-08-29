import { db } from "@realtr/db"
import { createDomainRepository } from "@realtr/db/domains"
import { normalizeHost } from "../host"
import { approveForCertificate } from "./service"

/**
 * Host-level cert approval for the Caddy on-demand-TLS `ask` endpoint. Returns true if a cert may be
 * issued for `host` (a known verified/active tenant domain); a `verified` domain is promoted to
 * `active` as a side effect (the cert is now issued and the host served).
 */
export function approveDomainForCertificate(host: string): Promise<boolean> {
  return approveForCertificate(normalizeHost(host), createDomainRepository(db))
}
