import { Filter, Search } from "lucide-react"
import { AnimatePresence, motion } from "framer-motion"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { missionStatusLabel } from "@/features/mission/mission-status-label"
import type { ActivityItem, MissionStatus, StaffProfile } from "@/types/domain"

import { ActivityFeedRow } from "./ActivityFeedRow"

interface ActivityFeedProps {
  events: ActivityItem[]
  staff: StaffProfile[]
  missionStatus?: MissionStatus | null
  hasStarted?: boolean
}

export function ActivityFeed({
  events,
  staff,
  missionStatus = null,
  hasStarted = false,
}: ActivityFeedProps) {
  const label = missionStatusLabel(hasStarted ? missionStatus : null)

  return (
    <section className="activity-feed" aria-label="Live Activity">
      <header className="panel-header">
        <span>
          <strong>Live Activity</strong>
          <small>
            <span
              className="activity-feed__status"
              data-status={label.toLowerCase().replaceAll(" ", "-")}
              role="status"
              aria-live="polite"
            >
              {label}
            </span>
            {" · "}
            {events.length} mission events
          </small>
        </span>
        <div className="activity-feed__tools">
          <div className="activity-feed__search">
            <Search aria-hidden="true" />
            <Input aria-label="Filter activity by file or employee" placeholder="Filter activity" />
          </div>
          <Button variant="ghost" size="icon-xs" aria-label="Activity filters">
            <Filter />
          </Button>
        </div>
      </header>
      <ScrollArea className="activity-feed__scroll">
        <div className="activity-feed__rows">
          <AnimatePresence initial={false}>
            {[...events].reverse().map((event) => (
              <motion.div
                key={event.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                <ActivityFeedRow
                  event={event}
                  staff={staff.find((profile) => profile.id === event.staffId)}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </ScrollArea>
    </section>
  )
}
