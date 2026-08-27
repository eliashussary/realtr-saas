import { Button } from "@realtr/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@realtr/ui/components/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@realtr/ui/components/dropdown-menu"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@realtr/ui/components/field"
import { Input } from "@realtr/ui/components/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@realtr/ui/components/select"
import { Toaster } from "@realtr/ui/components/sonner"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@realtr/ui/components/tooltip"
import { createFileRoute } from "@tanstack/react-router"
import { EllipsisIcon, Loader2Icon, MoonIcon, SunIcon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

export const Route = createFileRoute("/workbench")({ component: Workbench })

function Workbench() {
  const [dark, setDark] = useState(false)
  return (
    <TooltipProvider>
      <main
        className={`${dark ? "dark" : ""} realtr-app isolate min-h-screen bg-[var(--app-canvas)] p-4 text-foreground sm:p-8`}
      >
        <div className="mx-auto grid max-w-6xl gap-8">
          <header className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-primary">Realtr UI validation spike</p>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight">
                Control-centre workbench
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                Isolated component states for visual, keyboard, mobile, and dark-theme review.
              </p>
            </div>
            <Button
              variant="outline"
              size="icon"
              aria-label={dark ? "Use light theme" : "Use dark theme"}
              onClick={() => setDark((value) => !value)}
            >
              {dark ? <SunIcon /> : <MoonIcon />}
            </Button>
          </header>

          <WorkbenchSection title="Buttons and feedback">
            <div className="flex flex-wrap items-center gap-3">
              <Button>Publish site</Button>
              <Button variant="secondary">Save draft</Button>
              <Button variant="outline">Preview</Button>
              <Button variant="ghost">Cancel</Button>
              <Button variant="destructive">Delete domain</Button>
              <Button disabled>Disabled</Button>
              <Button disabled>
                <Loader2Icon className="animate-spin" /> Saving
              </Button>
              <Button onClick={() => toast.success("Draft saved")}>Show toast</Button>
            </div>
          </WorkbenchSection>

          <div className="grid gap-8 lg:grid-cols-2">
            <WorkbenchSection title="Representative realtor profile form">
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="display-name">Display name</FieldLabel>
                  <Input id="display-name" defaultValue="Alexandra Montgomery-Sinclair" />
                  <FieldDescription>
                    Shown on the public website and listing pages.
                  </FieldDescription>
                </Field>
                <Field data-invalid="true">
                  <FieldLabel htmlFor="contact-email">Contact email</FieldLabel>
                  <Input id="contact-email" defaultValue="not-an-email" aria-invalid="true" />
                  <FieldError>Enter a valid email address.</FieldError>
                </Field>
                <Field>
                  <FieldLabel>Primary market</FieldLabel>
                  <Select defaultValue="toronto">
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="toronto">Toronto and the Greater Toronto Area</SelectItem>
                      <SelectItem value="ottawa">Ottawa</SelectItem>
                      <SelectItem value="vancouver">Vancouver</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <div className="flex justify-end gap-2">
                  <Button variant="outline">Discard</Button>
                  <Button>Save profile</Button>
                </div>
              </FieldGroup>
            </WorkbenchSection>

            <WorkbenchSection title="Overlays and menus">
              <div className="flex flex-wrap gap-3">
                <Dialog>
                  <DialogTrigger render={<Button variant="outline" />}>Open dialog</DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Publish these changes?</DialogTitle>
                      <DialogDescription>
                        Visitors will see the new profile and navigation as soon as publication
                        completes.
                      </DialogDescription>
                    </DialogHeader>
                    <DialogFooter showCloseButton>
                      <Button>Publish</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>

                <DropdownMenu>
                  <DropdownMenuTrigger render={<Button variant="outline" size="icon" />}>
                    <EllipsisIcon />
                    <span className="sr-only">Open site actions</span>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuLabel>Site actions</DropdownMenuLabel>
                    <DropdownMenuItem>Duplicate site</DropdownMenuItem>
                    <DropdownMenuItem>View revisions</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-destructive">Archive site</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                <Tooltip>
                  <TooltipTrigger render={<Button variant="ghost" />}>Domain status</TooltipTrigger>
                  <TooltipContent>DNS verification is checked every five minutes.</TooltipContent>
                </Tooltip>
              </div>
              <p className="mt-6 max-w-sm text-sm text-muted-foreground">
                This deliberately long supporting message verifies wrapping without widening popup
                triggers or losing readable line lengths on narrow screens.
              </p>
            </WorkbenchSection>
          </div>
        </div>
        <Toaster />
      </main>
    </TooltipProvider>
  )
}

function WorkbenchSection({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-xl border border-border bg-[var(--app-surface)] p-5 shadow-sm">
      <h2 className="mb-5 text-lg font-semibold">{title}</h2>
      {children}
    </section>
  )
}
