// Email transport seam. Dev logs to the console (same as the magic-link sender); production wires a
// real provider (Resend) here. One place so lead notifications and, later, magic links share it.

export interface EmailMessage {
  to: string | string[]
  subject: string
  text: string
}

export async function sendEmail(message: EmailMessage): Promise<void> {
  const to = Array.isArray(message.to) ? message.to.join(", ") : message.to
  // ponytail: prod transport (Resend) not wired yet — log everywhere until it is. Swap this branch
  // for the Resend client (RESEND_API_KEY) when production email lands (shared with M1 magic links).
  console.log(`\n📧 Email → ${to}\n   ${message.subject}\n   ${message.text}\n`)
}
