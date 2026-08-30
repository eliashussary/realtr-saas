import type { ComponentConfig } from "@measured/puck"
import { imageField } from "./image-field"

export interface ImageProps {
  url: string
  alt: string
  caption: string
  width: "narrow" | "wide" | "full"
}

const WIDTHS: Record<ImageProps["width"], string> = {
  narrow: "max-w-2xl",
  wide: "max-w-4xl",
  full: "max-w-6xl",
}

// A first-class single-image block with an in-editor uploader. Alt text is required for accessibility;
// an optional caption renders below.
export const image: ComponentConfig<ImageProps> = {
  label: "Image",
  fields: {
    url: imageField("Image"),
    alt: { type: "text" },
    caption: { type: "text" },
    width: {
      type: "select",
      options: [
        { label: "Narrow", value: "narrow" },
        { label: "Wide", value: "wide" },
        { label: "Full", value: "full" },
      ],
    },
  },
  defaultProps: {
    url: "",
    alt: "",
    caption: "",
    width: "wide",
  },
  render: ({ url, alt, caption, width }) => (
    <section className="px-6 py-8">
      <figure className={`mx-auto ${WIDTHS[width] ?? WIDTHS.wide}`}>
        {url ? (
          <img src={url} alt={alt} className="w-full rounded-[var(--radius-base)] object-cover" />
        ) : (
          <div className="flex aspect-video w-full items-center justify-center rounded-[var(--radius-base)] border border-dashed border-border text-sm text-muted">
            Add an image
          </div>
        )}
        {caption ? (
          <figcaption className="mt-2 text-center text-sm text-muted">{caption}</figcaption>
        ) : null}
      </figure>
    </section>
  ),
}
