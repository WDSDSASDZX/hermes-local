import type * as React from 'react'

import { cn } from '@/lib/utils'

interface SidebarPanelLabelProps extends React.ComponentProps<'span'> {
  dotClassName?: string
}

export function SidebarPanelLabel({ children, className, dotClassName, ...props }: SidebarPanelLabelProps) {
  return (
    <span
      className={cn(
        'flex min-w-0 items-center pl-2 text-[0.75rem] font-semibold tracking-[-0.01em] text-(--ui-text-tertiary)',
        className
      )}
      {...props}
    >
      {dotClassName && <span aria-hidden="true" className={cn('size-1.5 shrink-0 rounded-full', dotClassName)} />}
      <span className="min-w-0 truncate leading-none">{children}</span>
    </span>
  )
}
