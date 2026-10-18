import { motion, type Variants } from "framer-motion"
import { ArrowRight, Loader2 } from "lucide-react"
import { useMemo, useState, type ClipboardEvent, type FormEvent, type ReactNode } from "react"

import { ThemeToggle } from "@/components/ThemeToggle"
import { useAuth } from "@/hooks/useAuth"
import { useTheme } from "@/hooks/useTheme"
import { join } from "@/lib/classes"
import { lightTap, mediumClick } from "@/lib/haptics"
import { SIGNUPS_OPEN } from "@/lib/portal"

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
 * **Two steps, one screen.** The password is followed by the **six digits Supabase mails**, and
 * the screen does not move between them: the header, the canvas and the confirm's place stay
 * exactly where they were, and only the lines below the paragraph change. That is deliberate —
 * a second page would read as a second product, and the step is a continuation of the same
 * sentence. The code line is set as a code (tabular figures, wide tracking, the numbers centred
 * in the line) because it is not prose.
 *
 * **Two halves of one proof, and either will do.** The digits need the Magic Link body to carry
 * `{{ .Token }}`, which a free-tier project on Supabase's built-in mailer cannot arrange at all
 * (`supabase/README.md` §2) — there the mail carries the link and nothing else. The link opens
 * the same vault (it comes back to this address and `hooks/useAuth.tsx` adopts the session), but
 * **only where a link can be opened**: inside an installed iOS web app it cannot, because that
 * app shares no storage with Safari and a link tapped in Mail goes to Safari. So the field takes
 * the link too, pasted in, and `verifyOtp({ token_hash })` spends it exactly as the link would
 * have — which is the difference between a door that works on a desk and one that works in the
 * app on the phone.
 *
 * **The paste is caught, not typed.** The line takes the code's own width — which is Supabase's
 * setting, not this app's, so it takes up to eight digits and sends them as they arrive — and a
 * link is a hundred characters, so `onPaste` reads the clipboard before the field takes it and
 * hands anything that is not a code to the link path.
 *
 * **States are words, never spinners.** A refusal is a sentence under the fields ("That email and
 * password don't match.", "That code didn't match…"), the button only carries a turning mark
 * while the request is in flight — a login screen that leaves the button looking unchanged is the
 * one thing that makes people press it twice.
 *
 * **Sign-ups are closed** (`lib/portal.ts`): the vault holds the accounts its owner made, so
 * there is no *Create account* line at all, and the sentence under the fields says so. The
 * `VITE_SIGNUP=on` build puts the line back.
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
  inputMode,
  maxLength,
  autoFocus,
  code,
  onPaste,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder: string
  type?: string
  autoComplete?: string
  hint?: ReactNode
  inputMode?: "text" | "numeric"
  maxLength?: number
  autoFocus?: boolean
  /** Draw the value as a code rather than as a word: tabular figures, wide tracking. */
  code?: boolean
  /**
   * Read what is being pasted before the field takes it.
   *
   * The code field is six characters wide because the digits are six long, and a mailed link is
   * a hundred — so the paste is where the link has to be caught, while the whole of it is still
   * in hand. Whether to `preventDefault` is the caller's call: six digits are the field's own
   * business, and a link is not.
   */
  onPaste?: (event: ClipboardEvent<HTMLInputElement>) => void
}) {
  const typed = value.length > 0
  const id = `portal-${label.replace(/\s+/g, "-").toLowerCase()}`
  return (
    <div className="border-b border-line transition-colors focus-within:border-sage">
      <div className="flex items-center justify-between">
        <label
          htmlFor={id}
          className="text-[10px] leading-4 font-bold tracking-[0.03em] text-ink2 uppercase"
        >
          {label}
        </label>
        {hint}
      </div>
      <div className="flex items-center">
        <input
          id={id}
          aria-label={label}
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onFocus={lightTap}
          onPaste={onPaste}
          placeholder={placeholder}
          autoComplete={autoComplete}
          inputMode={inputMode}
          maxLength={maxLength}
          // eslint-disable-next-line jsx-a11y/no-autofocus -- the code step is the only place
          // this is used, and the keyboard belongs in the field the email just asked for.
          autoFocus={autoFocus}
          autoCapitalize="none"
          spellCheck={false}
          className={join(
            "h-12 w-full bg-transparent text-[15px] leading-6 text-ink outline-none",
            typed
              ? "font-sans font-normal not-italic"
              : "font-editorial italic placeholder:text-ink2 placeholder:opacity-60",
            code && typed && "text-[20px] tracking-[0.3em] tabular-nums",
          )}
        />
      </div>
    </div>
  )
}

export function LoginScreen() {
  const {
    signIn,
    signUp,
    verifyCode,
    verifyLink,
    resendCode,
    cancelChallenge,
    resetPassword,
    stage,
    challengeEmail,
    error,
    notice,
  } = useAuth()
  // The palette switch is on this screen too: the vault is entered in whichever canvas the
  // owner last chose, and a signed-out screen with no way back to it would be a different app.
  const { theme, toggleTheme } = useTheme()
  const [creating, setCreating] = useState(false)
  const [fullName, setFullName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [code, setCode] = useState("")
  const [busy, setBusy] = useState(false)

  const askingForCode = stage === "code"

  /** Every half, before the button will do anything: an empty press cannot explain itself. */
  const ready = useMemo(() => {
    // Six is the length this project asks Supabase for, but the code's width is Supabase's
    // setting rather than the app's — and a mail whose code is eight digits long is a code
    // nobody can type if the field insists on six. Anything from six up is taken and sent as
    // it arrived; whether it is right is the server's answer to give.
    if (askingForCode) return code.length >= 6
    return (
      email.trim().includes("@") &&
      password.length >= 8 &&
      (!creating || fullName.trim().length > 0)
    )
  }, [askingForCode, code, email, password, creating, fullName])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!ready || busy) return
    mediumClick()
    setBusy(true)
    try {
      if (askingForCode) await verifyCode(code)
      else if (creating) await signUp(email, password, fullName.trim())
      else await signIn(email, password)
    } finally {
      setBusy(false)
    }
  }

  /**
   * A paste into the code line: six digits stay the field's business, anything else is the link.
   *
   * Only a paste can carry a link in — nobody types a hundred characters — so this is the whole
   * of the link path on the screen, and it is why the field never has to grow: the pasted text is
   * read here, before `maxLength` can cut it down to six.
   */
  const pasted = async (event: ClipboardEvent<HTMLInputElement>) => {
    const text = event.clipboardData.getData("text")
    if (/^\s*\d{6}\s*$/.test(text)) return
    event.preventDefault()
    if (!text.trim() || busy) return
    lightTap()
    setBusy(true)
    try {
      await verifyLink(text)
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
        <motion.h1 variants={ROW} className="text-[34px] leading-[44px] text-ink2">
          <span className="font-editorial italic">Access your financial </span>
          <span className="font-display font-bold tracking-tight-title text-ink">Vault</span>
        </motion.h1>

        <motion.p variants={ROW} className="mt-3 max-w-[32ch] text-[13px] leading-5 text-ink2">
          {askingForCode ? (
            <>
              Check <span className="font-sans text-ink">{challengeEmail}</span>: paste that
              mail&apos;s link here, or type the code it carries.
            </>
          ) : (
            <>Your ledger follows you between devices, and stays on this one when the network doesn&apos;t.</>
          )}
        </motion.p>

        <form onSubmit={submit} className="mt-10">
          {askingForCode ? (
            <Line
              label="Code or link"
              value={code}
              onChange={(next) => setCode(next.replace(/\D/g, "").slice(0, 8))}
              placeholder="From the email we just sent..."
              type="text"
              inputMode="numeric"
              maxLength={8}
              autoComplete="one-time-code"
              autoFocus
              code
              onPaste={pasted}
            />
          ) : (
            <>
              {creating && SIGNUPS_OPEN && (
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
            </>
          )}

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
            {!error && !notice && askingForCode && (
              <p className="font-editorial text-[13px] leading-5 italic text-ink2">
                Whichever arrives, it works once.
              </p>
            )}
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
                {askingForCode ? "Open the vault" : creating ? "Create account" : "Sign in"}
                <ArrowRight className="size-4" strokeWidth={1.5} aria-hidden="true" />
              </>
            )}
          </button>

          {askingForCode ? (
            <div className="mt-5 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => {
                  lightTap()
                  void resendCode()
                }}
                disabled={busy}
                className="border-0 bg-transparent p-0 text-[12px] leading-4 text-ink2 underline decoration-line underline-offset-4 disabled:opacity-40"
              >
                Send another one
              </button>
              <button
                type="button"
                onClick={() => {
                  lightTap()
                  setCode("")
                  void cancelChallenge()
                }}
                className="border-0 bg-transparent p-0 text-[12px] leading-4 text-ink2 underline decoration-line underline-offset-4"
              >
                Use a different account
              </button>
            </div>
          ) : (
            <>
              {/*
                The closed door, as its own line rather than half of the row below it: a
                sentence about how the vault is opened should not have to share 350px with a
                link, and at 360 it would have wrapped mid-address.
              */}
              {!SIGNUPS_OPEN && (
                <p className="mt-5 text-[12px] leading-4 text-ink2">
                  Sign-ups are closed — accounts are made by the owner.
                </p>
              )}
              <div
                className={join(
                  SIGNUPS_OPEN ? "mt-5 flex items-center justify-between gap-3" : "mt-2 flex items-center justify-end",
                )}
              >
                {SIGNUPS_OPEN && (
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
                )}
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
            </>
          )}
        </form>
      </motion.div>
    </div>
  )
}
