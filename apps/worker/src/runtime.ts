import { type Server, createServer } from "node:http"
import { getSource } from "@realtr/core"
import PgBoss from "pg-boss"
import type { WorkerEnvironment } from "./env"
import { LISTINGS_SYNC_QUEUE, handleListingsSync } from "./listings-sync"

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
      await boss.work<unknown>(LISTINGS_SYNC_QUEUE, async (jobs) => {
        for (const job of jobs) {
          await handleListingsSync(job.data, { getSource, log: (message) => console.log(message) })
        }
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
