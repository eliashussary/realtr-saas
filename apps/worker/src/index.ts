import { logger, reportError } from "@realtr/core/log"
import { parseWorkerEnvironment } from "./env"
import { createWorkerRuntime } from "./runtime"

async function main(): Promise<void> {
  const runtime = createWorkerRuntime(parseWorkerEnvironment(process.env))
  let shuttingDown = false
  const shutdown = async (signal: NodeJS.Signals) => {
    if (shuttingDown) return
    shuttingDown = true
    logger.info("worker.shutdown", { signal })
    await runtime.stop()
  }
  process.once("SIGTERM", () => void shutdown("SIGTERM"))
  process.once("SIGINT", () => void shutdown("SIGINT"))
  await runtime.start()
}

main().catch((error: unknown) => {
  reportError(error, { component: "worker", phase: "startup" })
  process.exitCode = 1
})
