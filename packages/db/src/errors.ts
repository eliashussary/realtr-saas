// Postgres error inspection that is resilient to drizzle-orm's error wrapping. Since drizzle 0.45,
// query execution errors are wrapped in a DrizzleQueryError with the original pg error under `.cause`.
// These helpers read the pg SQLSTATE `code`/`constraint` whether the error is wrapped or raw, so call
// sites don't depend on the driver's wrapping behaviour.

interface PgErrorFields {
  code?: string
  constraint?: string
}

/** Extract the pg SQLSTATE `code`/`constraint` from a thrown query error (wrapped or raw). */
export function pgError(error: unknown): PgErrorFields | null {
  if (typeof error !== "object" || error === null) return null
  const top = error as PgErrorFields & { cause?: unknown }
  if (top.code || top.constraint) return { code: top.code, constraint: top.constraint }
  if (typeof top.cause === "object" && top.cause !== null) {
    const cause = top.cause as PgErrorFields
    return { code: cause.code, constraint: cause.constraint }
  }
  return null
}

/** True if the error is a unique-constraint violation (SQLSTATE 23505). */
export function isUniqueViolation(error: unknown): boolean {
  return pgError(error)?.code === "23505"
}
