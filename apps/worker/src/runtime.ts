import { type Server, createServer } from "node:http"
import {
  getSource,
  listConnectedListingSources,
  loadListingSourceConfig,
  nodeDnsResolver,
  runDomainVerification,
  runGraceSweep,
  runLeadDelivery,
} from "@realtr/core"
import { type Logger, logger, newCorrelationId, reportError } from "@realtr/core/log"
import { db } from "@realtr/db"
import { createGraceSweepRepository } from "@realtr/db/billing"
import { createDomainRepository, listDomainsAwaitingVerification } from "@realtr/db/domains"
import { createListingRepository } from "@realtr/db/listings"
import PgBoss from "pg-boss"
import { BILLING_SWEEP_QUEUE, handleBillingSweep } from "./billing-sweep"
import { DOMAINS_DISPATCH_QUEUE, handleDomainsDispatch } from "./domains-dispatch"
import { DOMAINS_VERIFY_QUEUE, handleDomainsVerify } from "./domains-verify"
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

// Lead notification + CRM delivery: sweep unprocessed leads every minute (store-before-deliver).
const LEAD_DELIVERY_QUEUE = "lead-delivery"
const LEAD_DELIVERY_CRON = "* * * * *"

// Re-verify pending/error custom domains so DNS that propagates later flips them to verified.
const DOMAINS_DISPATCH_CRON = "*/15 * * * *"
const rendererBaseHost = process.env.RENDERER_BASE_HOST ?? "sites.realtr.app"

// Lapse subscriptions whose payment-failure grace window has elapsed. Hourly is fine — grace is days.
const BILLING_SWEEP_CRON = "20 * * * *"

export interface WorkerRuntime {
  start(): Promise<void>
  stop(): Promise<void>
}

/**
 * Wrap a job run with a correlation id and structured start/finish/error logs, so one job's lines can
 * be followed end to end and every failure reaches the error-reporting seam. Rethrows so pg-boss
 * still applies its retry policy.
 */
async function withJob<T>(queue: string, run: (jobLog: Logger) => Promise<T>): Promise<T> {
  const correlationId = newCorrelationId()
  const jobLog = logger.child({ queue, correlationId })
  const startedAt = Date.now()
  jobLog.info("job.start")
  try {
    const result = await run(jobLog)
    jobLog.info("job.finish", { ms: Date.now() - startedAt })
    return result
  } catch (error) {
    reportError(error, { queue, correlationId, ms: Date.now() - startedAt })
    throw error
  }
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
  boss.on("error", (error) => reportError(error, { component: "pg-boss" }))

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
          await withJob(LISTINGS_SYNC_QUEUE, (jobLog) =>
            handleListingsSync(job.data, {
              getSource,
              loadConfig: loadListingSourceConfig,
              repository,
              log: (m) => jobLog.info(m),
            }),
          )
        }
      })

      // Fan out to one sync job per connected tenant. singletonKey keeps at most one queued sync per
      // (org, provider) so incremental and reconcile never pile up or run concurrently per credential.
      const dispatchDeps = (jobLog: Logger) => ({
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
        log: (m: string) => jobLog.info(m),
      })
      const dispatch = (queue: string) => async (jobs: Array<{ data: unknown }>) => {
        for (const job of jobs) {
          await withJob(queue, (jobLog) => handleListingsDispatch(job.data, dispatchDeps(jobLog)))
        }
      }
      await boss.work<unknown>(LISTINGS_DISPATCH_QUEUE, dispatch(LISTINGS_DISPATCH_QUEUE))
      await boss.work<unknown>(
        LISTINGS_DISPATCH_RECONCILE_QUEUE,
        dispatch(LISTINGS_DISPATCH_RECONCILE_QUEUE),
      )

      await boss.schedule(LISTINGS_DISPATCH_QUEUE, INCREMENTAL_CRON, {
        version: 1,
        mode: "incremental",
      })
      await boss.schedule(LISTINGS_DISPATCH_RECONCILE_QUEUE, RECONCILE_CRON, {
        version: 1,
        mode: "reconcile",
      })

      // Lead delivery: one idempotent sweep per minute (notify realtor + deliver to CRM).
      await boss.createQueue(LEAD_DELIVERY_QUEUE, {
        name: LEAD_DELIVERY_QUEUE,
        retryLimit: 3,
        retryDelay: 30,
      })
      await boss.work<unknown>(LEAD_DELIVERY_QUEUE, async () => {
        await withJob(LEAD_DELIVERY_QUEUE, (jobLog) =>
          runLeadDelivery({ log: (m) => jobLog.info(m) }),
        )
      })
      await boss.schedule(LEAD_DELIVERY_QUEUE, LEAD_DELIVERY_CRON, { version: 1 })

      // Domain re-verification: a scheduled dispatcher enqueues one verify job per domain still
      // trying to reach `verified`. singletonKey per domain avoids piling up duplicate checks.
      const domainRepository = createDomainRepository(db)
      await boss.createQueue(DOMAINS_VERIFY_QUEUE, {
        name: DOMAINS_VERIFY_QUEUE,
        retryLimit: 3,
        retryDelay: 30,
      })
      await boss.createQueue(DOMAINS_DISPATCH_QUEUE, { name: DOMAINS_DISPATCH_QUEUE })
      await boss.work<unknown>(DOMAINS_VERIFY_QUEUE, async (jobs) => {
        for (const job of jobs) {
          await withJob(DOMAINS_VERIFY_QUEUE, (jobLog) =>
            handleDomainsVerify(job.data, {
              verify: (domainId) =>
                runDomainVerification({
                  domainId,
                  expectedCnameTarget: rendererBaseHost,
                  resolver: nodeDnsResolver,
                  repository: domainRepository,
                }),
              log: (m) => jobLog.info(m),
            }),
          )
        }
      })
      await boss.work<unknown>(DOMAINS_DISPATCH_QUEUE, async (jobs) => {
        for (const job of jobs) {
          await withJob(DOMAINS_DISPATCH_QUEUE, (jobLog) =>
            handleDomainsDispatch(job.data, {
              listAwaiting: () => listDomainsAwaitingVerification(db),
              enqueue: async (domainId) => {
                await boss.send(
                  DOMAINS_VERIFY_QUEUE,
                  { version: 1, domainId },
                  { singletonKey: domainId },
                )
              },
              log: (m) => jobLog.info(m),
            }),
          )
        }
      })
      await boss.schedule(DOMAINS_DISPATCH_QUEUE, DOMAINS_DISPATCH_CRON, { version: 1 })

      // Billing grace→lapse sweep: one idempotent pass per hour. singletonKey collapses overlap.
      const graceSweepRepository = createGraceSweepRepository(db)
      await boss.createQueue(BILLING_SWEEP_QUEUE, { name: BILLING_SWEEP_QUEUE })
      await boss.work<unknown>(BILLING_SWEEP_QUEUE, async (jobs) => {
        for (const job of jobs) {
          await withJob(BILLING_SWEEP_QUEUE, (jobLog) =>
            handleBillingSweep(job.data, {
              sweep: () => runGraceSweep(graceSweepRepository),
              log: (m) => jobLog.info(m),
            }),
          )
        }
      })
      await boss.schedule(BILLING_SWEEP_QUEUE, BILLING_SWEEP_CRON, { version: 1 })

      await listen(healthServer, environment.healthPort)
      started = true
      ready = true
      logger.info("worker.ready", { healthPort: environment.healthPort })
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
