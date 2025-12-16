import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  // Whitespace-nowrap: Badges should never wrap.
  "whitespace-nowrap inline-flex items-center rounded-sm border px-2.5 py-0.5 text-xs font-mono font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2" +
  " hover-elevate terminal-text" ,
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground glow-border",
        secondary: "border-transparent bg-secondary text-secondary-foreground border border-border/50",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground glow-border-green",

        outline: "border border-primary/50 text-primary bg-primary/10 glow-border",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants }
