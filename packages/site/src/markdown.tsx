import type { ComponentProps } from "react"
import Markdown from "react-markdown"
import remarkGfm from "remark-gfm"

// Safe Markdown → rich text. react-markdown renders to React elements (never dangerouslySetInnerHTML)
// and, without rehype-raw, ignores raw HTML in the source — so stored post bodies carry no HTML/XSS
// surface. Shared by the public renderer and the dashboard live preview so they match exactly.
// Elements are styled with our theme tokens (bg-brand, text-foreground, …) via a components map.

type Components = ComponentProps<typeof Markdown>["components"]

const components: Components = {
  h1: (props) => <h1 className="mt-8 font-heading text-3xl font-bold text-foreground" {...props} />,
  h2: (props) => <h2 className="mt-8 font-heading text-2xl font-bold text-foreground" {...props} />,
  h3: (props) => (
    <h3 className="mt-6 font-heading text-xl font-semibold text-foreground" {...props} />
  ),
  p: (props) => <p className="mt-4 leading-relaxed text-foreground" {...props} />,
  a: ({ href, ...props }) => (
    <a
      href={href}
      className="text-brand underline underline-offset-2 hover:opacity-80"
      // External links open safely; internal ones stay in-tab.
      {...(href?.startsWith("http")
        ? { target: "_blank", rel: "noopener noreferrer nofollow" }
        : {})}
      {...props}
    />
  ),
  ul: (props) => <ul className="mt-4 list-disc space-y-1 pl-6 text-foreground" {...props} />,
  ol: (props) => <ol className="mt-4 list-decimal space-y-1 pl-6 text-foreground" {...props} />,
  li: (props) => <li className="leading-relaxed" {...props} />,
  blockquote: (props) => (
    <blockquote className="mt-4 border-l-4 border-brand/40 pl-4 italic text-muted" {...props} />
  ),
  hr: () => <hr className="my-8 border-border" />,
  strong: (props) => <strong className="font-semibold text-foreground" {...props} />,
  code: (props) => (
    <code className="rounded bg-muted/20 px-1.5 py-0.5 font-mono text-sm" {...props} />
  ),
  pre: (props) => (
    <pre
      className="mt-4 overflow-x-auto rounded-[var(--radius-base)] bg-muted/10 p-4 font-mono text-sm"
      {...props}
    />
  ),
  img: ({ src, alt, ...props }) => (
    <img
      {...props}
      src={typeof src === "string" ? src : undefined}
      alt={alt ?? ""}
      className="mt-4 w-full rounded-[var(--radius-base)] object-cover"
    />
  ),
  table: (props) => (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full border-collapse text-sm" {...props} />
    </div>
  ),
  th: (props) => (
    <th className="border border-border px-3 py-1.5 text-left font-semibold" {...props} />
  ),
  td: (props) => <td className="border border-border px-3 py-1.5" {...props} />,
}

export function MarkdownContent({ markdown }: { markdown: string }) {
  return (
    <div className="text-foreground">
      <Markdown remarkPlugins={[remarkGfm]} components={components}>
        {markdown}
      </Markdown>
    </div>
  )
}
