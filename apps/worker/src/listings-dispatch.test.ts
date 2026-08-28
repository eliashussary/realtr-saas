import { describe, expect, it, vi } from "vitest"
import { handleListingsDispatch } from "./listings-dispatch"

describe("listings.dispatch", () => {
  it("enqueues one sync job per connected source with the requested mode", async () => {
    const enqueue = vi.fn(async () => {})
    await handleListingsDispatch(
      { version: 1, mode: "reconcile" },
      {
        listConnected: async () => [
          { organizationId: "org-a", provider: "ddf" },
          { organizationId: "org-b", provider: "ddf" },
        ],
        enqueue,
        log: vi.fn(),
      },
    )

    expect(enqueue).toHaveBeenCalledTimes(2)
    expect(enqueue).toHaveBeenCalledWith({
      organizationId: "org-a",
      provider: "ddf",
      mode: "reconcile",
    })
    expect(enqueue).toHaveBeenCalledWith({
      organizationId: "org-b",
      provider: "ddf",
      mode: "reconcile",
    })
  })

  it("defaults to incremental mode and reports the dispatched count", async () => {
    const log = vi.fn()
    const enqueue = vi.fn(async () => {})
    await handleListingsDispatch(
      { version: 1 },
      { listConnected: async () => [{ organizationId: "org-a", provider: "ddf" }], enqueue, log },
    )

    expect(enqueue).toHaveBeenCalledWith({
      organizationId: "org-a",
      provider: "ddf",
      mode: "incremental",
    })
    expect(log).toHaveBeenCalledWith(expect.stringContaining("dispatched=1"))
  })

  it("rejects malformed payloads", async () => {
    await expect(
      handleListingsDispatch(
        { version: 2 },
        { listConnected: async () => [], enqueue: async () => {}, log: vi.fn() },
      ),
    ).rejects.toThrow()
  })
})
