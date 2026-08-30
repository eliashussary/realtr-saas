import {
  Bold,
  Code,
  Heading2,
  Heading3,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  Quote,
  Strikethrough,
  Underline,
} from "lucide-react"
import { type ReactNode, useLayoutEffect, useRef, useState } from "react"

// A Markdown editor with a familiar formatting toolbar. Buttons wrap the selection with Markdown
// syntax (or <u> for underline) — so authors can click Bold/Italic/… or just type Markdown directly.
// Image inserts an uploaded asset. The stored value is always Markdown.

export function MarkdownEditor({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const pending = useRef<{ start: number; end: number } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  // Restore the caret/selection after a controlled re-render.
  useLayoutEffect(() => {
    if (pending.current && ref.current) {
      ref.current.focus()
      ref.current.setSelectionRange(pending.current.start, pending.current.end)
      pending.current = null
    }
  })

  function apply(next: string, start: number, end: number) {
    pending.current = { start, end }
    onChange(next)
  }

  // Wrap the current selection (or a placeholder) with `before`/`after`.
  function wrap(before: string, after: string, placeholder = "text") {
    const ta = ref.current
    if (!ta) return
    const s = ta.selectionStart
    const e = ta.selectionEnd
    const selected = value.slice(s, e) || placeholder
    const next = value.slice(0, s) + before + selected + after + value.slice(e)
    apply(next, s + before.length, s + before.length + selected.length)
  }

  // Prefix each line spanned by the selection with `prefix` (headings, quotes, lists).
  function prefixLines(prefix: string) {
    const ta = ref.current
    if (!ta) return
    const s = ta.selectionStart
    const e = ta.selectionEnd
    const lineStart = value.lastIndexOf("\n", s - 1) + 1
    const block = value.slice(lineStart, e)
    const replaced = block
      .split("\n")
      .map((line) => (line.startsWith(prefix) ? line : prefix + line))
      .join("\n")
    const next = value.slice(0, lineStart) + replaced + value.slice(e)
    apply(next, lineStart, lineStart + replaced.length)
  }

  function insert(text: string) {
    const ta = ref.current
    const at = ta ? ta.selectionStart : value.length
    const next = value.slice(0, at) + text + value.slice(at)
    apply(next, at + text.length, at + text.length)
  }

  async function uploadImage(file: File) {
    setUploading(true)
    try {
      const form = new FormData()
      form.append("file", file)
      const res = await fetch("/api/assets/upload", { method: "POST", body: form })
      const body = (await res.json().catch(() => null)) as
        | { ok: true; asset: { url: string } }
        | { ok: false }
        | null
      if (res.ok && body?.ok) insert(`\n![](${body.asset.url})\n`)
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  return (
    <div className="rounded-[var(--radius-base)] border border-input">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-border p-1">
        <ToolButton label="Bold" onClick={() => wrap("**", "**")}>
          <Bold className="size-4" />
        </ToolButton>
        <ToolButton label="Italic" onClick={() => wrap("*", "*")}>
          <Italic className="size-4" />
        </ToolButton>
        <ToolButton label="Underline" onClick={() => wrap("<u>", "</u>")}>
          <Underline className="size-4" />
        </ToolButton>
        <ToolButton label="Strikethrough" onClick={() => wrap("~~", "~~")}>
          <Strikethrough className="size-4" />
        </ToolButton>
        <Divider />
        <ToolButton label="Heading 2" onClick={() => prefixLines("## ")}>
          <Heading2 className="size-4" />
        </ToolButton>
        <ToolButton label="Heading 3" onClick={() => prefixLines("### ")}>
          <Heading3 className="size-4" />
        </ToolButton>
        <Divider />
        <ToolButton label="Bulleted list" onClick={() => prefixLines("- ")}>
          <List className="size-4" />
        </ToolButton>
        <ToolButton label="Numbered list" onClick={() => prefixLines("1. ")}>
          <ListOrdered className="size-4" />
        </ToolButton>
        <ToolButton label="Quote" onClick={() => prefixLines("> ")}>
          <Quote className="size-4" />
        </ToolButton>
        <ToolButton label="Inline code" onClick={() => wrap("`", "`", "code")}>
          <Code className="size-4" />
        </ToolButton>
        <Divider />
        <ToolButton label="Link" onClick={() => wrap("[", "](https://)", "link text")}>
          <Link2 className="size-4" />
        </ToolButton>
        <ToolButton label="Image" disabled={uploading} onClick={() => fileRef.current?.click()}>
          <ImagePlus className="size-4" />
        </ToolButton>
      </div>

      <textarea
        ref={ref}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={16}
        placeholder={"Write your post — use the toolbar or type **Markdown** directly."}
        className="min-h-72 w-full resize-y bg-transparent p-3 font-mono text-sm outline-none"
      />

      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) void uploadImage(file)
        }}
      />
    </div>
  )
}

function ToolButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      // Prevent the textarea from losing its selection before the handler runs.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="rounded p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-50"
    >
      {children}
    </button>
  )
}

function Divider() {
  return <span className="mx-1 h-5 w-px bg-border" />
}
