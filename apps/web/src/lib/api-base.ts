const DEV_FALLBACK = "http://127.0.0.1:8000"

export function resolveApiBaseUrl(
  prod: boolean,
  configured: unknown,
  devFallback = DEV_FALLBACK,
): string {
  if (prod) return ""
  const raw = typeof configured === "string" ? configured : devFallback
  return raw.replace(/\/$/, "")
}
