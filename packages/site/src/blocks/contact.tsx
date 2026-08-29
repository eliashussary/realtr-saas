import type { ComponentConfig } from "@measured/puck"

export interface ContactProps {
  heading: string
  email: string
  phone: string
}

// A `<script>` toggles the banner from ?contacted. The form itself works without JS (native POST →
// store → redirect); the script only reveals the confirmation/error text after the redirect.
const CONFIRM_SCRIPT = `(function(){try{var p=new URLSearchParams(location.search).get('contacted');if(!p)return;var ok=document.getElementById('contact-ok');var err=document.getElementById('contact-err');var f=document.getElementById('contact-form');if(p==='1'){if(ok)ok.hidden=false;if(f)f.hidden=true;}else if(p==='invalid'||p==='error'){if(err){err.hidden=false;err.textContent=p==='invalid'?'Please enter a valid email or phone number.':'Something went wrong. Please try again.';}}}catch(e){}})();`

const field =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-foreground placeholder:text-muted"

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

        <p
          id="contact-ok"
          hidden
          className="mt-6 rounded-md bg-primary/10 px-4 py-3 text-foreground"
        >
          Thanks — your message is on its way. We'll be in touch shortly.
        </p>
        <p
          id="contact-err"
          hidden
          className="mt-6 rounded-md bg-red-500/10 px-4 py-3 text-red-600"
        />

        <form
          id="contact-form"
          method="POST"
          action="/api/lead"
          className="mt-8 flex flex-col gap-3 text-left"
        >
          <input type="hidden" name="source" value="contact_form" />
          {/* Honeypot: hidden from users, tempting to bots. A filled value is dropped server-side. */}
          <input
            type="text"
            name="company"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            className="hidden"
          />
          <input name="name" placeholder="Your name" autoComplete="name" className={field} />
          <input
            name="email"
            type="email"
            placeholder="Email"
            autoComplete="email"
            className={field}
          />
          <input name="phone" type="tel" placeholder="Phone" autoComplete="tel" className={field} />
          <textarea name="message" placeholder="How can we help?" rows={4} className={field} />
          <label className="flex items-start gap-2 text-sm text-muted">
            <input type="checkbox" name="consent" value="on" className="mt-1" />
            <span>I agree to be contacted about my inquiry.</span>
          </label>
          <button
            type="submit"
            className="rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground"
          >
            Send message
          </button>
        </form>
      </div>
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: static, no interpolation */}
      <script dangerouslySetInnerHTML={{ __html: CONFIRM_SCRIPT }} />
    </section>
  ),
}
