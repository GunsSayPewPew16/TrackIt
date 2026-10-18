import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "./index.css"
import App from "./App"
import { rememberKeyFromUrl } from "./lib/hello"
import { lockZoom } from "./lib/zoom"

// The one boot step the app has beyond painting: a `?gemini_key=…` on the URL is taken
// into this browser's storage and out of the address bar before anything renders, so the
// key never ends up in the history, a bookmark or a shared link (see `lib/hello.ts`).
// Nothing spends that key at the moment — the greeting comes from the `greetings` table
// behind the Worker — and it is kept because a model will be wanted for something else.
rememberKeyFromUrl()

// Pinch and double-tap zoom are off app-wide; the reasons (and the three layers it
// takes) are in `lib/zoom.ts`.
lockZoom()

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
