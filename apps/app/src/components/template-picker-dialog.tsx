import { templateList } from "@realtr/site"
import { Button } from "@realtr/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@realtr/ui/components/dialog"
import { CheckIcon } from "lucide-react"

export function TemplatePickerDialog({
  open,
  onOpenChange,
  currentId,
  onSelect,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentId: string
  onSelect: (id: string) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Choose a template</DialogTitle>
          <DialogDescription>
            Switching keeps your pages, content, and theme — only the layout changes. Preview it,
            then publish when you're happy.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 py-1">
          {templateList.map((template) => {
            const isCurrent = template.id === currentId
            return (
              <div
                key={template.id}
                data-current={isCurrent || undefined}
                className="flex items-center justify-between gap-4 rounded-lg border border-border bg-muted/30 p-4 data-[current]:border-primary data-[current]:bg-primary/5"
              >
                <div className="min-w-0">
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
                    <p className="mt-1 text-sm text-muted-foreground">{template.description}</p>
                  )}
                </div>
                <Button
                  variant={isCurrent ? "ghost" : "outline"}
                  size="sm"
                  disabled={isCurrent}
                  onClick={() => onSelect(template.id)}
                >
                  {isCurrent ? "In use" : "Use template"}
                </Button>
              </div>
            )
          })}
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
