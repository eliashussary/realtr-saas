import {
  type AboutProps,
  type ComposeOptions,
  type ContactProps,
  type HeroProps,
  LeadForm,
} from "../../blocks"

export const coastalBlocks: ComposeOptions["renderOverrides"] = {
  Hero: ({ title, subtitle, ctaLabel, ctaHref }: HeroProps) => (
    <section className="relative overflow-hidden px-6 pb-24 pt-16 md:pb-32 md:pt-24">
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,color-mix(in_oklab,var(--t-accent)_30%,transparent),transparent_65%)]"
      />
      <div className="mx-auto max-w-3xl text-center">
        <h1 className="font-heading text-4xl leading-tight text-foreground md:text-6xl">{title}</h1>
        {subtitle ? (
          <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-muted">{subtitle}</p>
        ) : null}
        {ctaLabel ? (
          <a
            href={ctaHref}
            className="mt-10 inline-block rounded-full bg-brand px-8 py-3.5 text-sm font-medium text-white shadow-lg shadow-brand/25 transition-opacity hover:opacity-90"
          >
            {ctaLabel}
          </a>
        ) : null}
      </div>
    </section>
  ),
  About: ({ heading, body }: AboutProps) => (
    <section className="px-6 py-16">
      <div className="mx-auto max-w-4xl rounded-[2rem] bg-accent/15 px-8 py-12 md:px-14 md:py-16">
        <h2 className="font-heading text-3xl text-foreground md:text-4xl">{heading}</h2>
        <p className="mt-5 whitespace-pre-line leading-relaxed text-muted">{body}</p>
      </div>
    </section>
  ),
  Contact: ({ heading, email, phone }: ContactProps) => (
    <section id="contact" className="px-6 py-16">
      <div className="mx-auto max-w-2xl rounded-[2rem] bg-brand px-8 py-12 text-center text-white md:px-14 md:py-16">
        <h2 className="font-heading text-3xl md:text-4xl">{heading}</h2>
        <div className="mt-4 flex flex-col items-center gap-1">
          {email ? (
            <a
              href={`mailto:${email}`}
              className="transition-colors text-white/80 hover:text-white"
            >
              {email}
            </a>
          ) : null}
          {phone ? (
            <a href={`tel:${phone}`} className="transition-colors text-white/80 hover:text-white">
              {phone}
            </a>
          ) : null}
        </div>

        <LeadForm
          fieldClassName="w-full rounded-full border border-white/40 bg-white/10 px-5 py-3 text-white placeholder:text-white/60"
          submitClassName="mt-2 rounded-full bg-white px-8 py-3 text-sm font-semibold text-brand"
          consentClassName="flex items-start gap-2 text-sm text-white/80"
          okClassName="mt-6 rounded-full bg-white/15 px-4 py-3 text-white"
          errClassName="mt-6 rounded-full bg-red-500/25 px-4 py-3 text-white"
        />
      </div>
    </section>
  ),
}
