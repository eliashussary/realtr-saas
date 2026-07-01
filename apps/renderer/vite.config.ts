import tailwindcss from "@tailwindcss/vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import viteReact from "@vitejs/plugin-react"
import { nitro } from "nitro/vite"
import { defineConfig, loadEnv } from "vite"

export default defineConfig(({ mode }) => {
  // Load the repo-root .env into process.env so server-side code (DB client) sees it in dev.
  Object.assign(process.env, loadEnv(mode, "../../", ""))

  return {
    resolve: { tsconfigPaths: true },
    server: {
      port: 3000,
      // Tenant sites arrive on arbitrary hosts (e.g. demo.localhost, custom domains).
      allowedHosts: true,
    },
    plugins: [nitro(), tailwindcss(), tanstackStart(), viteReact()],
  }
})
