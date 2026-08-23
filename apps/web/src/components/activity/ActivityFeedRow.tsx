import { FileCode2 } from "lucide-react"

import { formatTime } from "@/lib/utils"
import type { ActivityItem, StaffProfile } from "@/types/domain"

import { PixelAvatar } from "../staff/PixelAvatar"
import { StatusBadge } from "../staff/StatusBadge"

interface ActivityFeedRowProps {
  event: ActivityItem
  staff?: StaffProfile
}

export function ActivityFeedRow({ event, staff }: ActivityFeedRowProps) {
  return (
    <article className="activity-row">
      <time dateTime={event.timestamp}>{formatTime(event.timestamp)}</time>
      {staff ? (
        <PixelAvatar avatar={staff.avatar} name={staff.displayName} size="sm" />
      ) : (
        <span className="activity-row__system" aria-hidden="true">T</span>
      )}
      <div className="activity-row__content">
        <span>{event.title}</span>
        {event.filePath && (
          <button type="button" className="activity-row__file">
            <FileCode2 aria-hidden="true" />
            {event.filePath}
          </button>
        )}
      </div>
      <StatusBadge status={event.status} compact />
    </article>
  )
}
