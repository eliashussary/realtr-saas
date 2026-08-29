import { describe, expect, it } from "vitest"
import {
  type GraceCandidate,
  type GraceSweepRepository,
  runGraceSweep,
  shouldLapse,
} from "./lifecycle"

const NOW = new Date("2026-08-29T00:00:00.000Z")
const PAST = new Date(NOW.getTime() - 1000)
const FUTURE = new Date(NOW.getTime() + 1000)

describe("shouldLapse", () => {
  it("lapses only a past_due subscription whose grace deadline has passed", () => {
    expect(shouldLapse("past_due", PAST, NOW)).toBe(true)
    expect(shouldLapse("past_due", NOW, NOW)).toBe(true) // deadline exactly now
    expect(shouldLapse("past_due", FUTURE, NOW)).toBe(false) // still within grace
    expect(shouldLapse("past_due", null, NOW)).toBe(false) // no deadline set
    expect(shouldLapse("active", PAST, NOW)).toBe(false) // not in grace
    expect(shouldLapse("lapsed", PAST, NOW)).toBe(false) // already lapsed
  })
})

class MemorySweep implements GraceSweepRepository {
  lapsed: string[] = []
  constructor(private candidates: GraceCandidate[]) {}
  async listGraceCandidates(): Promise<GraceCandidate[]> {
    return this.candidates
  }
  async markLapsed(organizationId: string): Promise<void> {
    this.lapsed.push(organizationId)
  }
}

describe("runGraceSweep", () => {
  it("lapses expired-grace subscriptions and leaves the rest", async () => {
    const repo = new MemorySweep([
      { organizationId: "org-expired", status: "past_due", graceEndsAt: PAST },
      { organizationId: "org-within", status: "past_due", graceEndsAt: FUTURE },
    ])
    const result = await runGraceSweep(repo, NOW)
    expect(result.lapsed).toEqual(["org-expired"])
    expect(repo.lapsed).toEqual(["org-expired"])
  })

  it("no-ops when nothing is past its grace deadline", async () => {
    const repo = new MemorySweep([
      { organizationId: "org-within", status: "past_due", graceEndsAt: FUTURE },
    ])
    const result = await runGraceSweep(repo, NOW)
    expect(result.lapsed).toEqual([])
    expect(repo.lapsed).toEqual([])
  })
})
