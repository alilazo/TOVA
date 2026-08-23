export type TypewriterHandle = {
  cancel: () => void
  done: Promise<void>
}

const DEFAULT_CHARS_PER_TICK = 5
const DEFAULT_TICK_MS = 24
/** Cap default reveal duration so multi-KB files finish in a few seconds. */
const TARGET_DURATION_MS = 3000

/** Scale default chunk size: max(5, ceil(remaining / floor(3000 / tickMs))). */
export function resolveDefaultCharsPerTick(
  remainingLength: number,
  tickMs: number = DEFAULT_TICK_MS,
): number {
  const maxTicks = Math.max(1, Math.floor(TARGET_DURATION_MS / tickMs))
  return Math.max(DEFAULT_CHARS_PER_TICK, Math.ceil(remainingLength / maxTicks))
}

/** Reveal `target` into `onUpdate` in chunks. Cancelling resolves `done` without error. */
export function startTypewriter(options: {
  target: string
  previous?: string
  charsPerTick?: number
  tickMs?: number
  onUpdate: (visible: string) => void
}): TypewriterHandle {
  const { target, previous, tickMs = DEFAULT_TICK_MS, onUpdate } = options

  let cancelled = false
  let timerId: ReturnType<typeof setInterval> | undefined
  let resolveDone!: () => void
  const done = new Promise<void>((resolve) => {
    resolveDone = resolve
  })

  const appendMode =
    previous !== undefined &&
    target.startsWith(previous) &&
    previous.length < target.length
  const visibleStart = appendMode ? previous : ""
  const remaining = appendMode ? target.slice(previous.length) : target

  const charsPerTick =
    options.charsPerTick ?? resolveDefaultCharsPerTick(remaining.length, tickMs)

  let index = 0

  const finish = () => {
    if (timerId !== undefined) {
      clearInterval(timerId)
      timerId = undefined
    }
    resolveDone()
  }

  const tick = () => {
    if (cancelled) {
      finish()
      return
    }

    index = Math.min(index + charsPerTick, remaining.length)
    onUpdate(visibleStart + remaining.slice(0, index))

    if (index >= remaining.length) {
      finish()
    }
  }

  onUpdate(visibleStart)

  if (remaining.length === 0) {
    finish()
  } else {
    timerId = setInterval(tick, tickMs)
  }

  const cancel = () => {
    cancelled = true
    finish()
  }

  return { cancel, done }
}
