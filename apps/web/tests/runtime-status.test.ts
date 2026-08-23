import { afterEach, describe, expect, it, vi } from "vitest"

import { getRuntimeStatus } from "@/features/models/model-api"

function respondWith(body: unknown) {
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({
    ok: true,
    json: () => Promise.resolve(body),
  } as Response)))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("getRuntimeStatus", () => {
  it.each([
    {
      name: "unconfigured",
      response: {
        state: "unconfigured",
        provider: "lm-studio",
        version: "0.1.0",
      },
      expected: {
        state: "unconfigured",
        provider: "lm-studio",
        selectedProfileId: null,
        selectedModel: null,
        errorCode: null,
        error: null,
      },
    },
    {
      name: "connected",
      response: {
        state: "connected",
        provider: "lm-studio",
        version: "0.1.0",
        selected_profile_id: "profile_1",
        selected_model: "qwen/qwen3.6-35b-a3b",
      },
      expected: {
        state: "connected",
        provider: "lm-studio",
        selectedProfileId: "profile_1",
        selectedModel: "qwen/qwen3.6-35b-a3b",
        errorCode: null,
        error: null,
      },
    },
    {
      name: "unavailable",
      response: {
        state: "unavailable",
        provider: "lm-studio",
        version: "0.1.0",
        selected_profile_id: "profile_1",
        selected_model: "qwen/qwen3.6-35b-a3b",
        error_code: "disconnected",
        error: "LM Studio is not reachable",
      },
      expected: {
        state: "unavailable",
        provider: "lm-studio",
        selectedProfileId: "profile_1",
        selectedModel: "qwen/qwen3.6-35b-a3b",
        errorCode: "disconnected",
        error: "LM Studio is not reachable",
      },
    },
  ])("maps the $name runtime state", async ({ response, expected }) => {
    respondWith(response)

    await expect(getRuntimeStatus()).resolves.toEqual(expected)
  })
})
