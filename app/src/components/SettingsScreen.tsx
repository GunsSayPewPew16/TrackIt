import { motion, type Variants } from "framer-motion"
import { LogOut } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { ThemeToggle } from "@/components/ThemeToggle"
import { ThemeSelectorCard } from "@/features/settings/ThemeSelectorCard"
import { useAuth } from "@/hooks/useAuth"
import { pendingWrites, subscribeSync } from "@/lib/cloud"
import { join } from "@/lib/classes"
import { lightTap, mediumClick } from "@/lib/haptics"
import { OWNER_NAME } from "@/lib/owner"
import type { Palette, Theme } from "@/lib/theme"

/**
 * Screen 4: the Settings tab.
 *
 * Three things live here, and they are the three the app has nowhere else to put: **the name the
 * greeting says**, **the theme**, and **the way out of the account**.
 *
 * **The name belongs to the account, and to the device when there is no account.** One field, one
 * action (`useAuth().rename`): with an account it writes `profiles.full_name`, so every device
 * greets the same person; on a build with no account it writes this browser's own name
 * (`lib/owner.ts`). The field is seeded with what the greeting is currently saying — including
 * `OWNER_NAME`, the name a device-only build starts with — so what is on screen is what is saved
 * rather than a guess at it. It is saved on blur and on Enter rather than per keystroke: every
 * other letter would be a request.
 *
 * **The theme is the owner's swatch grid** (`features/settings/ThemeSelectorCard.tsx`): one capsule
 * per theme — Archival, Kyoto, Alpine, Tuscany, Monaco, Nordic — with the theme's own two canvases in the
 * dot. A name there is a *pair* of tables (`lib/theme.ts`), so choosing one wears the side that
 * matches the mode on screen, and the header's sun/moon then flips between that theme's two sides
 * rather than between the app's defaults.
 *
 * **Sign out is here now.** It used to be behind the name in the greeting — the dashboard has one
 * 28px line and a toggle, and a third control there would have shortened the greeting. A tab of
 * its own is a better home for it than a name that does not look like a button: nothing on the
 * dashboard is a control that ends a session. What the panel used to say before it offered the
 * door is said here too, and for the same reason — signing out is the one action that can separate
 * a row from the account it belongs to, so the screen states whether anything is still waiting to
 * go up before the button is pressed.
 *
 * **A build with no account draws no door.** `mode` is `"device"` when this build has no Supabase
 * project (or `VITE_CLOUD=off`): there is no session to end, so the block says what this ledger is
 * instead of offering a Sign out that could only do nothing.
 */

/** What this screen is given. Named and exported because the screen is fetched, not imported. */
export type Props = {
  theme: Theme
  onToggleTheme: () => void
  /** The table on screen, so the dropdown can say which name is being worn. */
  palette: Palette
  /** Wear a theme (or a bare table) by id — `useTheme`'s own reading of the id decides which. */
  onChooseTheme: (id: string) => void
}

const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
}
const rise: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } },
}

/** The label every block on this screen wears. One size, one tracking, three headings. */
const heading = "text-[10px] leading-4 font-bold tracking-[0.03em] text-ink2 uppercase"
/** The sentence under a heading, in the editorial italic the app explains things in. */
const note = "mt-1 font-editorial text-[12px] leading-5 italic text-ink2"

/** How many writes the account is still holding, kept current as the queue drains. */
function useWaitingWrites(): number {
  const [waiting, setWaiting] = useState(() => pendingWrites())
  useEffect(() => subscribeSync(() => setWaiting(pendingWrites())), [])
  return waiting
}

type Saved = "idle" | "saving" | "saved" | "failed"

export function SettingsScreen({ theme, onToggleTheme, palette, onChooseTheme }: Props) {
  const { mode, name, email, rename, signOut } = useAuth()
  const waiting = useWaitingWrites()
  const deviceOnly = mode === "device"

  /**
   * What the greeting says, as the field's own text. Seeded once and then owned by the field,
   * because a save round-trip must not pull the caret back to what the server had a moment ago.
   */
  const [draft, setDraft] = useState(() => name ?? OWNER_NAME)
  const [saved, setSaved] = useState<Saved>("idle")
  /** What was written last, so pressing the field's own save twice is not two requests. */
  const written = useRef(name ?? OWNER_NAME)

  const save = async () => {
    const next = draft.trim()
    // An empty field is not a name — the greeting keeps the one it has, and the field is put back
    // to it rather than left looking saved.
    if (next.length === 0) {
      setDraft(written.current)
      setSaved("idle")
      return
    }
    // Nothing new to write: a second blur after a save is not a second request, and a failed one
    // is retried because `written` still holds the old name.
    if (next === written.current) return
    setSaved("saving")
    const ok = await rename(next)
    if (ok) written.current = next
    setSaved(ok ? "saved" : "failed")
  }

  return (
    <motion.main
      variants={stagger}
      initial="hidden"
      animate="show"
      className="mx-auto flex w-full max-w-[390px] flex-col gap-4 px-4 pt-6 pb-nav"
    >
      <motion.header variants={rise} className="flex items-start justify-between">
        <h1 className="font-serif text-[28px] leading-8 tracking-[-0.01em]">
          <span className="block font-normal text-ink2 italic">Your</span>
          <span className="block font-medium">Settings</span>
        </h1>
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
      </motion.header>

      {/* The name the greeting says. */}
      <motion.section
        variants={rise}
        className="rounded-[20px] border border-line bg-card p-4"
        aria-labelledby="settings-name-heading"
      >
        <h2 id="settings-name-heading" className={heading}>
          Your name
        </h2>
        <p className={note}>
          {deviceOnly
            ? "The greeting says this. This build has no account, so the name is kept in this browser."
            : "The greeting says this, and it belongs to the account — every device you sign in on says it too."}
        </p>
        <div className="mt-3 border-b border-line transition-colors focus-within:border-sage">
          <input
            id="settings-name"
            aria-label="Your name"
            type="text"
            value={draft}
            autoComplete="name"
            enterKeyHint="done"
            placeholder={OWNER_NAME}
            onChange={(event) => {
              setDraft(event.target.value)
              setSaved("idle")
            }}
            onFocus={lightTap}
            onBlur={() => void save()}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.currentTarget.blur() // the blur is what saves
              }
            }}
            className="h-12 w-full bg-transparent font-sans text-[15px] leading-6 text-ink outline-none placeholder:font-editorial placeholder:italic placeholder:text-ink2 placeholder:opacity-60"
          />
        </div>
        <p
          role="status"
          aria-live="polite"
          className={join(
            "mt-1 h-4 text-[12px] leading-4",
            saved === "failed" ? "text-clay" : "text-ink2",
          )}
        >
          {saved === "saving" && "Saving…"}
          {saved === "saved" && "Saved."}
          {saved === "failed" && "That name could not be saved — check the connection and try again."}
        </p>
      </motion.section>

      {/* The theme, as the owner's swatch row: a capsule per name, and the pair inside the dot. */}
      <motion.div variants={rise}>
        <ThemeSelectorCard palette={palette} onChooseTheme={onChooseTheme} />
      </motion.div>

      {/* Who is signed in, what is still waiting, and the door. */}
      <motion.section
        variants={rise}
        className="rounded-[20px] border border-line bg-card p-4"
        aria-labelledby="settings-account-heading"
      >
        <h2 id="settings-account-heading" className={heading}>
          {deviceOnly ? "On this device" : "Signed in as"}
        </h2>
        {deviceOnly ? (
          <>
            <p className="mt-1 text-[15px] leading-6 text-ink">No account</p>
            <p className={note}>
              The ledger is kept in this browser. There is no account to sign out of in this build.
            </p>
          </>
        ) : (
          <>
            <p className="mt-1 text-[15px] leading-6 text-ink">{name ?? "This vault"}</p>
            {email && <p className="mt-0.5 truncate text-[12px] leading-4 text-ink2">{email}</p>}

            <div className="mt-4 flex items-baseline justify-between gap-3 border-t border-line pt-3">
              <span className={heading}>Sync</span>
              <span className="text-right text-[13px] leading-5 text-ink" aria-live="polite">
                {waiting === 0
                  ? "Everything is on the server"
                  : `${waiting} ${waiting === 1 ? "change" : "changes"} waiting`}
              </span>
            </div>
            <p className={note}>
              {waiting === 0
                ? "This phone also keeps a copy, so the ledger opens without a signal."
                : "They stay on this phone and go up the next time you sign in — signing out now loses nothing."}
            </p>

            <button
              type="button"
              onClick={() => {
                mediumClick()
                void signOut()
              }}
              className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-line bg-transparent px-4 font-sans text-[14px] leading-5 font-medium tracking-[0.02em] text-ink outline-none transition-opacity focus-visible:ring-2 focus-visible:ring-ink"
            >
              <LogOut className="size-4" strokeWidth={1.5} aria-hidden="true" />
              Sign out
            </button>
          </>
        )}
      </motion.section>
    </motion.main>
  )
}
