import { type Server, createServer } from "node:http"
import { getSource, listConnectedListingSources, loadListingSourceConfig } from "@realtr/core"
import { db } from "@realtr/db"
import { createListingRepository } from "@realtr/db/listings"
import PgBoss from "pg-boss"
import type { WorkerEnvironment } from "./env"
import {
  LISTINGS_DISPATCH_QUEUE,
  LISTINGS_DISPATCH_RECONCILE_QUEUE,
  handleListingsDispatch,
} from "./listings-dispatch"
import { LISTINGS_SYNC_QUEUE, handleListingsSync } from "./listings-sync"

// DDF requires refresh at least every 24h; run frequent incremental deltas and a daily full
// master-list reconciliation. Times are UTC.
const INCREMENTAL_CRON = "15 * * * *"
const RECONCILE_CRON = "30 23 * * *"

export interface WorkerRuntime {
  start(): Promise<void>
  stop(): Promise<void>
}

function listen(server: Server, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once("error", reject)
    server.listen(port, () => {
      server.off("error", reject)
      resolve()
    })
  })
}

function close(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!server.listening) return resolve()
    server.close((error) => (error ? reject(error) : resolve()))
  })
}

export function createWorkerRuntime(environment: WorkerEnvironment): WorkerRuntime {
  const boss = new PgBoss(environment.databaseUrl)
  let ready = false
  let started = false
  const healthServer = createServer((request, response) => {
    if (request.url === "/live") {
      response.writeHead(200).end("ok")
      return
    }
    if (request.url === "/health") {
      response.writeHead(ready ? 200 : 503).end(ready ? "ready" : "not ready")
      return
    }
    response.writeHead(404).end()
  })
  boss.on("error", (error) => console.error("[worker] pg-boss error", error.message))

  const log = (message: string) => console.log(message)
  const repository = createListingRepository(db)

  return {
    async start() {
      if (started) return
      await boss.start()
      await boss.createQueue(LISTINGS_SYNC_QUEUE, {
        name: LISTINGS_SYNC_QUEUE,
        retryLimit: 5,
        retryDelay: 60,
        retryBackoff: true,
      })
      await boss.createQueue(LISTINGS_DISPATCH_QUEUE, { name: LISTINGS_DISPATCH_QUEUE })
      await boss.createQueue(LISTINGS_DISPATCH_RECONCILE_QUEUE, {
        name: LISTINGS_DISPATCH_RECONCILE_QUEUE,
      })

      await boss.work<unknown>(LISTINGS_SYNC_QUEUE, async (jobs) => {
        for (const job of jobs) {
          await handleListingsSync(job.data, {
            getSource,
            loadConfig: loadListingSourceConfig,
            repository,
            log,
          })
        }
      })

      // Fan out to one sync job per connected tenant. singletonKey keeps at most one queued sync per
      // (org, provider) so incremental and reconcile never pile up or run concurrently per credential.
      const dispatchDependencies = {
        listConnected: listConnectedListingSources,
        enqueue: async (job: {
          organizationId: string
          provider: string
          mode: "incremental" | "reconcile"
        }) => {
          await boss.send(
            LISTINGS_SYNC_QUEUE,
            { version: 1, ...job },
            { singletonKey: `${job.organizationId}:${job.provider}` },
          )
        },
        log,
      }
      const dispatch = async (jobs: Array<{ data: unknown }>) => {
        for (const job of jobs) await handleListingsDispatch(job.data, dispatchDependencies)
      }
      await boss.work<unknown>(LISTINGS_DISPATCH_QUEUE, dispatch)
      await boss.work<unknown>(LISTINGS_DISPATCH_RECONCILE_QUEUE, dispatch)

      await boss.schedule(LISTINGS_DISPATCH_QUEUE, INCREMENTAL_CRON, {
        version: 1,
        mode: "incremental",
      })
      await boss.schedule(LISTINGS_DISPATCH_RECONCILE_QUEUE, RECONCILE_CRON, {
        version: 1,
        mode: "reconcile",
      })

      await listen(healthServer, environment.healthPort)
      started = true
      ready = true
      console.log(`[worker] ready; health on :${environment.healthPort}`)
    },
    async stop() {
      if (!started) return
      ready = false
      await close(healthServer)
      await boss.stop({ graceful: true, wait: true, timeout: 30_000 })
      started = false
    },
  }
}
