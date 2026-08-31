import { describe, expect, it } from "vitest"

import {
  createInitialMissionProjection,
  missionEventReducer,
  missionStatusForEvent,
} from "@/features/mission/mission-event-reducer"
import type { EventEnvelope } from "@/types/events"

const event = (
  sequence: number,
  eventType: EventEnvelope["event_type"],
  payload: EventEnvelope["payload"],
  staffId: string | null = null,
): EventEnvelope => ({
  version: "1.0",
  event_id: `evt_${sequence}`,
  event_type: eventType,
  timestamp: `2026-07-23T18:00:${sequence.toString().padStart(2, "0")}Z`,
  project_id: "project_orion",
  mission_id: "mission_orchestration",
  staff_id: staffId,
  sequence,
  payload,
})

describe("missionEventReducer", () => {
  it("rebuilds mission, staff, file, activity, artifact, and handoff state", () => {
    const events: EventEnvelope[] = [
      event(1, "mission.analysis.started", {
        title: "Analyzing mission",
        status: "analyzing",
        progress_percent: 8,
      }, "staff_alex"),
      event(2, "staff.status.changed", {
        status: "researching",
        title: "Maya started repository research",
      }, "staff_maya"),
      event(3, "staff.file.opened", {
        title: "Maya opened the orchestration service",
        file_path: "services/orchestrator.py",
      }, "staff_maya"),
      event(4, "artifact.created", {
        artifact_id: "artifact_research",
        artifact_type: "research_note",
        title: "Repository research brief",
        summary: "Existing mission state patterns identified.",
      }, "staff_maya"),
      event(5, "handoff.started", {
        handoff_id: "handoff_maya_ethan",
        from_staff_id: "staff_maya",
        to_staff_id: "staff_ethan",
        title: "Research complete",
        summary: "Implementation evidence is ready.",
        artifact_count: 1,
      }, "staff_maya"),
    ]

    const projection = events.reduce(
      missionEventReducer,
      createInitialMissionProjection(),
    )

    expect(projection.status).toBe("analyzing")
    expect(projection.currentStaffId).toBe("staff_maya")
    expect(projection.staffStatuses.staff_maya).toBe("researching")
    expect(projection.activeFile).toBe("services/orchestrator.py")
    expect(projection.activity).toHaveLength(5)
    expect(projection.artifacts[0]?.name).toBe("Repository research brief")
    expect(projection.activeHandoff?.toStaffId).toBe("staff_ethan")
    expect(projection.lastSequence).toBe(5)
  })

  it("bumps fileRevision on successive file updates to the same path", () => {
    const opened = event(1, "staff.file.opened", {
      title: "Opened a.ts",
      file_path: "a.ts",
    }, "staff_maya")
    const updated = event(2, "staff.file.updated", {
      title: "Wrote a.ts",
      file_path: "a.ts",
    }, "staff_maya")
    const projection = [opened, updated].reduce(
      missionEventReducer,
      createInitialMissionProjection(),
    )
    expect(projection.activeFile).toBe("a.ts")
    expect(projection.fileRevision).toBe(2)
    expect(projection.editorOwnerId).toBe("staff_maya")
  })

  it("projects file creates and updates into Team Floor work outputs", () => {
    const projection = [
      event(1, "staff.file.created", {
        title: "Wrote index.html",
        file_path: "index.html",
      }, "staff_lina"),
      event(2, "staff.file.updated", {
        title: "Updated index.html",
        file_path: "index.html",
      }, "staff_lina"),
      event(3, "staff.file.opened", {
        title: "Opened script.js",
        file_path: "script.js",
      }, "staff_lina"),
    ].reduce(missionEventReducer, createInitialMissionProjection())

    expect(projection.artifacts).toEqual([
      {
        id: "evt_1",
        staffId: "staff_lina",
        type: "file_output",
        name: "index.html",
        summary: "Updated index.html",
      },
    ])
    expect(projection.activeFile).toBe("script.js")
  })

  it("marks in-flight activity completed when the mission finishes", () => {
    const projection = [
      event(1, "staff.test.started", {
        tool: "qa.browser.audit",
        url: "http://127.0.0.1:5173",
        status: "testing",
        summary: "Ava started browser audit",
      }, "staff_ava"),
      event(2, "mission.completed", { summary: "Done" }),
    ].reduce(missionEventReducer, createInitialMissionProjection())

    expect(projection.activity[0]?.status).toBe("completed")
    expect(projection.activity.some((item) => item.status === "testing")).toBe(false)
  })

  it("projects browser QA results into artifacts and staff status", () => {
    const projection = [
      event(1, "staff.test.started", {
        tool: "qa.browser.audit",
        url: "http://127.0.0.1:5173",
        summary: "Ava started browser audit",
      }, "staff_ava"),
      event(2, "staff.test.result", {
        tool: "qa.browser.audit",
        url: "http://127.0.0.1:5173",
        verdict: "needs_improvement",
        summary: "Primary button overlaps heading",
        screenshot_path: ".tova/browser-audits/audit/screenshot.png",
      }, "staff_ava"),
    ].reduce(missionEventReducer, createInitialMissionProjection())

    expect(projection.staffStatuses.staff_ava).toBe("completed")
    expect(projection.artifacts).toContainEqual({
      id: "evt_2",
      staffId: "staff_ava",
      type: "qa_report",
      name: "QA browser audit: needs_improvement",
      summary: "Primary button overlaps heading",
    })
    expect(projection.workLogs.staff_ava?.output).toContain(
      "QA browser audit: needs_improvement",
    )
  })

  it("clears active file and work output when a file is deleted", () => {
    const projection = [
      event(1, "staff.file.created", {
        title: "Wrote hello.html",
        file_path: "hello.html",
      }, "staff_lina"),
      event(2, "staff.file.deleted", {
        title: "Deleted hello.html",
        file_path: "hello.html",
      }, "staff_lina"),
    ].reduce(missionEventReducer, createInitialMissionProjection())

    expect(projection.activeFile).toBe("")
    expect(projection.lastDeletedFile).toBe("hello.html")
    expect(projection.fileRevision).toBe(2)
    expect(
      projection.artifacts.filter((a) => a.type === "file_output"),
    ).toHaveLength(0)
  })

  it("initializes lastDeletedFile as null", () => {
    expect(createInitialMissionProjection().lastDeletedFile).toBeNull()
  })

  it("clears lastDeletedFile when the same path is recreated", () => {
    const projection = [
      event(1, "staff.file.created", {
        title: "Wrote hello.html",
        file_path: "hello.html",
      }, "staff_lina"),
      event(2, "staff.file.deleted", {
        title: "Deleted hello.html",
        file_path: "hello.html",
      }, "staff_lina"),
      event(3, "staff.file.created", {
        title: "Wrote hello.html",
        file_path: "hello.html",
      }, "staff_lina"),
    ].reduce(missionEventReducer, createInitialMissionProjection())

    expect(projection.activeFile).toBe("hello.html")
    expect(projection.lastDeletedFile).toBeNull()
    expect(projection.fileRevision).toBe(3)
  })

  it("uses summary as activity title when title is absent", () => {
    const projection = missionEventReducer(
      createInitialMissionProjection(),
      event(1, "staff.action.updated", { summary: "Wrote a.ts", ok: true }, "staff_maya"),
    )
    expect(projection.activity[0]?.title).toBe("Wrote a.ts")
  })

  it("projects isolated work logs for each staff member", () => {
    const projection = [
      event(1, "staff.assigned", {
        objective: "Implement live runtime",
      }, "staff_maya"),
      event(2, "staff.action.updated", {
        summary: "Wrote src/runtime.ts",
        tool: "repository.write",
      }, "staff_maya"),
      event(3, "staff.decision.recorded", {
        summary: "Keep the event projection pure",
      }, "staff_ethan"),
    ].reduce(missionEventReducer, createInitialMissionProjection())

    expect(projection.workLogs.staff_maya).toMatchObject({
      objective: "Implement live runtime",
      currentAction: "Wrote src/runtime.ts",
      toolActivity: ["repository.write"],
    })
    expect(projection.workLogs.staff_ethan).toMatchObject({
      decisionSummary: "Keep the event projection pure",
      objective: null,
    })
  })

  it("does not expose fabricated phase or progress state", () => {
    const projection = createInitialMissionProjection()

    expect(projection).not.toHaveProperty("phase")
    expect(projection).not.toHaveProperty("progress")
  })

  it("tracks mission start and end timestamps for the Team Floor timer", () => {
    const started = missionEventReducer(
      createInitialMissionProjection(),
      event(1, "mission.started", { summary: "Mission started" }),
    )
    expect(started.startedAt).toBe("2026-07-23T18:00:01Z")
    expect(started.endedAt).toBeNull()

    const completed = missionEventReducer(
      started,
      event(2, "mission.completed", { summary: "Done" }),
    )
    expect(completed.startedAt).toBe("2026-07-23T18:00:01Z")
    expect(completed.endedAt).toBe("2026-07-23T18:00:02Z")
  })

  it("uses readable activity titles for plan review events", () => {
    const proposed = event(1, "mission.plan.proposed", {
      interpretation: "Build a hello page.",
      mission_summary: "Ship a minimal hello page.",
      assignments: [
        {
          staff_id: "staff_lina",
          staff_role: "frontend_developer",
          role: "Front-End Developer",
          display_name: "Lina",
          avatar: "lina",
          objective: "Create hello.html",
          rationale: "Front-end owns the page.",
          sequence: 1,
        },
      ],
    })
    const accepted = event(2, "mission.plan.accepted", {
      interpretation: "Build a hello page.",
      mission_summary: "Ship a minimal hello page.",
      assignments: proposed.payload.assignments,
    })
    const projection = [proposed, accepted].reduce(
      missionEventReducer,
      createInitialMissionProjection(),
    )
    expect(projection.activity[0]?.title).toBe("Ship a minimal hello page.")
    expect(projection.activity[1]?.title).toBe("Plan accepted")
  })

  it("projects plan review from mission.plan.proposed and clears on accept", () => {
    const proposed = event(1, "mission.plan.proposed", {
      interpretation: "Build a centered button page.",
      mission_summary: "Ship a minimal centered button page.",
      assignments: [
        {
          staff_id: "staff_lina",
          staff_role: "frontend_developer",
          role: "Front-End Developer",
          display_name: "Lina",
          avatar: "lina",
          objective: "Create index.html",
          rationale: "Front-end owns the page markup.",
          sequence: 1,
        },
      ],
    })
    const accepted = event(2, "mission.plan.accepted", {
      interpretation: "Build a centered button page.",
      mission_summary: "Ship a minimal centered button page.",
      assignments: proposed.payload.assignments,
    })

    const awaiting = missionEventReducer(createInitialMissionProjection(), proposed)
    expect(awaiting.status).toBe("awaiting_approval")
    expect(awaiting.planReview).toEqual({
      interpretation: "Build a centered button page.",
      summary: "Ship a minimal centered button page.",
      assignments: [
        {
          staffId: "staff_lina",
          staffRole: "frontend_developer",
          role: "Front-End Developer",
          displayName: "Lina",
          avatar: "lina",
          objective: "Create index.html",
          rationale: "Front-end owns the page markup.",
          sequence: 1,
        },
      ],
    })

    const afterAccept = missionEventReducer(awaiting, accepted)
    expect(afterAccept.status).toBe("assembling_team")
    expect(afterAccept.planReview).toBeNull()
  })

  it("projects explicit staff selection and structured Lina to Ava handoff evidence", () => {
    const projection = [
      event(1, "mission.team.member.selected", {
        role: "frontend_developer",
        objective: "Create index.html",
        sequence: 1,
      }, "staff_lina"),
      event(2, "mission.team.member.selected", {
        role: "qa_tester",
        objective: "Validate the changed page",
        sequence: 2,
      }, "staff_ava"),
      event(3, "handoff.started", {
        handoff_id: "handoff_lina_ava",
        from_staff_id: "staff_lina",
        to_staff_id: "staff_ava",
        title: "Implementation ready for QA",
        summary: "Lina changed the landing page and needs QA evidence.",
        artifact_count: 1,
        changed_paths: ["index.html"],
        test_instructions: ["Open index.html and verify the button is visible."],
        acceptance_criteria: ["The primary button is centered and readable."],
      }, "staff_lina"),
    ].reduce(missionEventReducer, createInitialMissionProjection())

    expect(projection.selectedStaffIds).toEqual(["staff_lina", "staff_ava"])
    expect(projection.staffStatuses.staff_lina).toBe("queued")
    expect(projection.staffStatuses.staff_ava).toBe("queued")
    expect(projection.activeHandoff).toEqual({
      id: "handoff_lina_ava",
      fromStaffId: "staff_lina",
      toStaffId: "staff_ava",
      title: "Implementation ready for QA",
      summary: "Lina changed the landing page and needs QA evidence.",
      artifactCount: 1,
      changedPaths: ["index.html"],
      testInstructions: ["Open index.html and verify the button is visible."],
      acceptanceCriteria: ["The primary button is centered and readable."],
      status: "animating",
    })
  })

  it("ignores duplicate and out-of-order events", () => {
    const initial = createInitialMissionProjection()
    const later = event(4, "mission.started", {
      title: "Mission started",
      status: "running",
      progress_percent: 20,
    })
    const earlier = event(3, "mission.failed", {
      title: "Stale failure",
      status: "failed",
    })

    const projection = [later, earlier, later].reduce(missionEventReducer, initial)

    expect(projection.status).toBe("running")
    expect(projection.activity).toHaveLength(1)
    expect(projection.lastSequence).toBe(4)
  })

  it("stores mission objective and assembly roles for Team Floor startup", () => {
    const projection = [
      event(1, "mission.created", {
        objective: "Build a centered button page",
      }),
      event(2, "mission.started", {
        summary: "Mission started",
      }),
      event(3, "mission.analysis.started", {
        summary: "Coordinator is creating a bounded mission plan",
      }),
      event(4, "mission.team.assembly.started", {
        summary: "Assembling team",
        roles: ["frontend_developer", "project_coordinator"],
      }),
    ].reduce(missionEventReducer, createInitialMissionProjection())

    expect(projection.objective).toBe("Build a centered button page")
    expect(projection.status).toBe("assembling_team")
    expect(projection.assemblyRoles).toEqual([
      "frontend_developer",
      "project_coordinator",
    ])
  })

  it("clears assembly roles when the mission ends", () => {
    const started = [
      event(1, "mission.created", { objective: "Ship MVP" }),
      event(2, "mission.team.assembly.started", {
        roles: ["frontend_developer"],
      }),
    ].reduce(missionEventReducer, createInitialMissionProjection())

    const completed = missionEventReducer(
      started,
      event(3, "mission.completed", { summary: "Done" }),
    )

    expect(completed.assemblyRoles).toEqual([])
    expect(completed.objective).toBe("Ship MVP")
  })

  it("clears the live editor owner when the mission completes", () => {
    const withFile = [
      event(1, "staff.file.updated", {
        title: "Wrote index.html",
        file_path: "index.html",
      }, "staff_alex"),
      event(2, "staff.file.updated", {
        title: "Wrote script.js",
        file_path: "script.js",
      }, "staff_alex"),
    ].reduce(missionEventReducer, createInitialMissionProjection())

    expect(withFile.editorOwnerId).toBe("staff_alex")
    expect(withFile.activeFile).toBe("script.js")

    const completed = missionEventReducer(
      withFile,
      event(3, "mission.completed", { summary: "Operation delivered" }),
    )

    expect(completed.status).toBe("completed")
    expect(completed.editorOwnerId).toBeNull()
    expect(completed.activeFile).toBe("script.js")
  })

  it("maps mission.failed events to the failed status for live UI sync", () => {
    expect(missionStatusForEvent("mission.failed")).toBe("failed")
    expect(missionStatusForEvent("mission.completed")).toBe("completed")
    expect(missionStatusForEvent("staff.action.updated")).toBeNull()

    const failed = missionEventReducer(
      createInitialMissionProjection(),
      event(1, "mission.failed", { summary: "Mission failed: WorkspaceError" }),
    )
    expect(failed.status).toBe("failed")
  })

  it("maps mission.cancelled events to the cancelled status for live UI sync", () => {
    expect(missionStatusForEvent("mission.cancelled")).toBe("cancelled")

    const cancelled = missionEventReducer(
      createInitialMissionProjection(),
      event(1, "mission.cancelled", { summary: "Mission cancelled" }),
    )
    expect(cancelled.status).toBe("cancelled")
  })
})
