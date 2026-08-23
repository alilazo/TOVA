### Task 6: Approval dialog for file deletes

**Files:**
- Modify: `apps/web/src/features/mission/mission-api.ts`
- Modify: `apps/web/src/components/approvals/CommandApprovalDialog.tsx`
- Test: `apps/web/tests/command-approval-dialog.test.tsx` (create)

**Interfaces:**
- Consumes: `ApprovalRequest` with `request.kind === "command" | "file_delete"`
- Produces: delete modal title **File delete approval required**; body **`{staff_display_name} wants to delete `{path}``**; button **Approve and delete**

- [ ] **Step 1: Write the failing UI test**

Create `apps/web/tests/command-approval-dialog.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { CommandApprovalDialog } from "@/components/approvals/CommandApprovalDialog"
import * as missionApi from "@/features/mission/mission-api"

vi.mock("@/features/mission/mission-api", async () => {
  const actual = await vi.importActual<typeof missionApi>(
    "@/features/mission/mission-api",
  )
  return {
    ...actual,
    listApprovals: vi.fn(),
    resolveApproval: vi.fn(),
  }
})

function renderDialog() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <CommandApprovalDialog missionId="mission-1" />
    </QueryClientProvider>,
  )
}

describe("CommandApprovalDialog", () => {
  it("shows file delete approval copy", async () => {
    vi.mocked(missionApi.listApprovals).mockResolvedValue([
      {
        id: "approval_1",
        status: "pending",
        request: {
          kind: "file_delete",
          mission_id: "mission-1",
          staff_id: "staff_ava",
          staff_display_name: "Ava",
          path: "hello.html",
          purpose: "Remove unused hello page",
        },
      },
    ])
    renderDialog()
    expect(
      await screen.findByText("File delete approval required"),
    ).toBeInTheDocument()
    expect(screen.getByText(/Ava wants to delete/)).toBeInTheDocument()
    expect(screen.getByText("hello.html")).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: /Approve and delete/i }),
    ).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @tova/web exec vitest run tests/command-approval-dialog.test.tsx -v
```

Expected: FAIL — types/UI still command-only.

- [ ] **Step 3: Update types + dialog**

In `mission-api.ts`, replace `ApprovalRequest` with a discriminated union on `request.kind` (`"command"` | `"file_delete"`) matching the API schemas (include `staff_display_name` + `path` for delete).

In `CommandApprovalDialog.tsx`, branch on `pending.request.kind` (treat missing `kind` as `"command"`):

- Delete title: `File delete approval required`
- Description: `TOVA agents cannot delete project files until you approve this exact request.`
- Body: `{staff_display_name} wants to delete `{path}`` plus Purpose
- Primary button: `Approve and delete`
- Keep existing command markup when `kind === "command"`

- [ ] **Step 4: Run UI + related tests**

```bash
pnpm --filter @tova/web exec vitest run tests/command-approval-dialog.test.tsx tests/app-staff-source.test.tsx
```

Expected: PASS

- [ ] **Step 5: Commit only if the user asked** — otherwise skip.

---
