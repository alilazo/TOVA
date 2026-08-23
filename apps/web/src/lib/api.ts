import { resolveApiBaseUrl } from "./api-base"

const API_BASE_URL = resolveApiBaseUrl(
  import.meta.env.PROD,
  import.meta.env.VITE_TOVA_API_URL,
)

export function apiUrl(path: string) {
  return `${API_BASE_URL}${path}`
}

export function websocketUrl(path: string) {
  const href = apiUrl(path)
  const url = href.startsWith("http://") || href.startsWith("https://")
    ? new URL(href)
    : new URL(href, window.location.origin)
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:"
  return url.toString()
}

function errorDetail(body: { detail?: unknown } | null, status: number): string {
  const detail = body?.detail
  if (typeof detail === "string" && detail.trim()) return detail
  if (Array.isArray(detail)) {
    const parts = detail
      .map((item) => {
        if (typeof item === "string") return item
        if (item && typeof item === "object" && "msg" in item) {
          return String((item as { msg: unknown }).msg)
        }
        return null
      })
      .filter((item): item is string => Boolean(item))
    if (parts.length > 0) return parts.join("; ")
  }
  return `TOVA API request failed (${status})`
}

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json")
  }

  const controller = new AbortController()
  const timeoutMs = 15_000
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const onAbort = () => controller.abort()
  init?.signal?.addEventListener("abort", onAbort, { once: true })

  let response: Response
  try {
    response = await fetch(apiUrl(path), {
      ...init,
      headers,
      signal: controller.signal,
    })
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("TOVA API request timed out", { cause: error })
    }
    throw error
  } finally {
    clearTimeout(timer)
    init?.signal?.removeEventListener("abort", onAbort)
  }

  if (!response.ok) {
    const body = await response.json().catch(() => null) as { detail?: unknown } | null
    throw new Error(errorDetail(body, response.status))
  }

  return response.json() as Promise<T>
}
