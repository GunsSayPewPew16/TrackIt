import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "./index.css"
import App from "./App"
import { rememberKeyFromUrl } from "./lib/hello"

// The one boot step the app has beyond painting: a `?gemini_key=…` on the URL is taken
// into this browser's storage and out of the address bar before anything renders, so the
// key never ends up in the history, a bookmark or a shared link (see `lib/hello.ts`).
rememberKeyFromUrl()

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
