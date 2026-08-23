# Task 3 Review (post-fix)
## FILE: apps/web/src/features/mission/typewriter.ts
```
export type TypewriterHandle = {
  cancel: () => void
  done: Promise<void>
}

/** Reveal `target` into `onUpdate` in chunks. Cancelling resolves `done` without error. */
export function startTypewriter(options: {
  target: string
  previous?: string
  charsPerTick?: number
  tickMs?: number
  onUpdate: (visible: string) => void
}): TypewriterHandle {
  const {
    target,
    previous,
    charsPerTick = 5,
    tickMs = 24,
    onUpdate,
  } = options

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

```
## FILE: apps/web/tests/typewriter.test.ts
```
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { startTypewriter } from "@/features/mission/typewriter"

describe("startTypewriter", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it("reveals content progressively", async () => {
    const frames: string[] = []
    const handle = startTypewriter({
      target: "abcdef",
      charsPerTick: 2,
      tickMs: 10,
      onUpdate: (value) => frames.push(value),
    })
    await vi.advanceTimersByTimeAsync(100)
    await handle.done
    expect(frames.at(-1)).toBe("abcdef")
    expect(frames.length).toBeGreaterThan(1)
  })

  it("appends when previous is a prefix", async () => {
    const frames: string[] = []
    const handle = startTypewriter({
      previous: "ab",
      target: "abcd",
      charsPerTick: 2,
      tickMs: 10,
      onUpdate: (value) => frames.push(value),
    })
    await vi.advanceTimersByTimeAsync(50)
    await handle.done
    expect(frames[0]).toBe("ab")
    expect(frames.at(-1)).toBe("abcd")
  })

  it("full rewrites when previous equals target", async () => {
    const frames: string[] = []
    const handle = startTypewriter({
      previous: "hello",
      target: "hello",
      charsPerTick: 2,
      tickMs: 10,
      onUpdate: (value) => frames.push(value),
    })
    await vi.advanceTimersByTimeAsync(100)
    await handle.done
    expect(frames[0]).toBe("")
    expect(frames.at(-1)).toBe("hello")
    expect(frames.length).toBeGreaterThan(1)
  })

  it("cancel stops further updates", async () => {
    const frames: string[] = []
    const handle = startTypewriter({
      target: "abcdefghij",
      charsPerTick: 1,
      tickMs: 10,
      onUpdate: (value) => frames.push(value),
    })
    await vi.advanceTimersByTimeAsync(30)
    handle.cancel()
    const count = frames.length
    await vi.advanceTimersByTimeAsync(100)
    expect(frames.length).toBe(count)
    await handle.done
  })
})

```

