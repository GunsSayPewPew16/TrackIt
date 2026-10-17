/**
 * Join class names, dropping the falsy ones. Every class string in the app is written so
 * that the last utility wins without a merge, which is why there is no `cn` here: the
 * merge would cost its whole weight (`clsx` and `tailwind-merge`, about 28 kB) to do work
 * these strings already avoid.
 */
export const join = (...parts: (string | false | null | undefined)[]): string => parts.filter(Boolean).join(" ")
