import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center gap-1 rounded-[4px] border px-1.5 py-0.5 text-[10px] font-medium tracking-wide whitespace-nowrap uppercase",
  {
    variants: {
      variant: {
        /* Solid and loud: the same job as the buttons' `default`. */
        default: "border-box bg-box text-on-box",
        /* A hairline chip for a tag inside a card, where ink is always right. */
        outline: "border-ink/30 bg-transparent text-ink",
        accent: "border-tangerine bg-tangerine text-ink",
        /* A quiet chip for the page itself, where the ink of `outline` would be
           lost on the dark canvas. */
        canvas: "border-on-canvas/25 bg-transparent text-on-canvas/75",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
)

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
