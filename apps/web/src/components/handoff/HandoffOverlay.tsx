import { ArrowRight, FileStack } from "lucide-react"
import { motion, useReducedMotion } from "framer-motion"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { ActiveHandoff, StaffProfile } from "@/types/domain"

import { PixelAvatar } from "../staff/PixelAvatar"

interface HandoffOverlayProps {
  handoff: ActiveHandoff | null
  staff: StaffProfile[]
  onDismiss: () => void
}

export function HandoffOverlay({ handoff, staff, onDismiss }: HandoffOverlayProps) {
  const reduceMotion = useReducedMotion()
  if (!handoff) return null

  const from = staff.find((profile) => profile.id === handoff.fromStaffId)
  const to = staff.find((profile) => profile.id === handoff.toStaffId)
  if (!from || !to) return null

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onDismiss() }}>
      <DialogContent
        className="handoff-overlay"
        showCloseButton={false}
        aria-label={handoff.title}
      >
        <DialogHeader>
          <DialogTitle>{handoff.title}</DialogTitle>
          <DialogDescription>{handoff.summary}</DialogDescription>
        </DialogHeader>
        <div className="handoff-overlay__people">
          <motion.div
            className="handoff-overlay__person"
            animate={reduceMotion ? undefined : { x: -6, opacity: 0.72 }}
          >
            <PixelAvatar avatar={from.avatar} name={from.displayName} size="lg" />
            <strong>{from.displayName}</strong>
            <span>{from.role}</span>
          </motion.div>
          <motion.div
            className="handoff-overlay__document"
            initial={reduceMotion ? false : { opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <FileStack aria-hidden="true" />
            <ArrowRight aria-hidden="true" />
          </motion.div>
          <motion.div
            className="handoff-overlay__person"
            initial={reduceMotion ? false : { x: 12, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
          >
            <PixelAvatar avatar={to.avatar} name={to.displayName} size="lg" />
            <strong>{to.displayName}</strong>
            <span>{to.role}</span>
          </motion.div>
        </div>
        <div className="handoff-overlay__status" role="status">
          <strong>Handing off to {to.displayName}</strong>
          <span>{to.role}</span>
          <small>{handoff.artifactCount} artifacts included</small>
          <small>Accepting work…</small>
        </div>
        <Button variant="ghost" size="sm" onClick={onDismiss}>Dismiss</Button>
      </DialogContent>
    </Dialog>
  )
}
