import { z } from "zod"

const domainInputSchema = z.object({
  siteId: z.string().uuid(),
  hostname: z
    .string()
    .trim()
    .toLowerCase()
    .max(253)
    .refine((value) => {
      if (
        value.includes(":") ||
        value.includes("/") ||
        value.includes("*") ||
        value === "localhost"
      ) {
        return false
      }
      const labels = value.split(".")
      return (
        labels.length >= 2 &&
        labels.every(
          (label) =>
            label.length > 0 &&
            label.length <= 63 &&
            /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label),
        ) &&
        !/^\d+$/.test(labels.at(-1) ?? "")
      )
    }, "Enter a valid domain, e.g. www.yourbrand.com"),
})

export function parseDomainInput(data: unknown): z.infer<typeof domainInputSchema> {
  return domainInputSchema.parse(data)
}

export function assertDomainCanBeRegistered(
  hostname: string,
  rendererBaseHost: string,
  production: boolean,
): void {
  const platformHost = rendererBaseHost.trim().toLowerCase().split(":")[0] ?? rendererBaseHost
  const localDevelopmentHost = !production && hostname.endsWith(".localhost")
  if (
    (!localDevelopmentHost && hostname.endsWith(".localhost")) ||
    hostname === platformHost ||
    hostname.endsWith(`.${platformHost}`)
  ) {
    throw new Error("Domain unavailable")
  }
}
