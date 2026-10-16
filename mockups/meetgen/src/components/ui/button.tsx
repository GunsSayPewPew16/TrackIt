import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

/*
 * Every button in this app stands on the page, so the outline and ghost variants
 * are written for it: `on-canvas` text and a veil of the same on hover. The focus
 * ring is the accent, which reads on the page in both themes (4.6:1 dark, 3.0:1
 * light) and on a card in the light theme; the 2px offset leaves the ground it
 * sits on visible either way.
 */
const buttonVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium transition-colors outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tangerine disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-box text-on-box hover:bg-box/85",
        accent: "bg-tangerine text-ink hover:bg-tangerine-hover",
        outline: "border border-on-canvas/25 bg-transparent text-on-canvas hover:bg-on-canvas/10",
        ghost: "bg-transparent text-on-canvas hover:bg-on-canvas/10",
      },
      size: {
        default: "h-10 px-4 [&_svg]:size-4",
        sm: "h-8 px-3 text-xs [&_svg]:size-3.5",
        icon: "size-12 [&_svg]:size-5",
        "icon-lg": "size-14 [&_svg]:size-6",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
