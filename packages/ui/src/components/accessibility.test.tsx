import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { axe } from "vitest-axe"
import { Button } from "./button"
import { Field, FieldDescription, FieldError, FieldLabel } from "./field"
import { Input } from "./input"

describe("UI accessibility", () => {
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
})
