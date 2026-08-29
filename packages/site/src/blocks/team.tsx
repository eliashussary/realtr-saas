import type { ComponentConfig } from "@measured/puck"

// Render-time agent data injected by the renderer from the org's visible agent profiles (never a
// Puck field, never persisted) — same pattern as ListingGrid. The editor sees skeleton placeholders.
export interface TeamAgent {
  slug: string
  href: string
  displayName: string
  title: string | null
  photoUrl: string | null
  email: string | null
  phone: string | null
}

export interface TeamProps {
  heading: string
  agents?: TeamAgent[]
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase()
}

export const team: ComponentConfig<TeamProps> = {
  label: "Team",
  fields: {
    heading: { type: "text" },
  },
  defaultProps: {
    heading: "Meet the team",
  },
  render: ({ heading, agents }) => {
    const shown = agents ?? null
    return (
      <section id="team" className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="font-heading text-3xl font-semibold text-foreground">{heading}</h2>
        {shown && shown.length > 0 ? (
          <div className="mt-8 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((a) => (
              <a
                key={a.slug}
                href={a.href}
                className="group flex flex-col items-center text-center"
              >
                {a.photoUrl ? (
                  <img
                    src={a.photoUrl}
                    alt={a.displayName}
                    className="size-32 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex size-32 items-center justify-center rounded-full bg-muted/20 font-heading text-2xl text-muted">
                    {initials(a.displayName)}
                  </div>
                )}
                <p className="mt-4 font-heading text-lg font-semibold text-foreground group-hover:underline">
                  {a.displayName}
                </p>
                {a.title ? <p className="text-sm text-muted">{a.title}</p> : null}
              </a>
            ))}
          </div>
        ) : (
          <div className="mt-8 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: static placeholder cards
                key={i}
                className="flex flex-col items-center"
              >
                <div className="size-32 rounded-full bg-muted/15" />
                <div className="mt-4 h-4 w-24 rounded bg-muted/25" />
                <div className="mt-2 h-3 w-16 rounded bg-muted/15" />
              </div>
            ))}
          </div>
        )}
      </section>
    )
  },
}
