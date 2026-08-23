# Task 6 review package
### apps/web/src/features/mission/mission-api.ts

`	sx
import { apiRequest } from "@/lib/api"
import type { EventEnvelope } from "@/types/events"

export interface MissionRecord {
  id: string
  project_id: string
  objective: string
  project_root: string
  status: string
  model_profile_id: string
  model: string
}

export type CommandApprovalPayload = {
  kind?: "command"
  mission_id: string
  staff_id: string
  executable: string
  args: string[]
  cwd: string
  purpose: string
}

export type FileDeleteApprovalPayload = {
  kind: "file_delete"
  mission_id: string
  staff_id: string
  staff_display_name: string
  path: string
  purpose: string
}

export type ApprovalRequestPayload =
  | CommandApprovalPayload
  | FileDeleteApprovalPayload

export interface ApprovalRequest {
  id: string
  request: ApprovalRequestPayload
  status: "pending" | "accepted" | "rejected" | "executing" | "executed" | "failed"
}

export function createMission(input: {
  projectId: string
  objective: string
  modelProfileId: string
  model: string
}) {
  return apiRequest<MissionRecord>(`/api/projects/${input.projectId}/missions`, {
    method: "POST",
    body: JSON.stringify({
      objective: input.objective,
      model_profile_id: input.modelProfileId,
      model: input.model,
    }),
  })
}

export function controlMission(missionId: string, action: "start" | "pause" | "resume" | "cancel") {
  return apiRequest<MissionRecord>(`/api/missions/${missionId}/${action}`, {
    method: "POST",
  })
}

export function listMissionEvents(missionId: string) {
  return apiRequest<EventEnvelope[]>(`/api/missions/${missionId}/events`)
}

export function listApprovals(missionId: string) {
  return apiRequest<ApprovalRequest[]>(`/api/missions/${missionId}/approvals`)
}

export function resolveApproval(
  approvalId: string,
  decision: "accept" | "reject",
) {
  return apiRequest<ApprovalRequest>(
    `/api/approvals/${approvalId}/${decision}`,
    { method: "POST" },
  )
}

export interface MissionPlanAssignmentView {
  staff_id: string
  staff_role: string
  role: string
  display_name: string
  avatar: string
  objective: string
  rationale: string
  sequence: number
}

export interface MissionPlanView {
  interpretation: string
  mission_summary: string
  assignments: MissionPlanAssignmentView[]
}

export function getMissionPlan(missionId: string) {
  return apiRequest<MissionPlanView>(`/api/missions/${missionId}/plan`)
}

export function acceptMissionPlan(
  missionId: string,
  body: {
    interpretation: string
    assignments: Array<{
      staff_role: string
      rationale: string
      objective?: string
    }>
  },
) {
  return apiRequest<MissionPlanView>(`/api/missions/${missionId}/plan/accept`, {
    method: "POST",
    body: JSON.stringify(body),
  })
}

export function regenerateMissionPlan(missionId: string, notes = "") {
  return apiRequest<{ status: string }>(`/api/missions/${missionId}/plan/regenerate`, {
    method: "POST",
    body: JSON.stringify({ notes }),
  })
}

`
### apps/web/src/components/approvals/CommandApprovalDialog.tsx

`	sx
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  listApprovals,
  resolveApproval,
  type ApprovalRequestPayload,
  type CommandApprovalPayload,
  type FileDeleteApprovalPayload,
} from "@/features/mission/mission-api"

function isFileDeleteRequest(
  request: ApprovalRequestPayload,
): request is FileDeleteApprovalPayload {
  return request.kind === "file_delete"
}

function asCommandRequest(
  request: ApprovalRequestPayload,
): CommandApprovalPayload {
  return request as CommandApprovalPayload
}

export function CommandApprovalDialog({ missionId }: { missionId?: string }) {
  const client = useQueryClient()
  const approvals = useQuery({
    queryKey: ["approvals", missionId],
    queryFn: () => listApprovals(missionId ?? ""),
    enabled: Boolean(missionId),
    refetchInterval: 1_000,
  })
  const pending = approvals.data?.find((approval) => approval.status === "pending")
  const isDelete = pending ? isFileDeleteRequest(pending.request) : false
  const resolve = useMutation({
    mutationFn: (decision: "accept" | "reject") => (
      resolveApproval(pending?.id ?? "", decision)
    ),
    onSuccess: () => client.invalidateQueries({ queryKey: ["approvals", missionId] }),
  })

  const deleteRequest =
    pending && isFileDeleteRequest(pending.request) ? pending.request : null
  const commandRequest =
    pending && !isFileDeleteRequest(pending.request)
      ? asCommandRequest(pending.request)
      : null

  return (
    <Dialog open={Boolean(pending)}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>
            {isDelete
              ? "File delete approval required"
              : "Command approval required"}
          </DialogTitle>
          <DialogDescription>
            {isDelete
              ? "TOVA agents cannot delete project files until you approve this exact request."
              : "TOVA agents cannot run host commands until you approve this exact request."}
          </DialogDescription>
        </DialogHeader>
        {deleteRequest && (
          <div className="approval-dialog__request">
            <p>
              {deleteRequest.staff_display_name} wants to delete{" "}
              <code>{deleteRequest.path}</code>
            </p>
            <dl>
              <dt>Purpose</dt>
              <dd>{deleteRequest.purpose}</dd>
            </dl>
          </div>
        )}
        {commandRequest && (
          <div className="approval-dialog__request">
            <code>
              {commandRequest.executable} {commandRequest.args.join(" ")}
            </code>
            <dl>
              <dt>Purpose</dt>
              <dd>{commandRequest.purpose}</dd>
              <dt>Working directory</dt>
              <dd>{commandRequest.cwd}</dd>
              <dt>Requested by</dt>
              <dd>{commandRequest.staff_id}</dd>
            </dl>
          </div>
        )}
        {resolve.error && <p role="alert">{resolve.error.message}</p>}
        <DialogFooter>
          <Button
            variant="outline"
            disabled={resolve.isPending}
            onClick={() => resolve.mutate("reject")}
          >
            Reject
          </Button>
          <Button
            disabled={resolve.isPending}
            onClick={() => resolve.mutate("accept")}
          >
            {isDelete ? "Approve and delete" : "Approve and run"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

`
### apps/web/tests/command-approval-dialog.test.tsx

`	sx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { CommandApprovalDialog } from "@/components/approvals/CommandApprovalDialog"
import * as missionApi from "@/features/mission/mission-api"

vi.mock("@/features/mission/mission-api", async () => {
  const actual = await vi.importActual<typeof missionApi>(
    "@/features/mission/mission-api",
  )
  return {
    ...actual,
    listApprovals: vi.fn(),
    resolveApproval: vi.fn(),
  }
})

function renderDialog() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <CommandApprovalDialog missionId="mission-1" />
    </QueryClientProvider>,
  )
}

describe("CommandApprovalDialog", () => {
  it("shows file delete approval copy", async () => {
    vi.mocked(missionApi.listApprovals).mockResolvedValue([
      {
        id: "approval_1",
        status: "pending",
        request: {
          kind: "file_delete",
          mission_id: "mission-1",
          staff_id: "staff_ava",
          staff_display_name: "Ava",
          path: "hello.html",
          purpose: "Remove unused hello page",
        },
      },
    ])
    renderDialog()
    expect(
      await screen.findByText("File delete approval required"),
    ).toBeInTheDocument()
    expect(screen.getByText(/Ava wants to delete/)).toBeInTheDocument()
    expect(screen.getByText("hello.html")).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: /Approve and delete/i }),
    ).toBeInTheDocument()
  })
})

`
