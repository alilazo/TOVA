import { lazy, Suspense, useEffect, useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { motion } from "framer-motion"

import type { PlanReview } from "@/features/mission/mission-event-reducer"
import { startTypewriter } from "@/features/mission/typewriter"
import { languageForPath, readProjectFile } from "@/features/projects/project-api"
import {
  isTerminalMissionStatus,
  type MissionStatus,
  type StaffProfile,
} from "@/types/domain"

import { PixelAvatar } from "../staff/PixelAvatar"
import { PlanReviewPanel } from "./PlanReviewPanel"

const MonacoEditor = lazy(() => import("@monaco-editor/react"))
const assemblyDots = ["…", "..", "."]

interface TeamFloorLiveEditorProps {
  staff: StaffProfile[]
  projectId: string | null
  activeFile: string | null
  fileRevision: number
  editorOwnerId: string | null
  hasStarted?: boolean
  missionStatus?: MissionStatus | null
  assemblyRoles?: string[]
  coordinator?: StaffProfile | null
  planReview?: PlanReview | null
  missionId?: string | null
  onPlanError?: (message: string) => void
}

function CoordinatorAssemblyMessage() {
  const [dotIndex, setDotIndex] = useState(0)

  useEffect(() => {
    const interval = window.setInterval(() => {
      setDotIndex((index) => (index + 1) % assemblyDots.length)
    }, 650)
    return () => window.clearInterval(interval)
  }, [])

  return <p>Coordinator is assembling the team{assemblyDots[dotIndex]}</p>
}

export function TeamFloorLiveEditor({
  staff,
  projectId,
  activeFile,
  fileRevision,
  editorOwnerId,
  hasStarted = false,
  missionStatus = null,
  assemblyRoles = [],
  coordinator = null,
  planReview = null,
  missionId = null,
  onPlanError,
}: TeamFloorLiveEditorProps) {
  const [visible, setVisible] = useState("")
  const [isTyping, setIsTyping] = useState(false)
  const visibleRef = useRef("")
  const previousFileRef = useRef<string | null>(activeFile)
  const missionFinished = Boolean(
    missionStatus && isTerminalMissionStatus(missionStatus),
  )
  const owner = missionFinished
    ? undefined
    : staff.find((profile) => profile.id === editorOwnerId)
  const language = activeFile ? languageForPath(activeFile) : "plaintext"
  const assemblyCandidates = assemblyRoles
    .map((roleKey) => staff.find((profile) => profile.roleKey === roleKey))
    .filter((profile): profile is StaffProfile => Boolean(profile))
  const coordinatorName = coordinator?.displayName ?? "Project Coordinator"

  const fileQuery = useQuery({
    queryKey: ["project-file", projectId, activeFile, fileRevision],
    queryFn: () => readProjectFile(projectId!, activeFile!),
    enabled: Boolean(projectId && activeFile),
  })

  useEffect(() => {
    if (previousFileRef.current === activeFile) return
    previousFileRef.current = activeFile
    visibleRef.current = ""
    queueMicrotask(() => {
      setVisible("")
      setIsTyping(false)
    })
  }, [activeFile])

  useEffect(() => {
    if (!fileQuery.isError) return
    queueMicrotask(() => {
      setIsTyping(false)
    })
  }, [fileQuery.isError])

  useEffect(() => {
    if (!activeFile || !fileQuery.data) return undefined

    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) setIsTyping(true)
    })

    const handle = startTypewriter({
      previous: visibleRef.current,
      target: fileQuery.data.content,
      onUpdate: (value) => {
        if (cancelled) return
        visibleRef.current = value
        setVisible(value)
      },
    })

    void handle.done.then(() => {
      if (!cancelled) setIsTyping(false)
    })

    return () => {
      cancelled = true
      handle.cancel()
      queueMicrotask(() => {
        setIsTyping(false)
      })
    }
  }, [activeFile, fileRevision, fileQuery.data])

  if (!projectId) {
    return (
      <section className="team-floor__stage team-floor__stage--empty" aria-label="Live code stage">
        <p>Open a project to show live code.</p>
      </section>
    )
  }

  if (!activeFile) {
    if (missionFinished) {
      return (
        <section className="team-floor__stage team-floor__stage--empty" aria-label="Live code stage">
          <p>Mission finished</p>
        </section>
      )
    }

    if (planReview && missionId) {
      const reviewKey = [
        planReview.interpretation,
        ...planReview.assignments.map(
          (item) => `${item.staffRole}:${item.rationale}:${item.sequence}`,
        ),
      ].join("|")
      return (
        <PlanReviewPanel
          key={reviewKey}
          missionId={missionId}
          planReview={planReview}
          onError={onPlanError}
        />
      )
    }

    if (hasStarted && assemblyCandidates.length > 0) {
      return (
        <section className="team-floor__stage team-floor__stage--assembly" aria-label="Live code stage">
          <small>TEAM ASSEMBLY</small>
          <strong>{coordinatorName} is selecting the team</strong>
          <p>These roles are being assembled for the active mission.</p>
          <ul className="team-floor__assembly-list">
            {assemblyCandidates.map((candidate) => (
              <li key={candidate.id}>
                <PixelAvatar avatar={candidate.avatar} name={candidate.displayName} size="md" />
                <span>
                  <strong>{candidate.displayName}</strong>
                  <small>{candidate.role}</small>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )
    }

    if (hasStarted) {
      return (
        <section className="team-floor__stage team-floor__stage--empty" aria-label="Live code stage">
          <CoordinatorAssemblyMessage />
        </section>
      )
    }

    return (
      <section className="team-floor__stage team-floor__stage--empty" aria-label="Live code stage">
        <p>Waiting for the first file write</p>
      </section>
    )
  }

  return (
    <section className="team-floor__stage" aria-label="Live code stage">
      <div className="team-floor__stage-code">
        <motion.header
          key={activeFile}
          className="team-floor__stage-header"
          initial={{ opacity: 0, y: 3 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
        >
          <span>
            <small>ACTIVE FILE</small>
            <strong>{activeFile}</strong>
          </span>
          {missionFinished ? (
            <span className="team-floor__stage-writing">Mission finished</span>
          ) : owner && isTyping ? (
            <span className="team-floor__stage-writing">
              <i aria-hidden="true" />
              {owner.displayName} is writing...
            </span>
          ) : (
            <span className="team-floor__stage-writing">Watching file writes</span>
          )}
        </motion.header>
        <div className="team-floor__stage-editor">
          {fileQuery.isLoading ? (
            <div className="editor-loading" role="status">Loading file...</div>
          ) : fileQuery.error ? (
            <p className="team-floor__stage-message" role="alert">
              {fileQuery.error.message}
            </p>
          ) : (
            <Suspense fallback={<div className="editor-loading" role="status">Loading editor...</div>}>
              <MonacoEditor
                path={activeFile}
                language={language}
                value={visible}
                theme="vs"
                options={{
                  readOnly: true,
                  domReadOnly: true,
                  minimap: { enabled: false },
                  fontFamily: "'JetBrains Mono', 'Cascadia Code', monospace",
                  fontSize: 12.5,
                  lineHeight: 20,
                  padding: { top: 14 },
                  scrollBeyondLastLine: false,
                  renderLineHighlight: "gutter",
                  overviewRulerBorder: false,
                  foldingHighlight: false,
                  guides: { indentation: false },
                  wordWrap: "on",
                  automaticLayout: true,
                }}
              />
            </Suspense>
          )}
        </div>
      </div>
    </section>
  )
}
