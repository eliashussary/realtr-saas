import type { ComponentConfig } from "@measured/puck"
import { LeadForm } from "./lead-form"

export interface ContactProps {
  heading: string
  email: string
  phone: string
}

export const contact: ComponentConfig<ContactProps> = {
  label: "Contact",
  fields: {
    heading: { type: "text" },
    email: { type: "text" },
    phone: { type: "text" },
  },
  defaultProps: {
    heading: "Get in touch",
    email: "hello@example.com",
    phone: "(555) 123-4567",
  },
  render: ({ heading, email, phone }) => (
    <section id="contact" className="bg-muted/5 px-6 py-16">
      <div className="mx-auto max-w-xl text-center">
        <h2 className="font-heading text-3xl font-semibold text-foreground">{heading}</h2>
        <div className="mt-4 flex flex-col items-center gap-1 text-muted">
          {email ? <a href={`mailto:${email}`}>{email}</a> : null}
          {phone ? <a href={`tel:${phone}`}>{phone}</a> : null}
        </div>

        <LeadForm />
      </div>
    </section>
  ),
}
