import { useCallback, useEffect, useRef, useState } from "react"

import { websocketUrl } from "@/lib/api"
import { eventEnvelopeSchema, type EventEnvelope } from "@/types/events"

import {
  appendMissionSessionTurn,
  controlMission,
  createMissionSession,
  getMission,
  listMissionEvents,
  type MissionRecord,
  type MissionSessionRecord,
} from "./mission-api"
import {
  createInitialMissionProjection,
  missionEventReducer,
  missionStatusForEvent,
} from "./mission-event-reducer"
import { MISSION_RECOVERY_MESSAGE, recoveryMessageForClose } from "./recovery"

export interface LiveMissionInput {
  request: string
  projectId: string
  modelProfileId: string
  model: string
  teamId?: "hipo"
}

function waitForSocketOpen(socket: WebSocket, timeoutMs = 5_000): Promise<void> {
  if (socket.readyState === WebSocket.OPEN) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup()
      reject(new Error("Mission event stream timed out"))
    }, timeoutMs)
    const onOpen = () => {
      cleanup()
      resolve()
    }
    const onError = () => {
      cleanup()
      reject(new Error("Mission event stream failed to connect"))
    }
    const cleanup = () => {
      window.clearTimeout(timer)
      socket.removeEventListener("open", onOpen)
      socket.removeEventListener("error", onError)
    }
    socket.addEventListener("open", onOpen)
    socket.addEventListener("error", onError)
  })
}

export function useLiveRuntime() {
  const [mission, setMission] = useState<MissionRecord | null>(null)
  const [session, setSession] = useState<MissionSessionRecord | null>(null)
  const [projection, setProjection] = useState(createInitialMissionProjection)
  const [error, setError] = useState<string | null>(null)
  const socketRef = useRef<WebSocket | null>(null)
  const reconnectRef = useRef<number | null>(null)
  const connectRef = useRef<(missionId: string) => Promise<void>>(() => Promise.resolve())
  const missionIdRef = useRef<string | null>(null)
  const lastSequenceRef = useRef(0)

  const clearReconnect = useCallback(() => {
    if (reconnectRef.current !== null) {
      window.clearTimeout(reconnectRef.current)
      reconnectRef.current = null
    }
  }, [])

  const applyEvent = useCallback((event: EventEnvelope) => {
    lastSequenceRef.current = Math.max(lastSequenceRef.current, event.sequence)
    setProjection((current) => missionEventReducer(current, event))
    const nextStatus = missionStatusForEvent(event.event_type)
    if (nextStatus) {
      setMission((current) => (
        current ? { ...current, status: nextStatus } : current
      ))
    }
  }, [])

  const catchUp = useCallback(async (missionId: string) => {
    const events = await listMissionEvents(missionId)
    for (const event of events) {
      if (event.sequence <= lastSequenceRef.current) continue
      applyEvent(event)
    }
  }, [applyEvent])

  const connect = useCallback(async (missionId: string) => {
    clearReconnect()
    missionIdRef.current = missionId
    const previous = socketRef.current
    socketRef.current = null
    if (previous && previous.readyState < WebSocket.CLOSING) {
      previous.onclose = null
      previous.close(1000)
    }

    const socket = new WebSocket(websocketUrl(
      `/api/ws/missions/${missionId}?after_sequence=${lastSequenceRef.current}`,
    ))
    socketRef.current = socket
    socket.onmessage = (message) => {
      if (missionIdRef.current !== missionId) return
      const parsed = eventEnvelopeSchema.safeParse(JSON.parse(String(message.data)))
      if (parsed.success) applyEvent(parsed.data)
    }
    socket.onclose = (event) => {
      if (missionIdRef.current !== missionId) return
      if (socketRef.current === socket) socketRef.current = null
      const recovery = recoveryMessageForClose(event.code)
      if (recovery) {
        setError(recovery)
        return
      }
      if (event.code === 1000) return
      clearReconnect()
      reconnectRef.current = window.setTimeout(() => {
        if (missionIdRef.current !== missionId) return
        void connectRef.current(missionId)
      }, 1_000)
    }
    await waitForSocketOpen(socket)
  }, [applyEvent, clearReconnect])

  useEffect(() => {
    connectRef.current = connect
  }, [connect])

  useEffect(() => () => {
    missionIdRef.current = null
    clearReconnect()
    socketRef.current?.close(1000)
  }, [clearReconnect])

  const launchSessionTurn = useCallback(async (nextSession: MissionSessionRecord) => {
    setSession(nextSession)
    setProjection(createInitialMissionProjection())
    lastSequenceRef.current = 0
    clearReconnect()
    const nextMission = await getMission(nextSession.active_mission_id)
    setMission(nextMission)
    const initialEvents = await listMissionEvents(nextMission.id)
    initialEvents.forEach(applyEvent)
    await connect(nextMission.id)
    setMission(await controlMission(nextMission.id, "start"))
    await catchUp(nextMission.id)
  }, [applyEvent, catchUp, clearReconnect, connect])

  const start = useCallback(async (input: LiveMissionInput) => {
    setError(null)
    try {
      const created = await createMissionSession({
        prompt: input.request,
        projectId: input.projectId,
        modelProfileId: input.modelProfileId,
        model: input.model,
        teamId: input.teamId,
      })
      await launchSessionTurn(created)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to start live mission")
    }
  }, [launchSessionTurn])

  const sendFollowUp = useCallback(async (input: LiveMissionInput) => {
    if (!session) return
    setError(null)
    try {
      const updated = await appendMissionSessionTurn({
        sessionId: session.id,
        prompt: input.request,
        modelProfileId: input.modelProfileId,
        model: input.model,
        teamId: input.teamId,
      })
      await launchSessionTurn(updated)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to send follow-up")
    }
  }, [launchSessionTurn, session])

  const selectSession = useCallback(async (nextSession: MissionSessionRecord) => {
    setError(null)
    setSession(nextSession)
    setProjection(createInitialMissionProjection())
    lastSequenceRef.current = 0
    clearReconnect()
    try {
      const selectedMission = await getMission(nextSession.active_mission_id)
      setMission(selectedMission)
      const events = await listMissionEvents(selectedMission.id)
      events.forEach(applyEvent)
      if (!["completed", "failed", "cancelled"].includes(selectedMission.status)) {
        await connect(selectedMission.id)
      }
    } catch {
      setMission(null)
      setError(MISSION_RECOVERY_MESSAGE)
    }
  }, [applyEvent, clearReconnect, connect])

  const control = useCallback(async (action: "pause" | "resume" | "cancel") => {
    if (!mission) return
    try {
      setMission(await controlMission(mission.id, action))
      await catchUp(mission.id)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : `Unable to ${action} mission`)
    }
  }, [catchUp, mission])

  const dismiss = useCallback(() => {
    missionIdRef.current = null
    clearReconnect()
    const socket = socketRef.current
    socketRef.current = null
    if (socket) {
      socket.onclose = null
      socket.close(1000)
    }
    lastSequenceRef.current = 0
    setMission(null)
    setSession(null)
    setProjection(createInitialMissionProjection())
    setError(null)
  }, [clearReconnect])

  return {
    mission,
    session,
    projection,
    error,
    hasStarted: mission !== null,
    playing: mission?.status === "running",
    paused: mission?.status === "paused",
    start,
    sendFollowUp,
    selectSession,
    pause: () => { void control("pause") },
    resume: () => { void control("resume") },
    cancel: () => { void control("cancel") },
    dismiss,
  }
}

