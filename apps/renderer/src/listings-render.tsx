import { type ListingView, toListingView } from "./listing-view"

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

export function ListingsGrid({ items }: { items: ListingItem[] }) {
  return (
    <section className="px-6 py-8">
      <h1 className="font-heading text-2xl font-bold">Listings</h1>
      {items.length === 0 ? (
        <p className="mt-4 text-muted">
          No listings are available right now. Please check back soon.
        </p>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <ListingCard key={item.sourceListingId} item={item} />
          ))}
        </div>
      )}
      {/* REALTOR.ca attribution only when DDF listings are present — never on an exclusive-only page. */}
      {items.some((item) => item.source === "ddf") ? <ListingAttribution /> : null}
    </section>
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
