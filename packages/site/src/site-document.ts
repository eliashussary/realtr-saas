import { z } from "zod"
import { templateRegistry } from "./registry"
import type { Pages } from "./types"

export const CURRENT_SITE_DOCUMENT_SCHEMA_VERSION = 1 as const
export const DEFAULT_SITE_DOCUMENT_MAX_BYTES = 512_000

const uuidSchema = z.string().uuid()
const stableIdSchema = z.string().trim().min(1).max(200)
const boundedText = (maximum: number) => z.string().trim().max(maximum)

const safeCssValueSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .refine((value) => !/[;{}]/.test(value) && !/url\s*\(/i.test(value), "Unsafe CSS value")

const radiusSchema = z
  .string()
  .trim()
  .regex(/^(?:0|(?:\d+(?:\.\d+)?|\.\d+)(?:px|rem|em))$/, "Invalid radius")

const safeUrlSchema = z
  .string()
  .trim()
  .max(2_048)
  .refine((value) => {
    if (value.startsWith("#")) return value.length > 1
    if (value.startsWith("/")) return !value.startsWith("//")
    return /^(?:https?:\/\/|mailto:|tel:)/i.test(value)
  }, "URL must be a safe relative, HTTPS, HTTP, mailto, tel, or fragment URL")

const httpUrlSchema = z
  .string()
  .trim()
  .url()
  .max(2_048)
  .refine((value) => /^https?:\/\//i.test(value), "URL must use HTTP or HTTPS")

const themeSchema = z
  .object({
    colors: z
      .object({
        brand: safeCssValueSchema.optional(),
        accent: safeCssValueSchema.optional(),
        background: safeCssValueSchema.optional(),
        foreground: safeCssValueSchema.optional(),
        muted: safeCssValueSchema.optional(),
      })
      .strict()
      .optional(),
    fonts: z
      .object({
        heading: safeCssValueSchema.optional(),
        body: safeCssValueSchema.optional(),
      })
      .strict()
      .optional(),
    radius: radiusSchema.optional(),
  })
  .strict()

const blockSchemas = {
  Hero: z.object({
    type: z.literal("Hero"),
    props: z
      .object({
        id: stableIdSchema,
        title: boundedText(200),
        subtitle: boundedText(1_000),
        ctaLabel: boundedText(100),
        ctaHref: safeUrlSchema,
      })
      .passthrough(),
  }),
  ListingGrid: z.object({
    type: z.literal("ListingGrid"),
    props: z
      .object({
        id: stableIdSchema,
        heading: boundedText(200),
        count: z.number().int().min(1).max(12),
      })
      .passthrough(),
  }),
  About: z.object({
    type: z.literal("About"),
    props: z
      .object({ id: stableIdSchema, heading: boundedText(200), body: boundedText(20_000) })
      .passthrough(),
  }),
  Contact: z.object({
    type: z.literal("Contact"),
    props: z
      .object({
        id: stableIdSchema,
        heading: boundedText(200),
        email: boundedText(320),
        phone: boundedText(100),
      })
      .passthrough(),
  }),
  RichText: z.object({
    type: z.literal("RichText"),
    props: z.object({ id: stableIdSchema, content: boundedText(50_000) }).passthrough(),
  }),
  Gallery: z.object({
    type: z.literal("Gallery"),
    props: z
      .object({
        id: stableIdSchema,
        images: z.array(z.object({ url: httpUrlSchema, alt: boundedText(500) }).strict()).max(100),
      })
      .passthrough(),
  }),
} as const

const blockSchema = z.discriminatedUnion("type", [
  blockSchemas.Hero,
  blockSchemas.ListingGrid,
  blockSchemas.About,
  blockSchemas.Contact,
  blockSchemas.RichText,
  blockSchemas.Gallery,
])

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }
function createJsonValueSchema(depth: number): z.ZodType<JsonValue> {
  const scalar = z.union([z.null(), z.boolean(), z.number().finite(), z.string()])
  if (depth === 0) return scalar
  const child = z.lazy(() => createJsonValueSchema(depth - 1))
  return z.union([
    z.null(),
    z.boolean(),
    z.number().finite(),
    z.string(),
    z.array(child).max(500),
    z.record(child),
  ])
}
const jsonValueSchema = createJsonValueSchema(10)

const puckDataSchema = z
  .object({
    content: z.array(blockSchema).max(500),
    root: z
      .object({ props: z.record(jsonValueSchema) })
      .passthrough()
      .optional(),
    zones: z.record(z.array(blockSchema)).optional(),
  })
  .passthrough()

type NavigationItemInput = {
  id: string
  label: string
  pageId?: string
  href?: string
  children: NavigationItemInput[]
}

function createNavigationItemSchema(depth: number): z.ZodType<NavigationItemInput> {
  return z
    .object({
      id: uuidSchema,
      label: boundedText(100).refine((value) => value.length > 0, "Label is required"),
      pageId: uuidSchema.optional(),
      href: safeUrlSchema.optional(),
      children:
        depth === 0
          ? z.array(z.never()).max(0, "Navigation nesting is too deep")
          : z.array(z.lazy(() => createNavigationItemSchema(depth - 1))).max(25),
    })
    .strict()
    .refine((item) => Number(item.pageId !== undefined) + Number(item.href !== undefined) === 1, {
      message: "Navigation item must reference exactly one page or URL",
    })
}
const navigationItemSchema = createNavigationItemSchema(5)

const pageSchema = z
  .object({
    id: uuidSchema,
    slug: z.string().max(500),
    title: boundedText(200).refine((value) => value.length > 0, "Title is required"),
    status: z.enum(["active", "hidden"]),
    seo: z
      .object({
        title: boundedText(200).optional(),
        description: boundedText(500).optional(),
        noIndex: z.boolean().optional(),
      })
      .strict(),
    puck: puckDataSchema,
  })
  .strict()

export const SiteDocumentSchema = z
  .object({
    schemaVersion: z.literal(CURRENT_SITE_DOCUMENT_SCHEMA_VERSION),
    template: z
      .object({ id: z.string().min(1).max(100), schemaVersion: z.number().int().positive() })
      .strict(),
    settings: z
      .object({
        siteTitle: boundedText(200).refine((value) => value.length > 0, "Site title is required"),
        logoAssetId: uuidSchema.optional(),
        contact: z
          .object({
            email: boundedText(320).email().optional(),
            phone: boundedText(100).optional(),
          })
          .strict(),
        socialLinks: z
          .array(
            z
              .object({
                id: uuidSchema,
                service: boundedText(50).refine((value) => value.length > 0, "Service is required"),
                url: httpUrlSchema,
              })
              .strict(),
          )
          .max(25),
      })
      .strict(),
    theme: themeSchema,
    navigation: z.array(navigationItemSchema).max(100),
    pages: z.array(pageSchema).min(1).max(100),
    redirects: z
      .array(
        z
          .object({
            id: uuidSchema,
            fromSlug: z.string().max(500),
            toSlug: z.string().max(500),
            permanent: z.boolean(),
          })
          .strict(),
      )
      .max(500),
  })
  .strict()
  .superRefine((document, context) => {
    const template = templateRegistry[document.template.id]
    if (!template || template.schemaVersion !== document.template.schemaVersion) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["template"],
        message: "Unknown or unsupported template version",
      })
    }

    const pageIds = new Set<string>()
    const slugs = new Set<string>()
    const blockIds = new Set<string>()

    for (const [pageIndex, page] of document.pages.entries()) {
      if (pageIds.has(page.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["pages", pageIndex, "id"],
          message: "Duplicate page ID",
        })
      }
      pageIds.add(page.id)

      try {
        const normalized = normalizePageSlug(page.slug)
        if (normalized !== page.slug) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["pages", pageIndex, "slug"],
            message: "Slug is not canonical",
          })
        }
      } catch (error) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["pages", pageIndex, "slug"],
          message: error instanceof Error ? error.message : "Invalid slug",
        })
      }

      if (slugs.has(page.slug)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["pages", pageIndex, "slug"],
          message: "Duplicate page slug",
        })
      }
      slugs.add(page.slug)

      const blocks = [...page.puck.content, ...Object.values(page.puck.zones ?? {}).flat()]
      for (const block of blocks) {
        if (blockIds.has(block.props.id)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["pages", pageIndex, "puck"],
            message: "Duplicate block ID",
          })
        }
        blockIds.add(block.props.id)
      }
    }

    const navigationIds = new Set<string>()
    const checkNavigation = (items: NavigationItemInput[], path: Array<string | number>) => {
      for (const [index, item] of items.entries()) {
        if (navigationIds.has(item.id)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: [...path, index, "id"],
            message: "Duplicate navigation ID",
          })
        }
        navigationIds.add(item.id)
        if (item.pageId && !pageIds.has(item.pageId)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: [...path, index, "pageId"],
            message: "Unknown page ID",
          })
        }
        checkNavigation(item.children, [...path, index, "children"])
      }
    }
    checkNavigation(document.navigation, ["navigation"])

    const redirectIds = new Set<string>()
    const redirectSources = new Set<string>()
    for (const [index, redirect] of document.redirects.entries()) {
      if (redirectIds.has(redirect.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["redirects", index, "id"],
          message: "Duplicate redirect ID",
        })
      }
      redirectIds.add(redirect.id)
      if (redirectSources.has(redirect.fromSlug)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["redirects", index, "fromSlug"],
          message: "Duplicate redirect source",
        })
      }
      redirectSources.add(redirect.fromSlug)
      if (slugs.has(redirect.fromSlug)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["redirects", index, "fromSlug"],
          message: "Redirect conflicts with a page",
        })
      }
      if (redirect.fromSlug === redirect.toSlug) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["redirects", index],
          message: "Redirect cannot target itself",
        })
      }
    }
  })

export type SiteDocumentV1 = z.infer<typeof SiteDocumentSchema>
export type SiteDocument = SiteDocumentV1

const RESERVED_SLUG_SEGMENTS = new Set(["api", "internal", "preview", "_assets"])

export function normalizePageSlug(input: string): string {
  let decoded: string
  try {
    decoded = decodeURIComponent(input.trim())
  } catch {
    throw new Error("Slug contains invalid percent encoding")
  }

  const normalized = decoded
    .replace(/^\/+|\/+$/g, "")
    .split("/")
    .filter(Boolean)
    .map((segment) => segment.normalize("NFKC").toLowerCase())
    .join("/")

  if (normalized.length > 200) throw new Error("Slug is too long")
  for (const segment of normalized.split("/")) {
    if (!segment) continue
    if (
      segment === "." ||
      segment === ".." ||
      segment.startsWith("_") ||
      RESERVED_SLUG_SEGMENTS.has(segment)
    ) {
      throw new Error("Slug uses a reserved path segment")
    }
    if (
      !/^[\p{Letter}\p{Number}](?:[\p{Letter}\p{Number}-]*[\p{Letter}\p{Number}])?$/u.test(segment)
    ) {
      throw new Error("Slug contains unsupported characters")
    }
  }
  return normalized
}

export function canonicalizeSiteDocument(document: SiteDocumentV1): SiteDocumentV1 {
  return {
    ...document,
    pages: document.pages.map((page) => ({ ...page, slug: normalizePageSlug(page.slug) })),
    redirects: document.redirects.map((redirect) => ({
      ...redirect,
      fromSlug: normalizePageSlug(redirect.fromSlug),
      toSlug: normalizePageSlug(redirect.toSlug),
    })),
  }
}

export function parseSiteDocument(
  input: unknown,
  options: { maxBytes?: number } = {},
): SiteDocumentV1 {
  assertDocumentSize(input, options.maxBytes ?? DEFAULT_SITE_DOCUMENT_MAX_BYTES)
  const shape = z
    .object({
      pages: z.array(z.object({ slug: z.string() }).passthrough()),
      redirects: z.array(z.object({ fromSlug: z.string(), toSlug: z.string() }).passthrough()),
    })
    .passthrough()
    .safeParse(input)
  const candidate = shape.success
    ? {
        ...shape.data,
        pages: shape.data.pages.map((page) => ({ ...page, slug: normalizePageSlug(page.slug) })),
        redirects: shape.data.redirects.map((redirect) => ({
          ...redirect,
          fromSlug: normalizePageSlug(redirect.fromSlug),
          toSlug: normalizePageSlug(redirect.toSlug),
        })),
      }
    : input
  const parsed = SiteDocumentSchema.parse(candidate)
  const canonical = canonicalizeSiteDocument(parsed)
  assertDocumentSize(canonical, options.maxBytes ?? DEFAULT_SITE_DOCUMENT_MAX_BYTES)
  return canonical
}

function assertDocumentSize(input: unknown, maxBytes: number): void {
  const serialized = JSON.stringify(input)
  if (serialized === undefined) throw new Error("Site document must be JSON serializable")
  const size = new TextEncoder().encode(serialized).byteLength
  if (size > maxBytes) throw new Error(`Site document exceeds the ${maxBytes} byte limit`)
}

export interface SiteDocumentMigration {
  fromVersion: number
  toVersion: number
  migrate: (document: unknown) => unknown
}

export interface SiteCompatibilityMigration {
  templateId: string
  fromVersion: number
  toVersion: number
  migrate: (document: unknown) => unknown
}

export function migrateSiteDocument(
  input: unknown,
  migrations: readonly SiteDocumentMigration[] = [],
  compatibilityMigrations: readonly SiteCompatibilityMigration[] = [],
): SiteDocumentV1 {
  let document = input
  let version = z
    .object({ schemaVersion: z.number().int().nonnegative() })
    .passthrough()
    .parse(document).schemaVersion

  while (version < CURRENT_SITE_DOCUMENT_SCHEMA_VERSION) {
    const migration = migrations.find((candidate) => candidate.fromVersion === version)
    if (!migration || migration.toVersion <= version) {
      throw new Error(`No site document migration registered from schema version ${version}`)
    }
    document = migration.migrate(document)
    version = migration.toVersion
  }

  if (version > CURRENT_SITE_DOCUMENT_SCHEMA_VERSION) {
    throw new Error(`Unsupported future site document schema version ${version}`)
  }

  const templateReference = z
    .object({
      template: z.object({ id: z.string().min(1), schemaVersion: z.number().int().nonnegative() }),
    })
    .passthrough()
    .parse(document).template
  const template = templateRegistry[templateReference.id]
  if (!template) throw new Error(`Unknown site template: ${templateReference.id}`)

  let templateVersion = templateReference.schemaVersion
  while (templateVersion < template.schemaVersion) {
    const migration = compatibilityMigrations.find(
      (candidate) =>
        candidate.templateId === templateReference.id && candidate.fromVersion === templateVersion,
    )
    if (!migration || migration.toVersion <= templateVersion) {
      throw new Error(
        `No ${templateReference.id} compatibility migration registered from version ${templateVersion}`,
      )
    }
    document = migration.migrate(document)
    templateVersion = migration.toVersion
  }

  if (templateVersion > template.schemaVersion) {
    throw new Error(
      `Unsupported future ${templateReference.id} template version ${templateVersion}`,
    )
  }
  return parseSiteDocument(document)
}

export interface LegacySiteDocument {
  templateId?: string | null
  theme?: unknown
  pages?: unknown
  siteTitle?: string | null
}

export function convertLegacySiteDocument(
  legacy: LegacySiteDocument,
  options: { generateId: () => string },
): SiteDocumentV1 {
  const template = templateRegistry[legacy.templateId ?? "modern"]
  if (!template) throw new Error(`Unknown legacy template: ${legacy.templateId}`)
  const pages = z.record(puckDataSchema).parse(legacy.pages ?? template.defaultPages) as Pages
  const theme = themeSchema.parse(legacy.theme ?? template.defaultTheme)

  const convertedPages = Object.entries(pages).map(([route, puck], index) => {
    const slug = normalizePageSlug(route)
    const rootTitle =
      puck.root?.props && typeof puck.root.props.title === "string"
        ? puck.root.props.title
        : undefined
    return {
      id: options.generateId(),
      slug,
      title: rootTitle?.trim() || (index === 0 ? legacy.siteTitle?.trim() || "Home" : slug),
      status: "active" as const,
      seo: {},
      puck,
    }
  })

  return parseSiteDocument({
    schemaVersion: CURRENT_SITE_DOCUMENT_SCHEMA_VERSION,
    template: { id: template.meta.id, schemaVersion: template.schemaVersion },
    settings: {
      siteTitle: legacy.siteTitle?.trim() || convertedPages[0]?.title || "Untitled site",
      contact: {},
      socialLinks: [],
    },
    theme,
    navigation: convertedPages.map((page) => ({
      id: options.generateId(),
      label: page.title,
      pageId: page.id,
      children: [],
    })),
    pages: convertedPages,
    redirects: [],
  })
}
