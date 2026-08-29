import { describe, expect, it, vi } from "vitest"
import { handleBillingSweep } from "./billing-sweep"

describe("handleBillingSweep", () => {
  it("runs the sweep and reports the lapsed count", async () => {
    const sweep = vi.fn(async () => ({ lapsed: ["org-a", "org-b"] }))
    const log = vi.fn()
    await handleBillingSweep({ version: 1 }, { sweep, log })
    expect(sweep).toHaveBeenCalledTimes(1)
    expect(log).toHaveBeenCalledWith(expect.stringContaining("lapsed=2"))
  })

  it("rejects malformed payloads before sweeping", async () => {
    const sweep = vi.fn(async () => ({ lapsed: [] }))
    await expect(handleBillingSweep({ version: 2 }, { sweep, log: vi.fn() })).rejects.toThrow()
    expect(sweep).not.toHaveBeenCalled()
  })
})
