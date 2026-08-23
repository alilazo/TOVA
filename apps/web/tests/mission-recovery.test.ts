import { describe, expect, it } from "vitest"

import { recoveryActionForError, recoveryMessageForClose } from "@/features/mission/recovery"

describe("recoveryMessageForClose", () => {
  it("explains failed replay after an API restart", () => {
    expect(recoveryMessageForClose(4404)).toMatch(/API restarted/)
    expect(recoveryActionForError(recoveryMessageForClose(4404) ?? "")).toMatch(
      /Reopen the project/i,
    )
  })

  it("does not treat a clean close as a recovery failure", () => {
    expect(recoveryMessageForClose(1000)).toBeNull()
  })

  it("tells the user how to recover a missing local model", () => {
    expect(recoveryActionForError("Unavailable — start your local model server")).toMatch(
      /Start LM Studio Local Server/i,
    )
  })
})
