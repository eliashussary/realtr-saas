import type { ComponentConfig } from "@measured/puck"

export interface ListingGridProps {
  heading: string
  count: number
}

// Placeholder grid for now. When DDF (and other sources) ingest real listings, this block's
// render pulls from the tenant's `listing` records — the field contract stays the same.
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
  render: ({ heading, count }) => (
    <section id="listings" className="mx-auto max-w-6xl px-6 py-16">
      <h2 className="font-heading text-3xl font-semibold text-foreground">{heading}</h2>
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
    </section>
  ),
}
