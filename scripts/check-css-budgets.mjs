import { readdir, stat } from "node:fs/promises"
import { join } from "node:path"

const budgets = {
  // The control centre now hosts the Puck editor, which renders @realtr/site blocks, so the app
  // bundle includes their utility classes (same set the renderer scans).
  app: 65_000,
  marketing: 18_000,
  renderer: 20_000,
}

let failed = false

for (const [app, budget] of Object.entries(budgets)) {
  const assetsDirectory = join("apps", app, ".output", "public", "assets")
  let assets

  try {
    assets = await readdir(assetsDirectory)
  } catch {
    console.error(`${app}: build assets are missing; run pnpm build first`)
    failed = true
    continue
  }

  const stylesheets = assets.filter(
    (asset) => asset.startsWith("styles-") && asset.endsWith(".css"),
  )

  if (stylesheets.length !== 1) {
    console.error(`${app}: expected one generated stylesheet, found ${stylesheets.length}`)
    failed = true
    continue
  }

  const stylesheet = join(assetsDirectory, stylesheets[0])
  const { size } = await stat(stylesheet)
  const result = `${app}: ${size.toLocaleString()} / ${budget.toLocaleString()} bytes`

  if (size > budget) {
    console.error(`${result} (over budget)`)
    failed = true
  } else {
    console.log(result)
  }
}

if (failed) {
  process.exitCode = 1
}
