import { motion, type Variants } from "framer-motion"
import { ArrowRight, Loader2 } from "lucide-react"
import { useMemo, useState, type FormEvent, type ReactNode } from "react"

import { ThemeToggle } from "@/components/ThemeToggle"
import { useAuth } from "@/hooks/useAuth"
import { useTheme } from "@/hooks/useTheme"
import { join } from "@/lib/classes"
import { lightTap, mediumClick } from "@/lib/haptics"

/**
 * The portal, for a build with a Supabase project and no session.
 *
 * **It is the app's own paper, not a second design.** The canvas is the palette's, the fields are
 * the journal lines the entry sheet already draws (a 1px rule, no box, no fill, a 48px line of
 * type, the placeholder in the editorial serif italic and the typed value in the upright
 * structural sans), and the confirm is the same sage capsule as *Add Record*. Signing in is a
 * door in this product, not a product of its own.
 *
 * **The two faces of the header.** "Access your financial" is the reading serif in italic at 60%
 * — the app's quiet voice — and **Vault** is the display face at 100%, which is the one word on
 * the screen that is a thing rather than a sentence. That split is the owner's own request
 * (`Sage & Sandstone`, `Forest Void`), and it is the same pairing the greeting and the ledger's
 * titles use.
 *
 * **States are words, never spinners.** A refusal is a sentence under the fields ("That email and
 * password don't match."), a sign-up that needs confirming says so, and the button only carries a
 * turning mark while the request is in flight — a login screen that leaves the button looking
 * unchanged is the one thing that makes people press it twice.
 *
 * **A third factor has a place here when it is wanted.** The owner asked for "email, password and
 * a secret code", and the code is still undecided; when it is, it is one more `JournalLine`
 * between the password and the button, and one more check in `signIn` — nothing about this layout
 * has to move for it.
 */

const REVEAL: Variants = {
  hidden: {},
  show: { transition: { delayChildren: 0.08, staggerChildren: 0.06 } },
}

const ROW: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" } },
}

/**
 * One hairline-ruled field: a label, then 48px of type over a 1px rule.
 *
 * The label is the same 10px letterspaced caption the scanner uses for its manual field, because
 * a field on this screen is asking the same kind of question. `type` is passed through rather
 * than branched on, so the password field is a real password field (autofill, paste-blocking in
 * the right places, the platform's own reveal control).
 */
function Line({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  autoComplete,
  hint,
  adorned,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder: string
  type?: string
  autoComplete?: string
  hint?: ReactNode
  adorned?: boolean
}) {
  const typed = value.length > 0
  return (
    <div className="border-b border-line transition-colors focus-within:border-sage">
      <div className="flex items-center justify-between">
        <label
          htmlFor={`portal-${label.replace(/\s+/g, "-").toLowerCase()}`}
          className="text-[10px] leading-4 font-bold tracking-[0.03em] text-ink2 uppercase"
        >
          {label}
        </label>
        {hint}
      </div>
      <div className="flex items-center">
        <input
          id={`portal-${label.replace(/\s+/g, "-").toLowerCase()}`}
          aria-label={label}
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onFocus={lightTap}
          placeholder={placeholder}
          autoComplete={autoComplete}
          autoCapitalize="none"
          spellCheck={false}
          className={join(
            "h-12 w-full bg-transparent text-[15px] leading-6 text-ink outline-none",
            adorned && "pr-2",
            typed
              ? "font-sans font-normal not-italic"
              : "font-editorial italic placeholder:text-ink2 placeholder:opacity-60",
          )}
        />
      </div>
    </div>
  )
}

export function LoginScreen() {
  const { signIn, signUp, resetPassword, error, notice } = useAuth()
  // The palette switch is on this screen too: the vault is entered in whichever canvas the
  // owner last chose, and a signed-out screen with no way back to it would be a different app.
  const { theme, toggleTheme } = useTheme()
  const [creating, setCreating] = useState(false)
  const [fullName, setFullName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)

  /** Both halves, before the button will do anything: an empty press cannot explain itself. */
  const ready = useMemo(
    () => email.trim().includes("@") && password.length >= 8 && (!creating || fullName.trim().length > 0),
    [email, password, creating, fullName],
  )

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!ready || busy) return
    mediumClick()
    setBusy(true)
    try {
      if (creating) await signUp(email, password, fullName.trim())
      else await signIn(email, password)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-dvh w-full flex-col overflow-y-auto bg-canvas px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] text-ink">
      <header className="flex h-12 shrink-0 items-center justify-end">
        <ThemeToggle theme={theme} onToggle={toggleTheme} />
      </header>

      <motion.div
        variants={REVEAL}
        initial="hidden"
        animate="show"
        className="flex flex-1 flex-col justify-center pb-6"
      >
        {/*
          The split header: the sentence in the reading serif's italic at 60%, the noun in the
          display face at full ink. They sit on one paragraph so the line can break where the
          phone decides, rather than at a `<br>` that only looks right at 390px.
        */}
        <motion.h1
          variants={ROW}
          className="text-[34px] leading-[44px] text-ink2"
        >
          <span className="font-editorial italic">Access your financial </span>
          <span className="font-display font-bold tracking-tight-title text-ink">Vault</span>
        </motion.h1>

        <motion.p variants={ROW} className="mt-3 max-w-[32ch] text-[13px] leading-5 text-ink2">
          Your ledger follows you between devices, and stays on this one when the network doesn&apos;t.
        </motion.p>

        <form onSubmit={submit} className="mt-10">
          {creating && (
            <Line
              label="Your name"
              value={fullName}
              onChange={setFullName}
              placeholder="Who is this ledger for?..."
              autoComplete="name"
            />
          )}

          <Line
            label="Email"
            value={email}
            onChange={setEmail}
            placeholder="you@bank, or anywhere you read..."
            type="email"
            autoComplete="email"
          />

          <div className="mt-4">
            <Line
              label="Password"
              value={password}
              onChange={setPassword}
              placeholder="At least eight characters..."
              type="password"
              autoComplete={creating ? "new-password" : "current-password"}
            />
          </div>

          {/*
            The two lines under the fields are one slot rather than two: a refusal replaces the
            confirmation, and the layout does not jump when either arrives.
          */}
          <div aria-live="polite" className="mt-4 min-h-10">
            {error && (
              <p role="alert" className="font-editorial text-[13px] leading-5 italic text-clay">
                {error}
              </p>
            )}
            {!error && notice && <p className="text-[13px] leading-5 text-ink2">{notice}</p>}
          </div>

          <button
            type="submit"
            disabled={!ready || busy}
            className="mt-1 flex h-12 w-full items-center justify-center gap-2 rounded-2xl border-0 bg-sage px-4 font-sans text-[14px] leading-5 font-medium tracking-[0.02em] text-on-sage transition-opacity outline-none disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-ink"
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" strokeWidth={1.5} aria-hidden="true" />
            ) : (
              <>
                {creating ? "Create account" : "Sign in"}
                <ArrowRight className="size-4" strokeWidth={1.5} aria-hidden="true" />
              </>
            )}
          </button>

          <div className="mt-5 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => {
                lightTap()
                setCreating((was) => !was)
              }}
              className="border-0 bg-transparent p-0 text-[12px] leading-4 text-ink2 underline decoration-line underline-offset-4"
            >
              {creating ? "I already have an account" : "Create an account"}
            </button>
            {!creating && (
              <button
                type="button"
                onClick={() => {
                  lightTap()
                  if (email.trim().includes("@")) void resetPassword(email)
                }}
                disabled={!email.trim().includes("@")}
                className="border-0 bg-transparent p-0 text-[12px] leading-4 text-ink2 underline decoration-line underline-offset-4 disabled:opacity-40"
              >
                Forgot password?
              </button>
            )}
          </div>
        </form>
      </motion.div>
    </div>
  )
}
