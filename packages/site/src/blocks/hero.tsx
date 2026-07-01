import type { ComponentConfig } from "@measured/puck"

export interface HeroProps {
  title: string
  subtitle: string
  ctaLabel: string
  ctaHref: string
}

export const hero: ComponentConfig<HeroProps> = {
  label: "Hero",
  fields: {
    title: { type: "text" },
    subtitle: { type: "textarea" },
    ctaLabel: { type: "text" },
    ctaHref: { type: "text" },
  },
  defaultProps: {
    title: "Find your next home",
    subtitle: "Browse curated listings with a boutique, high-touch experience.",
    ctaLabel: "View listings",
    ctaHref: "#listings",
  },
  render: ({ title, subtitle, ctaLabel, ctaHref }) => (
    <section className="bg-brand/5 px-6 py-24 text-center">
      <h1 className="font-heading text-4xl font-bold text-foreground md:text-6xl">{title}</h1>
      <p className="mx-auto mt-4 max-w-2xl text-muted">{subtitle}</p>
      {ctaLabel ? (
        <a
          href={ctaHref}
          className="mt-8 inline-block rounded-[var(--radius-base)] bg-brand px-6 py-3 font-medium text-white transition-opacity hover:opacity-90"
        >
          {ctaLabel}
        </a>
      ) : null}
    </section>
  ),
}
