import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "./index.css"
import ExpenseTracker from "./ExpenseTracker"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ExpenseTracker />
  </StrictMode>,
)
