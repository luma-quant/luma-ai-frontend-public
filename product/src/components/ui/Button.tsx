import apiClient from '@/src/api/apiClient';
import * as React from "react"
import { cn } from "./Dialog"

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'destructive'
  size?: 'sm' | 'md' | 'lg'
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', ...props }, ref) => {
    
    const variants = {
      primary: "bg-accent-cyan text-canvas hover:bg-[#33F3FF] shadow-glow-cyan",
      secondary: "bg-surface-secondary text-text-primary border border-border-subtle hover:bg-surface-hover hover:border-border-active",
      ghost: "bg-transparent text-text-secondary hover:bg-surface-primary hover:text-text-primary",
      destructive: "bg-transparent text-status-error border border-status-error/30 hover:bg-status-error/10 hover:border-status-error"
    }

    const sizes = {
      sm: "h-8 px-3 text-xs",
      md: "h-10 px-4 py-2",
      lg: "h-12 px-8 text-lg"
    }

    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center rounded-md font-sans font-medium transition-all duration-200 ease-luma focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:pointer-events-none disabled:opacity-50",
          variants[variant],
          sizes[size],
          className
        )}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button }
