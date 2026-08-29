import { logger, reportError } from "./log"

// Email transport (M7). Production sends via Resend's REST API (no SDK dependency — just fetch);
// development logs the message so magic links and lead notifications are visible without a provider.
// One seam so magic links and lead notifications share transport + configuration.

export interface EmailMessage {
  to: string | string[]
  subject: string
  text: string
  /** Override the default From; must be a Resend-verified sender. */
  from?: string
}

interface ResendConfig {
  apiKey: string
  from: string
}

function resendConfig(): ResendConfig | null {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return null
  return { apiKey, from: process.env.RESEND_FROM ?? "Realtr <noreply@realtr.app>" }
}

/** Whether a real email transport is configured (production readiness check). */
export function emailConfigured(): boolean {
  return resendConfig() !== null
}

/**
 * Send an email. Throws on transport failure so callers (e.g. magic-link sign-in) can surface it.
 * When no provider is configured: in development the message is logged (so magic links work locally);
 * in production this is a misconfiguration — it is reported, not logged (never leak bodies to prod
 * logs), and returns without sending.
 */
export async function sendEmail(message: EmailMessage): Promise<void> {
  const to = Array.isArray(message.to) ? message.to : [message.to]
  const config = resendConfig()

  if (!config) {
    if (process.env.NODE_ENV === "production") {
      reportError(new Error("Email transport not configured (RESEND_API_KEY unset)"), {
        component: "email",
        subject: message.subject,
      })
      return
    }
    logger.info("email.dev", { to: to.join(", "), subject: message.subject, text: message.text })
    return
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: message.from ?? config.from,
      to,
      subject: message.subject,
      text: message.text,
    }),
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => "")
    throw new Error(`Resend send failed (${response.status}): ${detail.slice(0, 200)}`)
  }
  logger.info("email.sent", { to: to.join(", "), subject: message.subject })
}
