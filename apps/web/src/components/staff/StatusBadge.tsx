import { Badge } from "@/components/ui/badge"
import { cn, formatStatus } from "@/lib/utils"

interface StatusBadgeProps {
  status: string
  compact?: boolean
}

export function StatusBadge({ status, compact = false }: StatusBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn("status-badge", `status-badge--${status}`, compact && "status-badge--compact")}
    >
      <span aria-hidden="true" className="status-badge__dot" />
      {formatStatus(status)}
    </Badge>
  )
}
