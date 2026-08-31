// The tenant's lead-capture form, shared by the core Contact block and every template's
// Contact render override. Native POST → /api/lead (works without JS); the trailing script
// only reveals the confirmation/error text after the redirect.
//
// Template overrides MUST keep rendering this component — the honeypot field is part of the
// spam defense, and the ?contacted script targets these element ids.

// A `<script>` toggles the banner from ?contacted. The form itself works without JS (native POST →
// store → redirect); the script only reveals the confirmation/error text after the redirect.
const CONFIRM_SCRIPT = `(function(){try{var p=new URLSearchParams(location.search).get('contacted');if(!p)return;var ok=document.getElementById('contact-ok');var err=document.getElementById('contact-err');var f=document.getElementById('contact-form');if(p==='1'){if(ok)ok.hidden=false;if(f)f.hidden=true;}else if(p==='invalid'||p==='error'){if(err){err.hidden=false;err.textContent=p==='invalid'?'Please enter a valid email or phone number.':'Something went wrong. Please try again.';}}}catch(e){}})();`

const DEFAULT_FIELD =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-foreground placeholder:text-muted"

export interface LeadFormProps {
  fieldClassName?: string
  submitClassName?: string
  consentClassName?: string
  okClassName?: string
  errClassName?: string
  formClassName?: string
}

export function LeadForm({
  fieldClassName = DEFAULT_FIELD,
  submitClassName = "rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground",
  consentClassName = "flex items-start gap-2 text-sm text-muted",
  okClassName = "mt-6 rounded-md bg-primary/10 px-4 py-3 text-foreground",
  errClassName = "mt-6 rounded-md bg-red-500/10 px-4 py-3 text-red-600",
  formClassName = "mt-8 flex flex-col gap-3 text-left",
}: LeadFormProps) {
  return (
    <>
      <p id="contact-ok" hidden className={okClassName}>
        Thanks — your message is on its way. We'll be in touch shortly.
      </p>
      <p id="contact-err" hidden className={errClassName} />

      <form id="contact-form" method="POST" action="/api/lead" className={formClassName}>
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
        <input name="name" placeholder="Your name" autoComplete="name" className={fieldClassName} />
        <input
          name="email"
          type="email"
          placeholder="Email"
          autoComplete="email"
          className={fieldClassName}
        />
        <input
          name="phone"
          type="tel"
          placeholder="Phone"
          autoComplete="tel"
          className={fieldClassName}
        />
        <textarea
          name="message"
          placeholder="How can we help?"
          rows={4}
          className={fieldClassName}
        />
        <label className={consentClassName}>
          <input type="checkbox" name="consent" value="on" className="mt-1" />
          <span>I agree to be contacted about my inquiry.</span>
        </label>
        <button type="submit" className={submitClassName}>
          Send message
        </button>
      </form>
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: static, no interpolation */}
      <script dangerouslySetInnerHTML={{ __html: CONFIRM_SCRIPT }} />
    </>
  )
}
