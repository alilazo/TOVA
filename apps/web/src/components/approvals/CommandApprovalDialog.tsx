import { useRef } from "react"
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
  type BrowserAuditApprovalPayload,
  type CommandApprovalPayload,
  type FileDeleteApprovalPayload,
} from "@/features/mission/mission-api"

function isFileDeleteRequest(
  request: ApprovalRequestPayload,
): request is FileDeleteApprovalPayload {
  return request.kind === "file_delete"
}

function isBrowserAuditRequest(
  request: ApprovalRequestPayload,
): request is BrowserAuditApprovalPayload {
  return request.kind === "browser_audit"
}

function asCommandRequest(
  request: ApprovalRequestPayload,
): CommandApprovalPayload {
  return request as CommandApprovalPayload
}

export function CommandApprovalDialog({ missionId }: { missionId?: string }) {
  const client = useQueryClient()
  const approveRef = useRef<HTMLButtonElement>(null)
  const approvals = useQuery({
    queryKey: ["approvals", missionId],
    queryFn: () => listApprovals(missionId ?? ""),
    enabled: Boolean(missionId),
    refetchInterval: 1_000,
  })
  const pending = approvals.data?.find((approval) => approval.status === "pending")
  const isDelete = pending ? isFileDeleteRequest(pending.request) : false
  const isBrowserAudit = pending ? isBrowserAuditRequest(pending.request) : false
  const resolve = useMutation({
    mutationFn: (decision: "accept" | "reject") => (
      resolveApproval(pending?.id ?? "", decision)
    ),
    onSuccess: () => client.invalidateQueries({ queryKey: ["approvals", missionId] }),
  })

  const deleteRequest =
    pending && isFileDeleteRequest(pending.request) ? pending.request : null
  const browserAuditRequest =
    pending && isBrowserAuditRequest(pending.request) ? pending.request : null
  const commandRequest =
    pending && !isFileDeleteRequest(pending.request) && !isBrowserAuditRequest(pending.request)
      ? asCommandRequest(pending.request)
      : null

  return (
    <Dialog open={Boolean(pending)}>
      <DialogContent
        className="approval-dialog"
        showCloseButton={false}
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          approveRef.current?.focus()
        }}
      >
        <DialogHeader>
          <DialogTitle>
            {isDelete
              ? "Action needed: approve this file delete"
              : isBrowserAudit
                ? "Action needed: approve this browser audit"
              : "Action needed: approve this command"}
          </DialogTitle>
          <DialogDescription>
            {isDelete
              ? "Work is waiting. TOVA agents cannot delete project files until you approve this exact request."
              : isBrowserAudit
                ? "Work is waiting. TOVA agents cannot inspect local URLs until you approve this exact request."
              : "Work is waiting. TOVA agents cannot run host commands until you approve this exact request."}
          </DialogDescription>
        </DialogHeader>
        {deleteRequest && (
          <div className="approval-dialog__request">
            <p className="approval-dialog__intro">
              <span>{deleteRequest.staff_display_name} wants to delete</span>
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
            <code className="approval-dialog__command">
              {commandRequest.executable} {commandRequest.args.join(" ")}
            </code>
            <dl>
              <dt>Purpose</dt>
              <dd>{commandRequest.purpose}</dd>
              <dt>Working directory</dt>
              <dd>{commandRequest.cwd}</dd>
              <dt>Timeout</dt>
              <dd>{commandRequest.timeout_seconds ?? 60} seconds</dd>
              {commandRequest.expected_outputs && commandRequest.expected_outputs.length > 0 ? (
                <>
                  <dt>Expected outputs</dt>
                  <dd>{commandRequest.expected_outputs.join(", ")}</dd>
                </>
              ) : null}
              <dt>Requested by</dt>
              <dd>{commandRequest.staff_id}</dd>
            </dl>
          </div>
        )}
        {browserAuditRequest && (
          <div className="approval-dialog__request">
            <p className="approval-dialog__intro">
              <span>{browserAuditRequest.staff_display_name} wants to inspect</span>
              <code>{browserAuditRequest.url}</code>
            </p>
            <dl>
              <dt>Purpose</dt>
              <dd>{browserAuditRequest.purpose}</dd>
              <dt>Acceptance criteria</dt>
              <dd>
                <ul
                  aria-label="Acceptance criteria"
                  className="approval-dialog__criteria"
                >
                  {browserAuditRequest.acceptance_criteria.map((criterion) => (
                    <li key={criterion}>{criterion}</li>
                  ))}
                </ul>
              </dd>
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
            ref={approveRef}
            autoFocus
            disabled={resolve.isPending}
            onClick={() => resolve.mutate("accept")}
          >
            {isDelete
              ? "Approve and delete"
              : isBrowserAudit
                ? "Approve browser audit"
                : "Approve and run"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
