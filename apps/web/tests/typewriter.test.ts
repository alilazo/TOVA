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

  it("scales default charsPerTick so multi-KB targets finish within ~3s", async () => {
    // Formula: charsPerTick = max(5, ceil(remaining / floor(3000 / tickMs)))
    // With tickMs=24 → maxTicks=125 → 10_000 chars → 80/tick → ≤ 3000ms
    const target = "x".repeat(10_000)
    const frames: string[] = []
    const handle = startTypewriter({
      target,
      onUpdate: (value) => frames.push(value),
    })
    await vi.advanceTimersByTimeAsync(3000)
    await handle.done
    expect(frames.at(-1)).toBe(target)
    expect(frames.length).toBeGreaterThan(1)
    expect(frames.length).toBeLessThanOrEqual(126)
  })
})
