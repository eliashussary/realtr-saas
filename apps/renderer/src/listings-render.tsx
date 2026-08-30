import {
  type ListingBounds,
  type ListingFacets,
  type ListingFilter,
  type ListingMarker,
  listingFilterToSearchParams,
} from "@realtr/core"
import { useState } from "react"
import { type ListingView, toListingView } from "./listing-view"
import { ListingsMap } from "./listings-map"

export interface ListingItem {
  source: string
  sourceListingId: string
  data: Record<string, unknown>
}

function listingHref(sourceListingId: string): string {
  return `/listings/${encodeURIComponent(sourceListingId)}`
}

// CREA's official, hosted "Powered by REALTOR.ca" logo (the same asset the production single-tenant
// app uses). Served from realtor.ca so it always reflects the current approved mark.
const POWERED_BY_REALTOR_SVG = "https://www.realtor.ca/images/en-ca/powered_by_realtor.svg"

/**
 * REALTOR.ca DDF attribution — a compliance requirement on every listing display (DDF Rules §6): the
 * official "Powered by REALTOR.ca" logo linked to REALTOR.ca, the listing brokerage, and the
 * MLS®/REALTOR® trademark statement.
 */
export function ListingAttribution({ brokerageName }: { brokerageName?: string | null }) {
  return (
    <div className="mt-6 border-t border-muted/20 pt-4 text-xs text-muted">
      {brokerageName ? (
        <p className="font-medium text-foreground">Listing courtesy of {brokerageName}</p>
      ) : null}
      <a
        href="https://www.realtor.ca/en"
        target="_blank"
        rel="noreferrer"
        className="mt-2 inline-block"
      >
        <img width={125} src={POWERED_BY_REALTOR_SVG} alt="Powered by: REALTOR.ca" />
      </a>
      <p className="mt-2">
        The trademarks REALTOR®, REALTORS®, and the REALTOR® logo are controlled by The Canadian
        Real Estate Association (CREA). MLS®, Multiple Listing Service®, and the associated logos
        identify professional services rendered by REALTOR® members of CREA.
      </p>
    </div>
  )
}

function Facts({ view }: { view: ListingView }) {
  const parts = [
    view.beds !== null ? `${view.beds} bd` : null,
    view.baths !== null ? `${view.baths} ba` : null,
    view.area,
    view.propertyType,
  ].filter((part): part is string => Boolean(part))
  if (parts.length === 0) return null
  return <p className="text-sm text-muted">{parts.join(" · ")}</p>
}

function ListingCard({ item }: { item: ListingItem }) {
  const view = toListingView(item.data)
  return (
    <a
      href={listingHref(item.sourceListingId)}
      className="flex flex-col overflow-hidden rounded-lg border border-muted/20 bg-background transition-shadow hover:shadow-md"
    >
      {view.primaryPhoto ? (
        // Source URL — watermarks are preserved (never transformed). DDF Rules §6(a).
        <img
          src={view.primaryPhoto}
          alt={view.addressLine ?? "Listing"}
          className="aspect-[4/3] w-full object-cover"
          loading="lazy"
        />
      ) : (
        <div className="flex aspect-[4/3] w-full items-center justify-center bg-muted/10 text-sm text-muted">
          No photo
        </div>
      )}
      <div className="flex flex-col gap-1 p-4">
        {view.price ? <p className="font-heading text-lg font-bold">{view.price}</p> : null}
        {view.addressLine ? <p className="text-sm font-medium">{view.addressLine}</p> : null}
        {view.cityProvince ? <p className="text-sm text-muted">{view.cityProvince}</p> : null}
        <Facts view={view} />
      </div>
    </a>
  )
}

// Build a /listings href for a given filter + offset — used for pagination and "clear". Keeps the URL
// the single source of truth so links, the FilterBar, and deep links all round-trip identically.
function listingsHref(filter: ListingFilter, offset: number): string {
  const params = listingFilterToSearchParams(filter)
  if (offset > 0) params.set("offset", String(offset))
  const qs = params.toString()
  return qs ? `/listings?${qs}` : "/listings"
}

const CONTROL = "rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"

// A native GET form: submitting sets the querystring the loader parses. Works with no JS (the Apply
// button); when hydrated, each control auto-submits on change for an instant-filter feel. Beds/baths
// are "at least"; property type + city are drawn from the tenant's actual inventory (facets).
function FilterBar({ filter, facets }: { filter: ListingFilter; facets: ListingFacets }) {
  const submitOnChange = (event: { currentTarget: { form: HTMLFormElement | null } }) =>
    event.currentTarget.form?.requestSubmit()
  const minMax = [1, 2, 3, 4, 5]
  return (
    <form method="GET" action="/listings" className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-1 text-xs text-muted">
        Min price
        <input
          type="number"
          name="minPrice"
          min={0}
          step={25000}
          defaultValue={filter.minPrice ?? ""}
          placeholder="$ Min"
          onChange={submitOnChange}
          className={`${CONTROL} w-28`}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Max price
        <input
          type="number"
          name="maxPrice"
          min={0}
          step={25000}
          defaultValue={filter.maxPrice ?? ""}
          placeholder="$ Max"
          onChange={submitOnChange}
          className={`${CONTROL} w-28`}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Beds
        <select
          name="minBeds"
          defaultValue={filter.minBeds ?? ""}
          onChange={submitOnChange}
          className={CONTROL}
        >
          <option value="">Any</option>
          {minMax.map((n) => (
            <option key={n} value={n}>
              {n}+
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Baths
        <select
          name="minBaths"
          defaultValue={filter.minBaths ?? ""}
          onChange={submitOnChange}
          className={CONTROL}
        >
          <option value="">Any</option>
          {minMax.map((n) => (
            <option key={n} value={n}>
              {n}+
            </option>
          ))}
        </select>
      </label>
      {facets.propertyTypes.length > 0 ? (
        <label className="flex flex-col gap-1 text-xs text-muted">
          Type
          <select
            name="propertyType"
            defaultValue={filter.propertyType?.[0] ?? ""}
            onChange={submitOnChange}
            className={CONTROL}
          >
            <option value="">Any type</option>
            {facets.propertyTypes.map((f) => (
              <option key={f.value} value={f.value}>
                {f.value} ({f.count})
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {facets.cities.length > 0 ? (
        <label className="flex flex-col gap-1 text-xs text-muted">
          City
          <select
            name="city"
            defaultValue={filter.city?.[0] ?? ""}
            onChange={submitOnChange}
            className={CONTROL}
          >
            <option value="">Any city</option>
            {facets.cities.map((f) => (
              <option key={f.value} value={f.value}>
                {f.value} ({f.count})
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label className="flex flex-col gap-1 text-xs text-muted">
        Sort
        <select
          name="sort"
          defaultValue={filter.sort ?? "newest"}
          onChange={submitOnChange}
          className={CONTROL}
        >
          <option value="newest">Newest</option>
          <option value="price_asc">Price ↑</option>
          <option value="price_desc">Price ↓</option>
        </select>
      </label>
      <button
        type="submit"
        className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white"
      >
        Apply
      </button>
      <a href="/listings" className="px-2 py-2 text-sm text-muted hover:text-foreground">
        Clear
      </a>
    </form>
  )
}

function Pagination({
  filter,
  offset,
  pageSize,
  total,
}: { filter: ListingFilter; offset: number; pageSize: number; total: number }) {
  const from = total === 0 ? 0 : offset + 1
  const to = Math.min(offset + pageSize, total)
  const hasPrev = offset > 0
  const hasNext = offset + pageSize < total
  if (!hasPrev && !hasNext) return null
  return (
    <nav className="mt-8 flex items-center justify-between text-sm">
      {hasPrev ? (
        <a
          href={listingsHref(filter, Math.max(0, offset - pageSize))}
          className="rounded-md border border-border px-3 py-1.5 hover:bg-muted/10"
        >
          ← Previous
        </a>
      ) : (
        <span />
      )}
      <span className="text-muted">
        {from}–{to} of {total}
      </span>
      {hasNext ? (
        <a
          href={listingsHref(filter, offset + pageSize)}
          className="rounded-md border border-border px-3 py-1.5 hover:bg-muted/10"
        >
          Next →
        </a>
      ) : (
        <span />
      )}
    </nav>
  )
}

export interface ListingsSearchProps {
  items: ListingItem[]
  filter: ListingFilter
  facets: ListingFacets
  total: number
  offset: number
  pageSize: number
  markers: ListingMarker[]
  bounds: ListingBounds | null
  mapStyleUrl: string
}

/**
 * The public faceted listings page: FilterBar + result count, then a results column beside a map.
 * Desktop shows both (map sticky); mobile toggles between List and Map. Without JS the list shows and
 * the toggle is inert — the map is a progressive enhancement, the URL-driven list is the baseline.
 */
export function ListingsSearch({
  items,
  filter,
  facets,
  total,
  offset,
  pageSize,
  markers,
  bounds,
  mapStyleUrl,
}: ListingsSearchProps) {
  const [view, setView] = useState<"list" | "map">("list")
  return (
    <section className="px-6 py-8">
      <div className="flex flex-col gap-4">
        <h1 className="font-heading text-2xl font-bold">
          {total} {total === 1 ? "listing" : "listings"}
        </h1>
        <FilterBar filter={filter} facets={facets} />
      </div>

      {/* Mobile view switch — desktop shows both panes so it is hidden there. */}
      <div className="mt-4 flex gap-2 lg:hidden">
        <ViewToggle active={view === "list"} onClick={() => setView("list")}>
          List
        </ViewToggle>
        <ViewToggle active={view === "map"} onClick={() => setView("map")}>
          Map
        </ViewToggle>
      </div>

      <div className="mt-6 lg:grid lg:grid-cols-[1fr_minmax(0,460px)] lg:gap-6">
        <div className={view === "map" ? "hidden lg:block" : "block"}>
          {items.length === 0 ? (
            <p className="text-muted">
              No listings match your filters. Try widening your search or{" "}
              <a href="/listings" className="text-brand hover:underline">
                clearing them
              </a>
              .
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
              {items.map((item) => (
                <ListingCard key={item.sourceListingId} item={item} />
              ))}
            </div>
          )}
          <Pagination filter={filter} offset={offset} pageSize={pageSize} total={total} />
          {items.some((item) => item.source === "ddf") ? <ListingAttribution /> : null}
        </div>

        <div
          className={`${
            view === "list" ? "hidden lg:block" : "block"
          } h-[70vh] lg:sticky lg:top-4 lg:h-[calc(100vh-8rem)]`}
        >
          <ListingsMap markers={markers} bounds={bounds} styleUrl={mapStyleUrl} />
        </div>
      </div>
    </section>
  )
}

function ViewToggle({
  active,
  onClick,
  children,
}: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border px-4 py-1.5 text-sm ${
        active ? "border-brand bg-brand text-white" : "border-border text-foreground"
      }`}
    >
      {children}
    </button>
  )
}

export function ListingDetail({ item }: { item: ListingItem }) {
  const view = toListingView(item.data)
  return (
    <article className="mx-auto max-w-3xl px-6 py-8">
      <a href="/listings" className="text-sm text-brand hover:underline">
        ← All listings
      </a>
      {view.primaryPhoto ? (
        <img
          src={view.primaryPhoto}
          alt={view.addressLine ?? "Listing"}
          className="mt-4 aspect-[16/9] w-full rounded-lg object-cover"
        />
      ) : null}
      <div className="mt-4 flex flex-col gap-1">
        {view.price ? <p className="font-heading text-3xl font-bold">{view.price}</p> : null}
        {view.addressLine ? <p className="text-lg font-medium">{view.addressLine}</p> : null}
        {view.cityProvince ? <p className="text-muted">{view.cityProvince}</p> : null}
        <Facts view={view} />
      </div>
      {view.remarks ? <p className="mt-4 whitespace-pre-line text-sm">{view.remarks}</p> : null}
      {view.photos.length > 1 ? (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {view.photos.slice(1).map((url) => (
            <img
              key={url}
              src={url}
              alt={view.addressLine ?? "Listing photo"}
              className="aspect-[4/3] w-full rounded-md object-cover"
              loading="lazy"
            />
          ))}
        </div>
      ) : null}
      <InquiryForm sourceListingId={item.sourceListingId} address={view.addressLine} />
      {/* Attribution only for DDF listings; exclusive listings are the realtor's own inventory. */}
      {item.source === "ddf" ? <ListingAttribution brokerageName={view.brokerageName} /> : null}
    </article>
  )
}

const INPUT =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted"

// Same no-JS pattern as the Contact block: native POST → store → redirect back with ?contacted; the
// script only reveals the banner. Source is listing_inquiry and the listing ref auto-links + routes.
const INQUIRY_SCRIPT = `(function(){try{var p=new URLSearchParams(location.search).get('contacted');if(!p)return;var ok=document.getElementById('inq-ok');var err=document.getElementById('inq-err');var f=document.getElementById('inq-form');if(p==='1'){if(ok)ok.hidden=false;if(f)f.hidden=true;}else if(p==='invalid'||p==='error'){if(err){err.hidden=false;err.textContent=p==='invalid'?'Please enter a valid email or phone number.':'Something went wrong. Please try again.';}}}catch(e){}})();`

function InquiryForm({
  sourceListingId,
  address,
}: { sourceListingId: string; address: string | null }) {
  return (
    <section className="mt-10 rounded-lg border border-border bg-muted/5 p-6">
      <h2 className="font-heading text-xl font-semibold">Request information</h2>
      <p className="mt-1 text-sm text-muted">Ask about this property and we'll be in touch.</p>
      <p id="inq-ok" hidden className="mt-4 rounded-md bg-brand/10 px-4 py-3 text-sm">
        Thanks — your inquiry is on its way. We'll be in touch shortly.
      </p>
      <p
        id="inq-err"
        hidden
        className="mt-4 rounded-md bg-red-500/10 px-4 py-3 text-sm text-red-600"
      />
      <form id="inq-form" method="POST" action="/api/lead" className="mt-4 flex flex-col gap-3">
        <input type="hidden" name="source" value="listing_inquiry" />
        <input type="hidden" name="listingRef" value={sourceListingId} />
        <input
          type="text"
          name="company"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          className="hidden"
        />
        <input name="name" placeholder="Your name" autoComplete="name" className={INPUT} />
        <input
          name="email"
          type="email"
          placeholder="Email"
          autoComplete="email"
          className={INPUT}
        />
        <input name="phone" type="tel" placeholder="Phone" autoComplete="tel" className={INPUT} />
        <textarea
          name="message"
          rows={3}
          defaultValue={address ? `I'm interested in ${address}.` : ""}
          className={INPUT}
        />
        <label className="flex items-start gap-2 text-xs text-muted">
          <input type="checkbox" name="consent" value="on" className="mt-0.5" />
          <span>I agree to be contacted about this inquiry.</span>
        </label>
        <button
          type="submit"
          className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white"
        >
          Send inquiry
        </button>
      </form>
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: static, no interpolation */}
      <script dangerouslySetInnerHTML={{ __html: INQUIRY_SCRIPT }} />
    </section>
  )
}
