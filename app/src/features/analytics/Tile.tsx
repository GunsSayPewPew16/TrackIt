import type { HTMLAttributes } from "react"

import { join } from "@/lib/classes"

/** A bento tile: a 20px radius, a hairline, and the card's own 16px padding. No shadows. */
export function Tile({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={join("rounded-[20px] border border-line bg-card p-4", className)} {...props} />
}

export const tileTitle = "font-display text-lg font-medium leading-6 tracking-[-0.01em]"
