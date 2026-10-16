/**
 * The two words the greeting is made of, and the only strings in the app that are
 * neither data nor design.
 *
 * The artboard greets a "Alex" with the time of day, and neither half of that can be
 * derived: a Wallet export carries no account holder's name, and "Good morning" was a
 * line the owner has since replaced with a fixed one. So both halves live here, alone,
 * so that changing the greeting is a one-line change in one file and the demo content
 * and the derived content read it from the same place.
 *
 * They are also two different drawings of one family — see `index.css`: the word is
 * set in Anthropic Serif Display's Medium Italic and the name in its Medium roman, so
 * they belong together here rather than in the screen that happens to draw them.
 */

/** Whose name the greeting says. */
export const OWNER_NAME = "Priyansh"

/**
 * The word in front of it, comma included — the comma is set in the italic cut with
 * the word, where it picks up the same angle, rather than in the roman behind it.
 */
export const GREETING_WORD = "Hello,"
