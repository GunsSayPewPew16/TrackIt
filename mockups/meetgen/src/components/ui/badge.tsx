import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center gap-1 rounded-[4px] border px-1.5 py-0.5 font-mono text-[10px] font-medium tracking-wide whitespace-nowrap uppercase",
  {
    variants: {
      variant: {
        default: "border-ink bg-ink text-cream",
        outline: "border-ink/30 bg-transparent text-ink",
        accent: "border-tangerine bg-tangerine text-ink",
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
