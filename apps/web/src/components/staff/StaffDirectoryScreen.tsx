import { useEffect, useMemo, useState } from "react"
import { motion, useReducedMotion } from "framer-motion"
import { Bot, Search } from "lucide-react"

import { Input } from "@/components/ui/input"
import type { StaffProfile } from "@/types/domain"

import { PixelAvatar } from "./PixelAvatar"
import { StaffProfileDialog } from "./StaffProfileDialog"

export interface StaffDirectoryScreenProps {
  staff: StaffProfile[]
  isLoading?: boolean
  error?: Error | null
}

const openedInSession = { current: false }

function searchableText(staff: StaffProfile): string {
  return [
    staff.displayName,
    staff.name,
    staff.role,
    staff.roleKey,
    staff.department,
    staff.seniority,
    staff.description,
    staff.status,
    ...staff.tags,
  ].join(" ").toLowerCase()
}

function statusLabel(status: StaffProfile["status"]): string {
  return status.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase())
}

export function StaffDirectoryScreen({
  staff,
  isLoading = false,
  error = null,
}: StaffDirectoryScreenProps) {
  const reduceMotion = useReducedMotion()
  const [query, setQuery] = useState("")
  const [profileStaffId, setProfileStaffId] = useState<string | null>(null)
  const [availabilityOverrides, setAvailabilityOverrides] = useState<Record<string, boolean>>({})
  const [shouldDrop] = useState(() => !openedInSession.current)
  const shouldAnimateDrop = shouldDrop && !reduceMotion
  const badgeLiftMotion = reduceMotion ? undefined : { y: -2 }

  useEffect(() => {
    if (shouldDrop) openedInSession.current = true
  }, [shouldDrop])

  const normalizedQuery = query.trim().toLowerCase()
  const visibleStaff = useMemo(() => {
    if (!normalizedQuery) return staff
    return staff.filter((member) => searchableText(member).includes(normalizedQuery))
  }, [normalizedQuery, staff])
  const profileStaff = staff.find((member) => member.id === profileStaffId) ?? null

  return (
    <section className="staff-directory" aria-labelledby="staff-directory-title">
      <header className="staff-directory__header">
        <span>
          <p className="staff-directory__eyebrow">HiPo Staff</p>
          <h1 id="staff-directory-title" className="staff-directory__title">
            <Bot aria-hidden="true" />
            HiPo Staff
          </h1>
          <p>Browse the local workforce layer.</p>
        </span>
        <strong>
          {normalizedQuery
            ? `${visibleStaff.length} of ${staff.length} shown`
            : `${staff.length} ${staff.length === 1 ? "staff profile" : "staff profiles"}`}
        </strong>
      </header>

      <label className="staff-directory__search">
        <Search aria-hidden="true" />
        <span className="sr-only">Search staff</span>
        <Input
          type="search"
          role="searchbox"
          aria-label="Search staff"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search names, roles, tags..."
        />
      </label>

      {isLoading ? (
        <p className="staff-directory__state" role="status">
          Loading staff profiles...
        </p>
      ) : error ? (
        <p className="staff-directory__state" role="alert">
          Staff profiles are unavailable.
        </p>
      ) : staff.length === 0 ? (
        <p className="staff-directory__state" role="status">
          No staff profiles are available.
        </p>
      ) : profileStaff ? null : visibleStaff.length === 0 ? (
        <p className="staff-directory__state">No staff match that search.</p>
      ) : (
        <div className="staff-directory__grid">
          {visibleStaff.map((member, index) => {
            const available = availabilityOverrides[member.id] ?? member.status !== "offline"
            return (
              <motion.button
                key={member.id}
                type="button"
                className="staff-badge-card"
                aria-label={`Open ${member.displayName} profile`}
                initial={shouldAnimateDrop ? { opacity: 0, y: -28, rotate: -1 } : false}
                animate={shouldAnimateDrop ? { opacity: 1, y: 0, rotate: 0 } : { opacity: 1 }}
                whileFocus={badgeLiftMotion}
                whileHover={badgeLiftMotion}
                transition={{
                  delay: shouldAnimateDrop ? Math.min(index * 0.04, 0.28) : 0,
                  duration: 0.24,
                }}
                onClick={() => setProfileStaffId(member.id)}
              >
                <span className="staff-badge-card__clip" aria-hidden="true" />
                <span className="staff-badge-card__name-strip">{member.displayName}</span>
                <span className="staff-badge-card__portrait">
                  <PixelAvatar avatar={member.avatar} name={member.displayName} size="lg" />
                </span>
                <span className="staff-badge-card__copy">
                  <strong>{member.role}</strong>
                  <span>{member.description}</span>
                </span>
                <span className="staff-badge-card__footer">
                  <strong>HiPo Staff</strong>
                  <span>{available ? "Available" : statusLabel(member.status)}</span>
                </span>
              </motion.button>
            )
          })}
        </div>
      )}

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
    </section>
  )
}
