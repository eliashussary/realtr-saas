import { templateList } from "@realtr/site"
import { Button } from "@realtr/ui/components/button"
import { CheckIcon } from "lucide-react"

// Template chooser, rendered in the editor's right-rail "Design" tab (M2 — moved out of a modal).
// Switching keeps pages, content, and theme; only the layout changes.
export function TemplatePanel({
  currentId,
  onSelect,
}: {
  currentId: string
  onSelect: (id: string) => void
}) {
  return (
    <div className="flex flex-col gap-3">
      {templateList.map((template) => {
        const isCurrent = template.id === currentId
        return (
          <div
            key={template.id}
            data-current={isCurrent || undefined}
            className="flex flex-col gap-2 rounded-lg border border-border bg-muted/30 p-3 data-[current]:border-primary data-[current]:bg-primary/5"
          >
            <div className="flex items-center gap-2">
              <span className="font-heading text-sm font-semibold text-foreground">
                {template.name}
              </span>
              {isCurrent && (
                <span className="inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
                  <CheckIcon className="size-3" /> Current
                </span>
              )}
            </div>
            {template.description && (
              <p className="text-sm text-muted-foreground">{template.description}</p>
            )}
            <Button
              variant={isCurrent ? "ghost" : "outline"}
              size="sm"
              className="self-start"
              disabled={isCurrent}
              onClick={() => onSelect(template.id)}
            >
              {isCurrent ? "In use" : "Use template"}
            </Button>
          </div>
        )
      })}
    </div>
  )
}
