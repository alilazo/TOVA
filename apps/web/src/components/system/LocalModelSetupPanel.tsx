import { useEffect, useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { CheckCircle2, ChevronDown } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select"
import {
  discoverModels,
  getRuntimeStatus,
  listModelProfiles,
  selectModel,
  testModel,
  type ModelProfile,
  type ModelSelection,
  type RuntimeStatus,
} from "@/features/models/model-api"

export const DEFAULT_LM_STUDIO_URL = "http://127.0.0.1:1234"
export const LM_STUDIO_INSTALL_URL = "https://lmstudio.ai"
const PREFERRED_MODEL_ID = "qwen/qwen3.6-35b-a3b"

export function pickInitialModel(models: Array<{ id: string }>): string {
  if (models.some((model) => model.id === PREFERRED_MODEL_ID)) {
    return PREFERRED_MODEL_ID
  }
  return models[0]?.id ?? ""
}

export function stripV1(baseUrl: string): string {
  return baseUrl.replace(/\/v1\/?$/, "") || DEFAULT_LM_STUDIO_URL
}

export function RuntimeStatusLine({
  status,
}: {
  status: Pick<RuntimeStatus, "state" | "selectedModel" | "error"> | undefined
}) {
  if (!status) {
    return <p className="runtime-dialog__status" role="status">Checking local model status…</p>
  }
  if (status.state === "connected" && status.selectedModel) {
    return (
      <p className="runtime-dialog__status is-connected" role="status">
        <span className="runtime-dialog__status-badge">Connected</span>
        <span className="runtime-dialog__status-sep" aria-hidden="true">·</span>
        <span className="runtime-dialog__status-model">{status.selectedModel}</span>
      </p>
    )
  }
  if (status.state === "unconfigured") {
    return (
      <p className="runtime-dialog__status is-waiting" role="status">
        {status.error ?? "Not connected yet — connect a local model server and finish setup."}
      </p>
    )
  }
  if (status.state === "unavailable") {
    return (
      <p className="runtime-dialog__status is-unavailable" role="status">
        {status.error ?? "Unavailable — start your local model server"}
      </p>
    )
  }
  return (
    <p className="runtime-dialog__status" role="status">
      Status: {status.state}
    </p>
  )
}

interface LocalModelSetupPanelProps {
  active?: boolean
  autoDiscover?: boolean
  onClose?: () => void
  onApplied?: () => void
  showCloseAction?: boolean
  className?: string
}

export function LocalModelSetupPanel({
  active = true,
  autoDiscover = true,
  onClose,
  onApplied,
  showCloseAction = false,
  className,
}: LocalModelSetupPanelProps) {
  const client = useQueryClient()
  const [discovered, setDiscovered] = useState<ModelProfile | null>(null)
  const [baseUrlOverride, setBaseUrlOverride] = useState<string | null>(null)
  const [modelOverride, setModelOverride] = useState<string | null>(null)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [testResult, setTestResult] = useState<{
    ok: boolean
    message: string
  } | null>(null)
  const [didDiscover, setDidDiscover] = useState(false)
  const autoDiscoverKeyRef = useRef<string | null>(null)
  const autoApplyKeyRef = useRef<string | null>(null)
  const connectedRef = useRef(false)
  const discoverMutateRef = useRef(discoverModels)

  const profiles = useQuery({
    queryKey: ["model-profiles"],
    queryFn: listModelProfiles,
    enabled: active,
  })
  const runtime = useQuery({
    queryKey: ["runtime-status"],
    queryFn: getRuntimeStatus,
    enabled: active,
    refetchInterval: active ? 5_000 : false,
  })

  const profileFromServer = profiles.data?.find(
    (item) => item.id === runtime.data?.selectedProfileId,
  ) ?? profiles.data?.[0] ?? null
  const profile = discovered ?? profileFromServer
  const baseUrl = baseUrlOverride
    ?? (profile ? stripV1(profile.base_url) : DEFAULT_LM_STUDIO_URL)
  const modelId = modelOverride
    ?? runtime.data?.selectedModel
    ?? ""

  const select = useMutation({
    mutationFn: (selection?: ModelSelection) => {
      const profileId = selection?.profile_id ?? profile?.id
      const model = selection?.model ?? modelId
      if (!profileId || !model) {
        throw new Error("Choose a model first.")
      }
      return selectModel({ profile_id: profileId, model })
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["runtime-status"] })
      onApplied?.()
    },
  })
  const selectMutate = select.mutate

  const discover = useMutation({
    mutationFn: (url: string) => discoverMutateRef.current(url),
    onSuccess: (next) => {
      const picked = pickInitialModel(next.models)
      setDiscovered(next)
      setBaseUrlOverride(stripV1(next.base_url))
      setModelOverride(picked)
      setTestResult(null)
      setDidDiscover(true)
      void client.invalidateQueries({ queryKey: ["model-profiles"] })
      void client.invalidateQueries({ queryKey: ["runtime-status"] })

      if (connectedRef.current || !picked) {
        return
      }
      const applyKey = `${next.id}:${picked}`
      if (autoApplyKeyRef.current === applyKey) {
        return
      }
      autoApplyKeyRef.current = applyKey
      selectMutate({ profile_id: next.id, model: picked })
    },
  })
  const discoverMutate = discover.mutate
  const discoverPending = discover.isPending

  const test = useMutation({
    mutationFn: () => {
      if (!profile || !modelId) {
        throw new Error("Choose a model first.")
      }
      return testModel(profile.id, modelId)
    },
    onSuccess: (result) => {
      setTestResult(
        result.connected
          ? { ok: true, message: `Test passed · ${result.latency_ms}ms` }
          : { ok: false, message: result.error ?? "Test failed." },
      )
      void client.invalidateQueries({ queryKey: ["runtime-status"] })
    },
    onError: (error) => {
      setTestResult({
        ok: false,
        message: error instanceof Error ? error.message : "Test failed.",
      })
    },
  })

  const connected = runtime.data?.state === "connected" && Boolean(runtime.data.selectedModel)
  useEffect(() => {
    connectedRef.current = connected
  }, [connected])
  const changingModel = didDiscover
  const models = profile?.models ?? []
  const canUseModel = Boolean(profile && modelId)
  const showModelPicker = (!connected || changingModel) && (models.length > 0 || didDiscover)
  const discoverError = discover.error instanceof Error
    ? discover.error.message
    : discover.isError
      ? "Could not reach a local model server."
      : null
  const selectError = select.error instanceof Error ? select.error.message : null
  const emptyAfterDiscover = didDiscover && models.length === 0
  const showRetryConnect = !connected && (Boolean(discoverError) || emptyAfterDiscover)
  const selectionMatchesConnected = Boolean(
    connected
    && runtime.data?.selectedModel
    && modelId === runtime.data.selectedModel
    && profile?.id === runtime.data.selectedProfileId,
  )
  const needsApply = !connected || (changingModel && !selectionMatchesConnected)
  const showInstallLink = showRetryConnect

  useEffect(() => {
    if (!active) {
      autoDiscoverKeyRef.current = null
      autoApplyKeyRef.current = null
      return
    }
    if (!autoDiscover || !runtime.data || connected || discoverPending || didDiscover) {
      return
    }
    const key = `${active}:${runtime.data.state}`
    if (autoDiscoverKeyRef.current === key) {
      return
    }
    autoDiscoverKeyRef.current = key
    discoverMutate(DEFAULT_LM_STUDIO_URL)
  }, [
    active,
    autoDiscover,
    connected,
    didDiscover,
    discoverMutate,
    discoverPending,
    runtime.data,
  ])

  const finishLabel = !needsApply
    ? "Done"
    : select.isPending
      ? connected
        ? "Saving…"
        : "Getting ready…"
      : "Use this model"

  const showActions = showCloseAction || needsApply

  return (
    <div className={["runtime-dialog__fields", className].filter(Boolean).join(" ")}>
      <RuntimeStatusLine status={runtime.data} />

      {connected && (
        <div className="runtime-dialog__connected">
          <p>
            Using <strong>{runtime.data?.selectedModel}</strong>
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => discover.mutate(DEFAULT_LM_STUDIO_URL)}
            disabled={discover.isPending}
          >
            {discover.isPending ? "Connecting…" : "Change model"}
          </Button>
        </div>
      )}

      {!connected && (
        <>
          <ol className="runtime-dialog__checklist">
            <li>Install and open LM Studio</li>
            <li>Start Local Server</li>
            <li>Load a model</li>
          </ol>
          {discover.isPending && !didDiscover && (
            <p className="runtime-dialog__status" role="status">
              Looking for a local model server…
            </p>
          )}
          {showRetryConnect && (
            <div className="runtime-dialog__retry">
              <Button
                type="button"
                onClick={() => discover.mutate(DEFAULT_LM_STUDIO_URL)}
                disabled={discover.isPending}
              >
                {discover.isPending ? "Connecting…" : "Connect local server"}
              </Button>
              {showInstallLink && (
                <a
                  className="runtime-dialog__install-link"
                  href={LM_STUDIO_INSTALL_URL}
                  target="_blank"
                  rel="noreferrer"
                >
                  Get LM Studio
                </a>
              )}
            </div>
          )}
        </>
      )}

      {showModelPicker && (
        <>
          {didDiscover && (
            <p role="status">
              {models.length === 1
                ? "Found 1 local model"
                : `Found ${models.length} local models`}
            </p>
          )}
          <div className="runtime-dialog__field">
            <span className="runtime-dialog__field-label" id="runtime-model-label">
              Model
            </span>
            <Select
              value={modelId}
              onValueChange={(value) => {
                setModelOverride(value ?? "")
                setTestResult(null)
              }}
            >
              <SelectTrigger
                aria-labelledby="runtime-model-label"
                aria-label="Model"
                className="runtime-dialog__model-trigger"
              >
                <span>{modelId || "Choose a model"}</span>
              </SelectTrigger>
              <SelectContent position="popper" className="runtime-dialog__model-menu">
                <SelectGroup>
                  {models.map((model) => (
                    <SelectItem key={model.id} value={model.id}>
                      {model.id}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        </>
      )}

      {(discoverError || emptyAfterDiscover || selectError || testResult) && (
        <p
          className={
            discoverError || emptyAfterDiscover || selectError || testResult?.ok === false
              ? "runtime-dialog__error"
              : testResult?.ok
                ? "runtime-dialog__success"
                : undefined
          }
          role="status"
        >
          {!(discoverError || emptyAfterDiscover || selectError) && testResult?.ok && (
            <CheckCircle2 aria-hidden="true" className="runtime-dialog__success-icon" />
          )}
          {discoverError
            ?? (emptyAfterDiscover
              ? "No models found. Load a model in LM Studio, then retry."
              : null)
            ?? selectError
            ?? testResult?.message}
        </p>
      )}

      <div className="runtime-dialog__advanced">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="runtime-dialog__advanced-toggle"
          aria-expanded={advancedOpen}
          onClick={() => setAdvancedOpen((current) => !current)}
        >
          Advanced
          <ChevronDown aria-hidden="true" data-icon="inline-end" />
        </Button>
        {advancedOpen && (
          <div className="runtime-dialog__advanced-body">
            <p className="runtime-dialog__advanced-hint">
              Compatible with LM Studio Local Server on the default port.
            </p>
            <label>
              LM Studio Server URL
              <div className="runtime-dialog__row">
                <Input
                  aria-label="LM Studio Server URL"
                  value={baseUrl}
                  onChange={(event) => setBaseUrlOverride(event.target.value)}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => discover.mutate(baseUrl.trim() || DEFAULT_LM_STUDIO_URL)}
                  disabled={discover.isPending}
                >
                  {discover.isPending ? "Discovering…" : "Discover"}
                </Button>
              </div>
            </label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => test.mutate()}
              disabled={!canUseModel || test.isPending}
            >
              {test.isPending ? "Testing…" : "Test connection"}
            </Button>
          </div>
        )}
      </div>

      {showActions && (
        <div className="local-model-setup__actions">
          {showCloseAction && (
            <Button type="button" variant="outline" onClick={() => onClose?.()}>
              Close
            </Button>
          )}
          {needsApply ? (
            <Button
              type="button"
              onClick={() => select.mutate(undefined)}
              disabled={!canUseModel || select.isPending}
            >
              {finishLabel}
            </Button>
          ) : (
            <Button type="button" onClick={() => onClose?.() ?? onApplied?.()}>
              Done
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
