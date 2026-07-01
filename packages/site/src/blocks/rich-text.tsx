import type { ComponentConfig } from "@measured/puck"

export interface RichTextProps {
  content: string
}

export const richText: ComponentConfig<RichTextProps> = {
  label: "Rich Text",
  fields: {
    content: { type: "textarea" },
  },
  defaultProps: {
    content: "Write something here.",
  },
  render: ({ content }) => (
    <section className="mx-auto max-w-3xl px-6 py-12">
      <p className="whitespace-pre-line text-foreground">{content}</p>
    </section>
  ),
}
