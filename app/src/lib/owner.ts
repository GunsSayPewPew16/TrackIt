/**
 * Whose name the greeting says.
 *
 * The artboard greets a "Alex", and the owner's name is nowhere in the data — a Wallet
 * export carries no account holder's name, and neither does the CSV it can write — so
 * this is the one string in the app that is neither data nor design. It is here, alone,
 * so that changing it is a one-line change in one file.
 *
 * Only the name: the word in front of it is a different language every time the app is
 * opened, so the greetings live together in `lib/greetings.ts`, and `hooks/useGreeting.ts`
 * is what puts the two halves on one line.
 */

export const OWNER_NAME = "Priyansh"
