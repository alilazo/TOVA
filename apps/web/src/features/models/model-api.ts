import { apiRequest } from "@/lib/api"

export interface DiscoveredModel {
  id: string
  owned_by?: string | null
}

export interface ModelProfile {
  id: string
  provider: string
  base_url: string
  models: DiscoveredModel[]
}

export interface ModelSelection {
  profile_id: string
  model: string
}

export type RuntimeState = "unconfigured" | "connected" | "unavailable"

export interface RuntimeStatus {
  state: RuntimeState
  provider: "lm-studio"
  selectedProfileId: string | null
  selectedModel: string | null
  errorCode: string | null
  error: string | null
}

export interface ConnectionTest {
  connected: boolean
  latency_ms: number
  model: string | null
  error_code: string | null
  error: string | null
}

export function discoverModels(baseUrl: string) {
  return apiRequest<{ profile: ModelProfile; models: DiscoveredModel[] }>(
    "/api/model-profiles/discover",
    {
    method: "POST",
    body: JSON.stringify({ base_url: baseUrl }),
    },
  ).then((response) => response.profile)
}

export function listModelProfiles() {
  return apiRequest<ModelProfile[]>("/api/model-profiles")
}

function lmClientDebug(phase: string, details: object) {
  if (!import.meta.env.DEV) {
    return
  }
  console.debug(`[TOVA][lm-studio] ${phase}`, details)
}

export function selectModel(selection: ModelSelection) {
  lmClientDebug("model_selection_request", selection)
  return apiRequest<ModelSelection>("/api/runtime/model-selection", {
    method: "PUT",
    body: JSON.stringify(selection),
  }).then((result) => {
    lmClientDebug("model_selection_response", result)
    return result
  })
}

export function getRuntimeStatus() {
  lmClientDebug("runtime_status_request", {})
  return apiRequest<{
    state: RuntimeState
    provider: "lm-studio"
    selected_profile_id?: string
    selected_model?: string
    error_code?: string
    error?: string
  }>("/api/runtime/status").then((response) => {
    const status = {
      state: response.state,
      provider: response.provider,
      selectedProfileId: response.selected_profile_id ?? null,
      selectedModel: response.selected_model ?? null,
      errorCode: response.error_code ?? null,
      error: response.error ?? null,
    }
    lmClientDebug("runtime_status_response", status)
    return status
  })
}

export function testModel(profileId: string, model: string) {
  lmClientDebug("connection_test_request", { profileId, model })
  return apiRequest<ConnectionTest>("/api/model-profiles/test", {
    method: "POST",
    body: JSON.stringify({ profile_id: profileId, model }),
  }).then((result) => {
    lmClientDebug("connection_test_response", result)
    return result
  })
}
