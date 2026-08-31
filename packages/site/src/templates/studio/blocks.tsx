import {
  type AboutProps,
  type ComposeOptions,
  type ContactProps,
  type HeroProps,
  LeadForm,
} from "../../blocks"

export const studioBlocks: ComposeOptions["renderOverrides"] = {
  Hero: ({ title, subtitle, ctaLabel, ctaHref }: HeroProps) => (
    <section className="grid min-h-[85svh] md:grid-cols-12">
      <div className="flex flex-col justify-center border-b-2 border-foreground px-6 py-20 md:col-span-7 md:border-b-0 md:border-r-2 md:px-14">
        <h1 className="max-w-2xl font-heading text-5xl font-bold uppercase leading-[0.95] tracking-tight md:text-7xl">
          {title}
        </h1>
        {subtitle ? <p className="mt-8 max-w-md leading-relaxed text-muted">{subtitle}</p> : null}
        {ctaLabel ? (
          <a
            href={ctaHref}
            className="mt-10 self-start bg-brand px-8 py-4 text-sm font-semibold uppercase tracking-[0.2em] text-white transition-opacity hover:opacity-90"
          >
            {ctaLabel}
          </a>
        ) : null}
      </div>
      <div aria-hidden="true" className="relative min-h-48 overflow-hidden bg-brand md:col-span-5">
        <div className="absolute -right-14 -top-14 h-56 w-56 rounded-full border-[10px] border-white/25" />
        <div className="absolute bottom-10 left-10 h-20 w-20 bg-accent" />
      </div>
    </section>
  ),
  About: ({ heading, body }: AboutProps) => (
    <section className="border-t-2 border-foreground px-6 py-20 md:px-14">
      <div className="mx-auto grid max-w-6xl gap-8 md:grid-cols-12">
        <h2 className="font-heading text-4xl font-bold uppercase leading-none tracking-tight md:col-span-4">
          {heading}
        </h2>
        <div className="whitespace-pre-line leading-relaxed text-muted md:col-span-7 md:col-start-6">
          {body}
        </div>
      </div>
    </section>
  ),
  Contact: ({ heading, email, phone }: ContactProps) => (
    <section id="contact" className="bg-accent px-6 py-20 md:px-14">
      <div className="mx-auto max-w-6xl">
        <h2 className="font-heading text-4xl font-bold uppercase leading-none tracking-tight md:text-6xl">
          {heading}
        </h2>
        <div className="mt-6 flex flex-col gap-1 font-heading text-2xl font-bold">
          {email ? (
            <a href={`mailto:${email}`} className="underline underline-offset-4 hover:opacity-80">
              {email}
            </a>
          ) : null}
          {phone ? (
            <a href={`tel:${phone}`} className="underline underline-offset-4 hover:opacity-80">
              {phone}
            </a>
          ) : null}
        </div>
        <div className="mt-10 max-w-md">
          <LeadForm
            fieldClassName="w-full border-2 border-foreground bg-white px-4 py-3 text-foreground placeholder:text-muted"
            submitClassName="mt-2 bg-foreground px-8 py-3 text-sm font-semibold uppercase tracking-[0.2em] text-white transition-opacity hover:opacity-90"
            consentClassName="flex items-start gap-2 text-sm text-foreground/80"
          />
        </div>
      </div>
    </section>
  ),
}
