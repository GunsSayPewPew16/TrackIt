import { fileURLToPath, URL } from "node:url"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// `@/components/ui` resolves to src/components/ui, matching the shadcn/ui
// `components.json` aliases, so primitives can be added with the CLI later.
//
// PAGES_BASE is set by the GitHub Pages workflow to the repository sub-path
// (/TrackIt/), so every asset URL is correct on the published site. Local dev
// and preview leave it unset and serve from /.
export default defineConfig({
  base: process.env.PAGES_BASE ?? "/",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
})
