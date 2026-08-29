import { Button } from "@realtr/ui/components/button"
import { Loader2, Upload, X } from "lucide-react"
import { useRef, useState } from "react"

// Reusable image uploader backed by /api/assets/upload. Returns public asset URLs. Used by the
// exclusive-listing form now; reusable anywhere images are needed (site logo, agent photos, blogs).
export function ImageUpload({
  value,
  onChange,
  max = 24,
}: {
  value: string[]
  onChange: (urls: string[]) => void
  max?: number
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const atLimit = value.length >= max

  async function upload(files: FileList) {
    setError(null)
    setUploading(true)
    const added: string[] = []
    try {
      for (const file of Array.from(files)) {
        if (value.length + added.length >= max) break
        const form = new FormData()
        form.append("file", file)
        const res = await fetch("/api/assets/upload", { method: "POST", body: form })
        const body = (await res.json().catch(() => null)) as
          | { ok: true; asset: { url: string } }
          | { ok: false; code: string }
          | null
        if (res.ok && body?.ok) {
          added.push(body.asset.url)
        } else {
          const code = body && !body.ok ? body.code : "upload_failed"
          setError(
            code === "too_large"
              ? "Image is too large (max 8MB)."
              : code === "unsupported_type"
                ? "Unsupported image type (use JPEG, PNG, WEBP, or GIF)."
                : "Upload failed. Please try again.",
          )
        }
      }
      if (added.length) onChange([...value, ...added])
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  function remove(url: string) {
    onChange(value.filter((u) => u !== url))
  }

  return (
    <div>
      <div className="flex flex-wrap gap-3">
        {value.map((url) => (
          <div
            key={url}
            className="group relative size-24 overflow-hidden rounded-[var(--radius-base)] border border-border"
          >
            <img src={url} alt="" className="size-full object-cover" />
            <button
              type="button"
              onClick={() => remove(url)}
              aria-label="Remove image"
              className="absolute right-1 top-1 rounded-full bg-background/80 p-1 text-foreground opacity-0 transition-opacity hover:bg-background group-hover:opacity-100"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ))}
        {!atLimit ? (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="flex size-24 flex-col items-center justify-center gap-1 rounded-[var(--radius-base)] border border-dashed border-border text-xs text-muted-foreground transition-colors hover:border-brand hover:text-brand disabled:opacity-50"
          >
            {uploading ? (
              <Loader2 className="size-5 animate-spin" />
            ) : (
              <>
                <Upload className="size-5" />
                Add
              </>
            )}
          </button>
        ) : null}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        multiple={max > 1}
        hidden
        onChange={(e) => e.target.files && upload(e.target.files)}
      />
      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
      {value.length > 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">
          {value.length} / {max} · the first image is the cover photo
        </p>
      ) : null}
      {max > 1 ? null : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-2"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
        >
          {value.length ? "Replace" : "Upload"}
        </Button>
      )}
    </div>
  )
}
