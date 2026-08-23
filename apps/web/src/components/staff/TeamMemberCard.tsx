import { ChevronRight } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { StaffProfile } from "@/types/domain"
import { cn } from "@/lib/utils"

import { PixelAvatar } from "./PixelAvatar"

interface TeamMemberCardProps {
  staff: StaffProfile
  available: boolean
  onOpenProfile: () => void
  onOpenWorkLog: () => void
}

export function TeamMemberCard({
  staff,
  available,
  onOpenProfile,
  onOpenWorkLog,
}: TeamMemberCardProps) {
  return (
    <article className={cn("team-card", !available && "is-disabled")}>
      <button
        type="button"
        className="team-card__main"
        aria-label={`Open ${staff.displayName} profile`}
        onClick={onOpenProfile}
      >
        <PixelAvatar avatar={staff.avatar} name={staff.displayName} />
        <span className="team-card__identity">
          <strong>{staff.displayName}</strong>
          <span>{staff.role}</span>
        </span>
      </button>
      <Button
        aria-label={`View ${staff.displayName} Work Log`}
        variant="ghost"
        size="icon-xs"
        onClick={onOpenWorkLog}
      >
        <ChevronRight />
      </Button>
    </article>
  )
}
