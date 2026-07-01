import type { ComponentConfig } from "@measured/puck"

export interface AboutProps {
  heading: string
  body: string
}

export const about: ComponentConfig<AboutProps> = {
  label: "About",
  fields: {
    heading: { type: "text" },
    body: { type: "textarea" },
  },
  defaultProps: {
    heading: "About me",
    body: "I help buyers and sellers navigate the market with local expertise and care.",
  },
  render: ({ heading, body }) => (
    <section className="mx-auto max-w-3xl px-6 py-16">
      <h2 className="font-heading text-3xl font-semibold text-foreground">{heading}</h2>
      <p className="mt-4 whitespace-pre-line text-muted">{body}</p>
    </section>
  ),
}
