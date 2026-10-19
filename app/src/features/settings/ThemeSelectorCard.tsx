import { AnimatePresence, motion } from "framer-motion"
import { Palette as PaletteIcon } from "lucide-react"
import { useMemo } from "react"
import { RadioGroup } from "radix-ui"

import { lightTap } from "@/lib/haptics"
import { PALETTES, paletteFor, THEME_CHOICES, themeOfPalette, type Palette, type ThemeChoice } from "@/lib/theme"

/**
 * The theme selector: one capsule per theme, each wearing its own two canvases.
 *
 * The design is the owner's (`files (1).zip` → `ThemeSelectorCard.tsx`), kept as drawn and made to
 * speak this app's tokens: a bento tile with a three-column grid of capsules, the one in use
 * outlined and slid into place by a single shared `layoutId` spring, the rest dimmed to 60%, and a
 * line underneath saying which theme is being worn. That line is **Anthropic Serif Text in its
 * roman cut** — label and name together, one sentence of the editorial voice — rather than the
 * italic the app uses for its notes. Each capsule's 24px dot is the theme itself — its dark canvas
 * against its light one, split down the middle — so the list is read as colour before any of the
 * names are read at all.
 *
 * **A theme is a pair, and the dot says so.** `THEME_CHOICES` names each theme once and points at
 * both of its tables (`lib/theme.ts`); choosing one wears the side that matches the mode on screen,
 * and the header's sun/moon flips to the other side of the *same* name. That is why the swatch can
 * be two colours rather than one: there is no such thing here as a dark-only theme.
 *
 * **Radix, not a bare radio group**, for the same reason the month menu uses it: arrow keys move
 * between the capsules and the whole row is one tab stop, which is what a list of mutually
 * exclusive choices should be to a keyboard. It is in this screen's chunk alone — the settings tab
 * is fetched when it is first tapped (`App.tsx`) — so the dashboard still pays for none of it.
 *
 * **Six names, two rows of three.** `THEME_CHOICES` is the order the grid fills in; adding a theme
 * is one row there and its two tables in `index.css`/`lib/theme.ts`, not a change to this file.
 *
 * **The list can also hold the table on screen.** If the document is wearing one no theme owns — a
 * kept table from an older release — the grid would otherwise show nothing selected; it is added
 * rather than hidden, so the control cannot claim a look the screen is not wearing.
 */

const SLIDE = { type: "spring", stiffness: 450, damping: 28 } as const

type Choice = ThemeChoice & { dot: [string, string] }

interface Props {
  /** The table on screen, so the row can say which name is being worn. */
  palette: Palette
  /** Wear a theme (or a bare table) by id — `useTheme`'s own reading of the id decides which. */
  onChooseTheme: (id: string) => void
}

export function ThemeSelectorCard({ palette, onChooseTheme }: Props) {
  /** The register, plus the table on screen when no name owns it. */
  const choices = useMemo<Choice[]>(() => {
    const named = themeOfPalette(palette.id)
    if (named !== null) {
      return THEME_CHOICES.map((choice) => ({
        ...choice,
        dot: [canvasOf(choice.dark), canvasOf(choice.light)],
      }))
    }
    return [
      ...THEME_CHOICES.map((choice) => ({
        ...choice,
        dot: [canvasOf(choice.dark), canvasOf(choice.light)] as [string, string],
      })),
      {
        id: palette.id,
        label: palette.label,
        title: palette.label,
        dark: palette.id,
        light: palette.id,
        dot: [palette.canvas, palette.canvas],
      },
    ]
  }, [palette])

  const active = themeOfPalette(palette.id)?.id ?? palette.id
  const worn = choices.find((choice) => choice.id === active) ?? choices[0]

  return (
    <section
      className="rounded-[20px] border border-line bg-card p-4"
      aria-labelledby="settings-theme-heading"
    >
      <h2
        id="settings-theme-heading"
        className="flex items-center gap-2 text-[10px] leading-4 font-bold tracking-[0.03em] text-ink2 uppercase"
      >
        <PaletteIcon strokeWidth={1.5} className="size-4" aria-hidden="true" />
        Theme
      </h2>

      <RadioGroup.Root
        value={active}
        onValueChange={(next) => {
          lightTap() // must run synchronously inside the tap for iOS
          onChooseTheme(next)
        }}
        aria-label="Theme"
        className="mt-3 grid grid-cols-3 gap-2"
      >
        {choices.map((choice) => {
          const on = choice.id === active
          return (
            <RadioGroup.Item key={choice.id} value={choice.id} asChild>
              <motion.button
                type="button"
                whileTap={{ scale: 0.96 }}
                animate={{ opacity: on ? 1 : 0.6 }}
                transition={SLIDE}
                className="relative flex h-12 min-w-0 items-center gap-2 rounded-full px-2 text-left font-sans text-[12px] leading-4 text-ink outline-none focus-visible:ring-2 focus-visible:ring-ink"
              >
                {on && (
                  <motion.span
                    layoutId="activeThemeOverlay"
                    transition={SLIDE}
                    aria-hidden="true"
                    className="absolute inset-0 rounded-full border border-sage bg-canvas"
                  />
                )}
                {/*
                  The theme itself: **its two dominant colours**, which are the two
                  grounds it is worn on — the dark side's canvas against the light side's,
                  split down the middle.

                  The halves are divided by a hairline as well as by their own difference,
                  because on the *selected* capsule one of them can be the same colour as
                  the fill behind it (the overlay is the palette's own canvas when the dark
                  side is worn, and that is exactly what the left half is painted): without
                  the divider the swatch reads as one colour with a crescent cut out of it.
                */}
                <span
                  aria-hidden="true"
                  className="relative z-10 flex size-6 shrink-0 overflow-hidden rounded-full border border-line"
                >
                  <span
                    className="flex-1 border-r border-line"
                    style={{ background: choice.dot[0] }}
                  />
                  <span className="flex-1" style={{ background: choice.dot[1] }} />
                </span>
                <span className="relative z-10 truncate">{choice.label}</span>
              </motion.button>
            </RadioGroup.Item>
          )
        })}
      </RadioGroup.Root>

      {/*
        The caption is one sentence in two cuts: the label in Anthropic Serif Text's roman,
        the theme's name in its **italic**, so the word that changes is the word that is
        drawn differently. The label is the app's own two words and the name is the owner's
        theme, which is the split the masthead's greeting makes as well.
      */}
      <p className="mt-3 font-editorial text-[13px] leading-5 text-ink2" aria-live="polite">
        Currently Rendering:{" "}
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={worn.id}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="inline-block italic text-ink"
          >
            {worn.title}
          </motion.span>
        </AnimatePresence>
      </p>
    </section>
  )
}

/** The canvas a table paints with — the one colour of it the swatch can show at 12px. */
function canvasOf(id: string): string {
  return paletteFor(id)?.canvas ?? PALETTES[0].canvas
}
