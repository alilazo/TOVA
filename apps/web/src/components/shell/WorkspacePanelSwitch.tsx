import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import type { ReactNode } from "react"

export type WorkspacePanelKey = "team-floor" | "staff" | "settings" | "workspace"

interface WorkspacePanelSwitchProps {
  panelKey: WorkspacePanelKey
  children: ReactNode
}

export function WorkspacePanelSwitch({
  panelKey,
  children,
}: WorkspacePanelSwitchProps) {
  const reduceMotion = useReducedMotion()
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={panelKey}
        className="workspace-panel-switch"
        initial={reduceMotion ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={reduceMotion ? undefined : { opacity: 0, y: -6 }}
        transition={{ duration: 0.22, ease: "easeOut" }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}
