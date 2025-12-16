import * as React from "react"

import { cn } from "@/lib/utils"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    // h-9 to match icon buttons and default buttons.
    return (
      <input
        type={type}
        className={cn(
          "flex h-9 w-full rounded-sm border border-input bg-background/80 px-3 py-2 text-base font-mono ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:border-primary/50 focus-visible:bg-background/90 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm transition-all duration-200 glow-border",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
