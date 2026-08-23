import { useQuery } from "@tanstack/react-query"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { getRuntimeStatus } from "@/features/models/model-api"

import { LocalModelSetupPanel } from "./LocalModelSetupPanel"

interface ModelRuntimeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ModelRuntimeDialog({
  open,
  onOpenChange,
}: ModelRuntimeDialogProps) {
  const runtime = useQuery({
    queryKey: ["runtime-status"],
    queryFn: getRuntimeStatus,
    enabled: open,
  })
  const connected = runtime.data?.state === "connected" && Boolean(runtime.data.selectedModel)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="runtime-dialog" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{connected ? "Local model" : "Connect local model"}</DialogTitle>
          <DialogDescription>
            {connected
              ? "Change the selected local model used for missions."
              : "Start your local model server, then finish setup."}
          </DialogDescription>
        </DialogHeader>
        <LocalModelSetupPanel
          active={open}
          showCloseAction
          onClose={() => onOpenChange(false)}
          onApplied={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  )
}
