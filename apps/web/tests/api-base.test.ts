import { describe, expect, it } from "vitest"

import { resolveApiBaseUrl } from "@/lib/api-base"

describe("resolveApiBaseUrl", () => {
  it("uses same-origin in production even if a Vite API URL is configured", () => {
    expect(resolveApiBaseUrl(true, "http://127.0.0.1:8000")).toBe("")
  })

  it("uses the configured URL during development", () => {
    expect(resolveApiBaseUrl(false, "http://127.0.0.1:8000")).toBe(
      "http://127.0.0.1:8000",
    )
  })

  it("falls back to the local API during development", () => {
    expect(resolveApiBaseUrl(false, undefined)).toBe("http://127.0.0.1:8000")
  })
})
