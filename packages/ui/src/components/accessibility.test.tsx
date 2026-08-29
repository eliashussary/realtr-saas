import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { axe } from "vitest-axe"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "./accordion"
import { Badge } from "./badge"
import { Button } from "./button"
import { Field, FieldDescription, FieldError, FieldLabel } from "./field"
import { Input } from "./input"
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "./popover"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs"

describe("UI accessibility", () => {
  // No globals/setup file, so cleanup is not automatic; unmount between tests to keep
  // portalled content and landmarks from leaking across cases.
  afterEach(cleanup)

  it("has no detectable violations in representative button and field states", async () => {
    const { container } = render(
      <main>
        <Button>Save profile</Button>
        <Button disabled>Saving</Button>
        <Field>
          <FieldLabel htmlFor="name">Display name</FieldLabel>
          <Input id="name" defaultValue="Alexandra Montgomery-Sinclair" />
          <FieldDescription>Shown on the public website.</FieldDescription>
        </Field>
        <Field data-invalid="true">
          <FieldLabel htmlFor="email">Contact email</FieldLabel>
          <Input id="email" defaultValue="invalid" aria-invalid="true" />
          <FieldError>Enter a valid email address.</FieldError>
        </Field>
      </main>,
    )

    const results = await axe(container, {
      rules: { "color-contrast": { enabled: false } },
    })
    expect(results.violations).toEqual([])
  })

  it("has no detectable violations across tabs, table, accordion, popover, and badge", async () => {
    // Popover content portals to <body>, so open it and scan that popup separately;
    // the rest is scanned via the scoped container like the button/field case above.
    const { container } = render(
      <main>
        <Tabs defaultValue="details">
          <TabsList>
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
          </TabsList>
          <TabsContent value="details">Listing details</TabsContent>
          <TabsContent value="activity">Recent activity</TabsContent>
        </Tabs>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Address</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell>123 Main St</TableCell>
              <TableCell>
                <Badge>Active</Badge>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>

        <Accordion defaultValue={["faq-1"]}>
          <AccordionItem value="faq-1">
            <AccordionTrigger>What is included?</AccordionTrigger>
            <AccordionContent>Everything you need.</AccordionContent>
          </AccordionItem>
        </Accordion>

        <Popover defaultOpen>
          <PopoverTrigger>Open</PopoverTrigger>
          <PopoverContent>
            <PopoverTitle>Quick actions</PopoverTitle>
          </PopoverContent>
        </Popover>

        <Badge variant="secondary">Draft</Badge>
        <Badge variant="destructive">Overdue</Badge>
        <Badge variant="outline">Archived</Badge>
      </main>,
    )

    const results = await axe(container, {
      rules: { "color-contrast": { enabled: false } },
    })
    expect(results.violations).toEqual([])

    // Popover popup is portalled outside the container; scan it on its own. It is a
    // detached dialog fragment, so the page-structure `region` rule does not apply.
    const popup = document.querySelector<HTMLElement>('[data-slot="popover-content"]')
    expect(popup).not.toBeNull()
    const popupResults = await axe(popup as HTMLElement, {
      rules: { "color-contrast": { enabled: false }, region: { enabled: false } },
    })
    expect(popupResults.violations).toEqual([])
  })
})
