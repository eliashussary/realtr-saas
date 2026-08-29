import { describe, expect, it, vi } from "vitest"
import { handleDomainsDispatch } from "./domains-dispatch"

describe("domains.dispatch", () => {
  it("enqueues one verify job per awaiting domain and reports the count", async () => {
    const enqueue = vi.fn(async () => {})
    const log = vi.fn()
    await handleDomainsDispatch(
      { version: 1 },
      { listAwaiting: async () => [{ id: "d1" }, { id: "d2" }], enqueue, log },
    )
    expect(enqueue).toHaveBeenCalledTimes(2)
    expect(enqueue).toHaveBeenCalledWith("d1")
    expect(enqueue).toHaveBeenCalledWith("d2")
    expect(log).toHaveBeenCalledWith(expect.stringContaining("dispatched=2"))
  })

  it("does nothing when no domains are awaiting", async () => {
    const enqueue = vi.fn(async () => {})
    await handleDomainsDispatch(
      { version: 1 },
      { listAwaiting: async () => [], enqueue, log: vi.fn() },
    )
    expect(enqueue).not.toHaveBeenCalled()
  })

  it("rejects malformed payloads", async () => {
    await expect(
      handleDomainsDispatch(
        { version: 2 },
        { listAwaiting: async () => [], enqueue: async () => {}, log: vi.fn() },
      ),
    ).rejects.toThrow()
  })
})
