import type { Config } from "@measured/puck"
import type { ComponentType, ReactNode } from "react"

export interface TemplateNavItem {
  id: string
  label: string
  href: string
}

export type TemplateRoot = ComponentType<{
  children: ReactNode
  title?: string
  nav?: TemplateNavItem[]
}>

/**
 * Build the Puck root config for a template. `title` is an editable Puck field; `nav` is injected at
 * render time by the renderer (document-level navigation) rather than declared as a field, so both
 * the editor and renderer feed the site menu into the template's layout the same way.
 */
export function buildRootConfig(Root: TemplateRoot): Config["root"] {
  return {
    fields: { title: { type: "text" } },
    defaultProps: { title: "Realtr" },
    render: (props) => {
      const { children, title, nav } = props as {
        children?: ReactNode
        title?: string
        nav?: TemplateNavItem[]
      }
      return (
        <Root title={title} nav={nav}>
          {children}
        </Root>
      )
    },
  }
}
