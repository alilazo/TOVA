import { useEffect, useState } from "react"

import { formatElapsed } from "@/lib/utils"

export function useMissionElapsed(
  startedAt: string | null | undefined,
  endedAt: string | null | undefined,
): string | null {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!startedAt || endedAt) return undefined
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [startedAt, endedAt])

  if (!startedAt) return null
  const startMs = Date.parse(startedAt)
  if (Number.isNaN(startMs)) return null
  const endMs = endedAt ? Date.parse(endedAt) : now
  if (Number.isNaN(endMs)) return null
  return formatElapsed(endMs - startMs)
}
