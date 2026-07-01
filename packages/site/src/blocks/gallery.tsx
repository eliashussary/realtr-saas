import type { ComponentConfig } from "@measured/puck"

export interface GalleryImage {
  url: string
  alt: string
}

export interface GalleryProps {
  images: GalleryImage[]
}

export const gallery: ComponentConfig<GalleryProps> = {
  label: "Gallery",
  fields: {
    images: {
      type: "array",
      arrayFields: {
        url: { type: "text" },
        alt: { type: "text" },
      },
    },
  },
  defaultProps: {
    images: [],
  },
  render: ({ images }) => (
    <section className="mx-auto max-w-6xl px-6 py-16">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        {(images ?? []).map((img, i) => (
          <img
            // biome-ignore lint/suspicious/noArrayIndexKey: gallery items are positional
            key={i}
            src={img.url}
            alt={img.alt}
            className="aspect-square w-full rounded-[var(--radius-base)] object-cover"
          />
        ))}
      </div>
    </section>
  ),
}
