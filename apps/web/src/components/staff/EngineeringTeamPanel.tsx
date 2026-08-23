import { type ReactNode, useState } from "react"
import { MoreHorizontal, Users } from "lucide-react"
import { AnimatePresence, motion } from "framer-motion"

import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { StaffProfile } from "@/types/domain"

import { StaffProfileDialog } from "./StaffProfileDialog"
import { TeamMemberCard } from "./TeamMemberCard"

interface EngineeringTeamPanelProps {
  staff: StaffProfile[]
  onSelectStaff: (staffId: string) => void
  isLoading?: boolean
  error?: Error | null
  missionControls?: ReactNode
}

export function EngineeringTeamPanel({
  staff,
  onSelectStaff,
  isLoading = false,
  error = null,
  missionControls = null,
}: EngineeringTeamPanelProps) {
  const [profileStaffId, setProfileStaffId] = useState<string | null>(null)
  const [availabilityOverrides, setAvailabilityOverrides] = useState<Record<string, boolean>>({})
  const profileStaff = staff.find((member) => member.id === profileStaffId) ?? null

  return (
    <aside className="engineering-team" aria-label="Engineering Team">
      <header className="panel-header">
        <span>
          <strong>Engineering Team</strong>
          <small><Users aria-hidden="true" /> {staff.length} team members</small>
        </span>
        <Button variant="ghost" size="icon-xs" aria-label="Team menu">
          <MoreHorizontal />
        </Button>
      </header>
      <ScrollArea className="engineering-team__scroll">
        <div className="engineering-team__list">
          {isLoading ? (
            <p role="status">Loading staff profiles…</p>
          ) : error ? (
            <p role="alert">{error.message}</p>
          ) : staff.length === 0 ? (
            <p role="status">No staff profiles available.</p>
          ) : (
            <AnimatePresence initial={false}>
              {staff.map((member, index) => (
                <motion.div
                  key={member.id}
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: Math.min(index * 0.03, 0.2) }}
                >
                  <TeamMemberCard
                    staff={member}
                    available={availabilityOverrides[member.id] ?? member.status !== "offline"}
                    onOpenProfile={() => setProfileStaffId(member.id)}
                    onOpenWorkLog={() => onSelectStaff(member.id)}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </div>
      </ScrollArea>
      {missionControls}
      {profileStaff && (
        <StaffProfileDialog
          staff={profileStaff}
          open
          available={availabilityOverrides[profileStaff.id] ?? profileStaff.status !== "offline"}
          onAvailableChange={(available) => {
            setAvailabilityOverrides((current) => ({
              ...current,
              [profileStaff.id]: available,
            }))
          }}
          onOpenChange={(open) => {
            if (!open) setProfileStaffId(null)
          }}
        />
      )}
    </aside>
  )
}
