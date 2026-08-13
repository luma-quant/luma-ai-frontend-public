import apiClient from '@/src/api/apiClient';
import * as React from "react"
import { cn } from "./Dialog"

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'cyan' | 'magenta' | 'outline'
}

function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  const variants = {
    default: "bg-surface-secondary text-text-primary border-border-subtle",
    cyan: "bg-accent-cyan/10 text-accent-cyan border-accent-cyan/20",
    magenta: "bg-accent-magenta/10 text-accent-magenta border-accent-magenta/20",
    outline: "bg-transparent text-text-muted border-border-subtle"
  }

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-mono font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-accent-cyan focus:ring-offset-2",
        variants[variant],
        className
      )}
      {...props}
    />
  )
}

export { Badge }
