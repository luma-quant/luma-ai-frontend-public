import apiClient from '@/src/api/apiClient';
import * as React from "react"
import { cn } from "./Dialog"

export interface StatusIndicatorProps extends React.HTMLAttributes<HTMLDivElement> {
  status?: 'success' | 'warning' | 'error' | 'active' | 'inactive'
  showLabel?: boolean
  label?: string
}

function StatusIndicator({ className, status = 'active', showLabel = false, label, ...props }: StatusIndicatorProps) {
  const colors = {
    success: "bg-status-success",
    warning: "bg-status-warning",
    error: "bg-status-error",
    active: "bg-accent-cyan",
    inactive: "bg-surface-secondary"
  }
  
  const textColors = {
    success: "text-status-success",
    warning: "text-status-warning",
    error: "text-status-error",
    active: "text-accent-cyan",
    inactive: "text-text-muted"
  }

  const defaultLabels = {
    success: "Completed",
    warning: "Warning",
    error: "Error",
    active: "Active",
    inactive: "Inactive"
  }

  return (
    <div className={cn("inline-flex items-center gap-2", className)} {...props}>
      <span className="relative flex h-2.5 w-2.5">
        {(status === 'active' || status === 'success') && (
          <span className={cn("animate-ping absolute inline-flex h-full w-full rounded-full opacity-75", colors[status])} />
        )}
        <span className={cn("relative inline-flex rounded-full h-2.5 w-2.5", colors[status])} />
      </span>
      {showLabel && (
        <span className={cn("text-xs font-mono uppercase tracking-widest", textColors[status])}>
          {label || defaultLabels[status]}
        </span>
      )}
    </div>
  )
}

export { StatusIndicator }
