import {
  type AboutProps,
  type ComposeOptions,
  type ContactProps,
  type HeroProps,
  LeadForm,
} from "../../blocks"

export const estateBlocks: ComposeOptions["renderOverrides"] = {
  Hero: ({ title, subtitle, ctaLabel, ctaHref }: HeroProps) => (
    <section className="relative isolate flex min-h-[86svh] items-center justify-center overflow-hidden px-6 py-24 text-center">
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-[radial-gradient(70%_55%_at_50%_28%,color-mix(in_oklab,var(--t-brand)_16%,transparent),transparent_72%)]"
      />
      <div className="max-w-3xl">
        <span aria-hidden="true" className="mx-auto mb-10 block h-px w-16 bg-accent/70" />
        <h1 className="font-heading text-5xl leading-[1.08] text-foreground md:text-7xl">
          {title}
        </h1>
        {subtitle ? (
          <p className="mx-auto mt-8 max-w-xl text-lg font-light leading-relaxed text-muted">
            {subtitle}
          </p>
        ) : null}
        {ctaLabel ? (
          <a
            href={ctaHref}
            className="mt-12 inline-block border border-foreground/40 px-10 py-4 text-xs uppercase tracking-[0.3em] text-foreground transition-colors hover:border-accent hover:text-accent"
          >
            {ctaLabel}
          </a>
        ) : null}
      </div>
    </section>
  ),
  About: ({ heading, body }: AboutProps) => (
    <section className="px-6 py-20">
      <div className="mx-auto max-w-2xl text-center">
        <span aria-hidden="true" className="mx-auto mb-8 block h-px w-12 bg-accent/60" />
        <h2 className="font-heading text-3xl text-foreground md:text-4xl">{heading}</h2>
        <p className="mt-6 whitespace-pre-line leading-relaxed text-muted">{body}</p>
      </div>
    </section>
  ),
  Contact: ({ heading, email, phone }: ContactProps) => (
    <section id="contact" className="border-t border-foreground/10 px-6 py-20">
      <div className="mx-auto max-w-xl text-center">
        <span aria-hidden="true" className="mx-auto mb-8 block h-px w-12 bg-accent/60" />
        <h2 className="font-heading text-3xl text-foreground md:text-4xl">{heading}</h2>
        <div className="mt-4 flex flex-col items-center gap-1 text-muted">
          {email ? (
            <a href={`mailto:${email}`} className="transition-colors hover:text-foreground">
              {email}
            </a>
          ) : null}
          {phone ? (
            <a href={`tel:${phone}`} className="transition-colors hover:text-foreground">
              {phone}
            </a>
          ) : null}
        </div>
        <LeadForm
          fieldClassName="w-full border border-foreground/25 bg-transparent px-4 py-3 text-foreground placeholder:text-muted"
          submitClassName="mt-2 border border-foreground/40 px-8 py-3 text-xs uppercase tracking-[0.3em] text-foreground transition-colors hover:border-accent hover:text-accent"
        />
      </div>
    </section>
  ),
}
