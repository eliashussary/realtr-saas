// Structured logging + error reporting (M7-A3). Dependency-free (exported as @realtr/core/log so it
// pulls in no db/Stripe), usable from the worker, app, and renderer. Emits one JSON object per event
// in production (ingestible by any log pipeline) and a compact human line in development. Correlation
// ids thread a single workflow (a job run, a webhook) across its log lines so an operator can follow
// one publish / sync / delivery / billing transition end to end.

export type LogLevel = "debug" | "info" | "warn" | "error"

export type LogFields = Record<string, string | number | boolean | null | undefined>

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 }

function thresholdFromEnv(): number {
  const raw = (process.env.LOG_LEVEL ?? "").toLowerCase()
  if (raw in LEVEL_ORDER) return LEVEL_ORDER[raw as LogLevel]
  return LEVEL_ORDER.info
}

function isProduction(): boolean {
  return process.env.NODE_ENV === "production"
}

/** Compact single-line rendering for dev: `HH:MM:SS LEVEL message key=value`. */
function humanLine(level: LogLevel, message: string, fields: LogFields): string {
  const time = new Date().toISOString().slice(11, 19)
  const extras = Object.entries(fields)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}=${v}`)
    .join(" ")
  return `${time} ${level.toUpperCase().padEnd(5)} ${message}${extras ? ` ${extras}` : ""}`
}

function emit(level: LogLevel, message: string, fields: LogFields): void {
  if (LEVEL_ORDER[level] < thresholdFromEnv()) return
  if (isProduction()) {
    const record: Record<string, unknown> = { level, msg: message, time: new Date().toISOString() }
    for (const [k, v] of Object.entries(fields)) if (v !== undefined) record[k] = v
    const line = JSON.stringify(record)
    if (level === "error") console.error(line)
    else if (level === "warn") console.warn(line)
    else console.log(line)
    return
  }
  const line = humanLine(level, message, fields)
  if (level === "error") console.error(line)
  else if (level === "warn") console.warn(line)
  else console.log(line)
}

export interface Logger {
  debug(message: string, fields?: LogFields): void
  info(message: string, fields?: LogFields): void
  warn(message: string, fields?: LogFields): void
  error(message: string, fields?: LogFields): void
  /** Derive a child logger that merges `base` fields into every event (e.g. a correlation id). */
  child(base: LogFields): Logger
}

function makeLogger(base: LogFields): Logger {
  const merge = (fields?: LogFields): LogFields => (fields ? { ...base, ...fields } : base)
  return {
    debug: (m, f) => emit("debug", m, merge(f)),
    info: (m, f) => emit("info", m, merge(f)),
    warn: (m, f) => emit("warn", m, merge(f)),
    error: (m, f) => emit("error", m, merge(f)),
    child: (extra) => makeLogger({ ...base, ...extra }),
  }
}

/** The root logger. Prefer `logger.child({...})` to attach correlation/context for a workflow. */
export const logger: Logger = makeLogger({})

/** A short, URL-safe correlation id for threading one workflow's log lines. */
export function newCorrelationId(): string {
  return Math.random().toString(36).slice(2, 10)
}

/** Normalize any thrown value to a message + stack for logging. */
export function describeError(error: unknown): { message: string; stack?: string } {
  if (error instanceof Error) return { message: error.message, stack: error.stack }
  return { message: String(error) }
}

/**
 * The single error-reporting seam. Logs at error level with the stack and any context; this is the one
 * place a real error tracker (e.g. Sentry) would be wired in later, so call sites never depend on it.
 */
export function reportError(error: unknown, context: LogFields = {}): void {
  const { message, stack } = describeError(error)
  emit("error", message, { ...context, stack })
}
