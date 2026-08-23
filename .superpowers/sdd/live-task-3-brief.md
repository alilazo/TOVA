### Task 3: Serve safe Markdown-backed staff profiles

**Files:**
- Modify: `apps/api/app/schemas/staff.py`
- Create: `apps/api/app/api/staff.py`
- Modify: `apps/api/app/main.py`
- Create: `apps/api/tests/test_staff_api.py`

**Interfaces:**

```python
class StaffProfileView(BaseModel):
    id: str
    employee_id: str
    slug: str
    name: str
    display_name: str
    role: str
    role_key: str
    department: str
    seniority: str
    avatar: str
    status: str
    description: str
    model_profile: str
    tools: list[str]
    can_delegate: bool
    can_approve: bool
    tags: list[str]
```

The API does not expose `sections`, `permissions`, `source_path`, temperature, context limits, credentials, or prompt text.

- [ ] **Step 1: Write failing staff API tests**

```python
@pytest.mark.asyncio
async def test_staff_api_returns_safe_markdown_metadata() -> None:
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        response = await client.get("/api/staff")

    assert response.status_code == 200
    staff = response.json()
    assert len(staff) == 7
    alex = next(item for item in staff if item["id"] == "staff_alex")
    assert alex["display_name"] == "Alex"
    assert alex["role_key"] == "project_coordinator"
    assert "sections" not in alex
    assert "permissions" not in alex
    assert "source_path" not in alex
```

- [ ] **Step 2: Run and confirm RED**

```powershell
uv run --directory apps/api pytest tests/test_staff_api.py -v
```

Expected: `404 Not Found`.

- [ ] **Step 3: Define explicit staff fields**

Add the metadata fields to `StaffProfileDocument` so frontmatter is validated rather than hidden in `model_extra`. Add:

```python
def to_view(self) -> StaffProfileView:
    return StaffProfileView.model_validate(
        self.model_dump(include=set(StaffProfileView.model_fields))
    )
```

- [ ] **Step 4: Add and wire the router**

```python
router = APIRouter(prefix="/api")
STAFF_ROOT = Path(__file__).resolve().parents[4] / "HiPo-Staff" / "staff"

@router.get("/staff", response_model=list[StaffProfileView])
async def list_staff() -> list[StaffProfileView]:
    return [
        profile.to_view()
        for profile in StaffProfileRepository(STAFF_ROOT).load_all()
    ]
```

Catch `StaffProfileError` and return HTTP 500 with `"Staff profiles are unavailable"` without leaking file contents.

- [ ] **Step 5: Run staff and existing profile tests**

```powershell
uv run --directory apps/api pytest tests/test_staff_api.py tests/test_staff_profiles.py -v
```

Expected: all pass.

## Global constraints

- `/api/staff` is the sole production staff metadata source.
- Public staff responses expose only the explicit safe view fields above.
- Never expose credentials, prompt text, profile sections, permissions, source paths, model temperatures, or context limits.
- Preserve the product and directory names `TOVA` and `HiPo-Staff`.
- Test fakes and mocks remain isolated to test code.
- Write behavior tests before implementation and capture RED/GREEN evidence.
- No Git repository exists; do not attempt commits.
