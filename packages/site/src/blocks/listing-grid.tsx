import type { ComponentConfig } from "@measured/puck"

// Render-time listing data injected by the renderer (never a Puck field, never persisted). The
// editor and any context without listings falls back to skeleton placeholders.
export interface FeaturedListing {
  source: string
  href: string
  primaryPhoto: string | null
  price: string | null
  address: string | null
  cityProvince: string | null
  beds: number | null
  baths: number | null
  propertyType: string | null
}

// CREA's official hosted "Powered by REALTOR.ca" mark (same asset the renderer's ListingAttribution
// uses). Shown whenever DDF listings appear here — a display requirement (DDF Rules §6).
const POWERED_BY_REALTOR_SVG = "https://www.realtor.ca/images/en-ca/powered_by_realtor.svg"

function RealtorAttribution() {
  return (
    <div className="mt-8 border-t border-muted/20 pt-4 text-xs text-muted-foreground">
      <a href="https://www.realtor.ca/en" target="_blank" rel="noreferrer">
        <img width={125} src={POWERED_BY_REALTOR_SVG} alt="Powered by: REALTOR.ca" />
      </a>
      <p className="mt-2 max-w-3xl">
        The trademarks REALTOR®, REALTORS®, and the REALTOR® logo are controlled by The Canadian
        Real Estate Association (CREA). MLS®, Multiple Listing Service®, and the associated logos
        identify professional services rendered by REALTOR® members of CREA.
      </p>
    </div>
  )
}

export interface ListingGridProps {
  heading: string
  count: number
  listings?: FeaturedListing[]
}

function facts(l: FeaturedListing): string {
  return [
    l.beds !== null ? `${l.beds} bd` : null,
    l.baths !== null ? `${l.baths} ba` : null,
    l.propertyType,
  ]
    .filter(Boolean)
    .join(" · ")
}

// Renders real listings when the renderer injects them; otherwise a skeleton grid (editor preview,
// or a site with no listings yet). The Puck field contract (heading, count) is unchanged.
export const listingGrid: ComponentConfig<ListingGridProps> = {
  label: "Listing Grid",
  fields: {
    heading: { type: "text" },
    count: { type: "number", min: 1, max: 12 },
  },
  defaultProps: {
    heading: "Featured listings",
    count: 6,
  },
  render: ({ heading, count, listings }) => {
    const shown = listings?.slice(0, Math.max(0, count)) ?? null
    return (
      <section id="listings" className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="font-heading text-3xl font-semibold text-foreground">{heading}</h2>
        {shown && shown.length > 0 ? (
          <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="group overflow-hidden rounded-[var(--radius-base)] border border-muted/20 transition-shadow hover:shadow-md"
              >
                {l.primaryPhoto ? (
                  // Source URL, watermark preserved (DDF Rules §6a). Never re-hosted or transformed.
                  <img
                    src={l.primaryPhoto}
                    alt={l.address ?? "Property"}
                    className="aspect-[4/3] w-full object-cover"
                  />
                ) : (
                  <div className="aspect-[4/3] w-full bg-muted/15" />
                )}
                <div className="p-4">
                  {l.price ? (
                    <p className="font-heading text-lg font-semibold text-foreground">{l.price}</p>
                  ) : null}
                  {l.address ? <p className="mt-1 text-sm text-foreground">{l.address}</p> : null}
                  {l.cityProvince ? (
                    <p className="text-sm text-muted-foreground">{l.cityProvince}</p>
                  ) : null}
                  {facts(l) ? (
                    <p className="mt-2 text-xs text-muted-foreground">{facts(l)}</p>
                  ) : null}
                </div>
              </a>
            ))}
          </div>
        ) : null}
        {shown?.some((l) => l.source === "ddf") ? <RealtorAttribution /> : null}
        {shown && shown.length > 0 ? null : (
          <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: Math.max(0, count) }).map((_, i) => (
              <article
                // biome-ignore lint/suspicious/noArrayIndexKey: static placeholder cards
                key={i}
                className="overflow-hidden rounded-[var(--radius-base)] border border-muted/20"
              >
                <div className="aspect-[4/3] w-full bg-muted/15" />
                <div className="p-4">
                  <div className="h-4 w-2/3 rounded bg-muted/25" />
                  <div className="mt-2 h-3 w-1/3 rounded bg-muted/15" />
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    )
  },
}
