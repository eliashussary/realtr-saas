import type { CustomField } from "@measured/puck"
import { useRef, useState } from "react"

// A reusable Puck "custom" field that uploads a single image and stores its public URL. Backed by the
// app's /api/assets/upload endpoint (owner/admin, tenant-scoped, 8MB, JPEG/PNG/WEBP/GIF) — the same
// contract the dashboard ImageUpload uses. Field renders run only inside the Puck editor (never in the
// renderer's <Render>), so this stays self-contained here without coupling the renderer to app code.

const ACCEPT = "image/jpeg,image/png,image/webp,image/gif"

function ImageFieldControl({
  value,
  onChange,
}: {
  value: string | undefined
  onChange: (value: string) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function upload(file: File) {
    setError(null)
    setUploading(true)
    try {
      const form = new FormData()
      form.append("file", file)
      const res = await fetch("/api/assets/upload", { method: "POST", body: form })
      const body = (await res.json().catch(() => null)) as
        | { ok: true; asset: { url: string } }
        | { ok: false; code: string }
        | null
      if (res.ok && body?.ok) {
        onChange(body.asset.url)
      } else {
        const code = body && !body.ok ? body.code : "upload_failed"
        setError(
          code === "too_large"
            ? "Image is too large (max 8MB)."
            : code === "unsupported_type"
              ? "Use JPEG, PNG, WEBP, or GIF."
              : code === "forbidden" || code === "unauthorized"
                ? "You don't have permission to upload."
                : "Upload failed. Please try again.",
        )
      }
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {value ? (
        <div className="relative w-full overflow-hidden rounded-md border border-border">
          <img src={value} alt="" className="max-h-40 w-full object-cover" />
          <button
            type="button"
            onClick={() => onChange("")}
            aria-label="Remove image"
            className="absolute right-1 top-1 rounded-full bg-background/80 px-2 py-0.5 text-xs text-foreground hover:bg-background"
          >
            Remove
          </button>
        </div>
      ) : null}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="rounded-md border border-border bg-transparent px-3 py-1.5 text-sm hover:border-brand hover:text-brand disabled:opacity-50"
        >
          {uploading ? "Uploading…" : value ? "Replace image" : "Upload image"}
        </button>
      </div>

      {/* Also allow pasting a URL directly (e.g. an existing asset or external image). */}
      <input
        type="text"
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
        placeholder="or paste an image URL"
        className="h-8 w-full rounded-md border border-input bg-transparent px-2.5 text-sm"
      />

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) void upload(file)
        }}
      />
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  )
}

/** A Puck custom field for a single uploadable image URL. Use in a block's `fields` / `arrayFields`. */
export function imageField(label?: string): CustomField<string> {
  return {
    type: "custom",
    label,
    render: ({ value, onChange }) => (
      <ImageFieldControl value={value} onChange={(next) => onChange(next)} />
    ),
  }
}
