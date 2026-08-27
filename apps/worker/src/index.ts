import { parseWorkerEnvironment } from "./env"
import { createWorkerRuntime } from "./runtime"

async function main(): Promise<void> {
  const runtime = createWorkerRuntime(parseWorkerEnvironment(process.env))
  let shuttingDown = false
  const shutdown = async (signal: NodeJS.Signals) => {
    if (shuttingDown) return
    shuttingDown = true
    console.log(`[worker] received ${signal}; shutting down`)
    await runtime.stop()
  }
  process.once("SIGTERM", () => void shutdown("SIGTERM"))
  process.once("SIGINT", () => void shutdown("SIGINT"))
  await runtime.start()
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown worker startup error"
  console.error(`[worker] fatal: ${message}`)
  process.exitCode = 1
})
