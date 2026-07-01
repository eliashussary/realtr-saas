import "./env"
import { createServer } from "node:http"
import { getSource } from "@realtr/core"
import PgBoss from "pg-boss"

const QUEUE = "listings.sync"
const HEALTH_PORT = 3003

interface ListingsSyncJob {
  organizationId: string
  provider: string
}

async function main() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error("DATABASE_URL is not set")

  const boss = new PgBoss(connectionString)
  boss.on("error", (err) => console.error("[worker] pg-boss error", err))
  await boss.start()
  await boss.createQueue(QUEUE)

  // Dispatch each listings.sync job to the org's connected source provider.
  await boss.work<ListingsSyncJob>(QUEUE, async (jobs) => {
    for (const job of jobs) {
      const { organizationId, provider } = job.data
      const source = getSource(provider)
      if (!source) {
        console.warn(`[worker] no listing source registered for provider "${provider}"`)
        continue
      }
      // config would be decrypted from integration.config; empty for the stub.
      const listings = await source.pull({ config: {}, organizationId })
      console.log(
        `[worker] ${QUEUE} org=${organizationId} provider=${provider} pulled=${listings.length}`,
      )
    }
  })

  createServer((req, res) => {
    if (req.url === "/health") {
      res.writeHead(200, { "content-type": "text/plain" })
      res.end("ok")
    } else {
      res.writeHead(404)
      res.end()
    }
  }).listen(HEALTH_PORT, () => console.log(`[worker] health on :${HEALTH_PORT}`))

  // Enqueue a demo job on boot so the pipeline is exercised end-to-end.
  await boss.send(QUEUE, { organizationId: "seed-org-demo", provider: "ddf" })
  console.log(`[worker] started; enqueued a demo ${QUEUE} job`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
