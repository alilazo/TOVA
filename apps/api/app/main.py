import asyncio
import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.approvals import get_approval_registry
from app.api.approvals import router as approvals_router
from app.api.missions import mission_registry
from app.api.missions import router as missions_router
from app.api.model_profiles import get_model_registry
from app.api.model_profiles import router as model_profiles_router
from app.api.projects import get_project_registry
from app.api.projects import router as projects_router
from app.api.staff import router as staff_router
from app.api.websockets import router as websockets_router
from app.core.config import get_settings
from app.core.launch import maybe_open_ui
from app.core.paths import staff_root
from app.events.factory import persist_events_enabled
from app.orchestration.agent_runner import AgentRunner
from app.orchestration.capabilities import validate_capability_registry
from app.orchestration.coordinator import Coordinator
from app.orchestration.runtime import MissionRuntime
from app.orchestration.tool_definitions import executable_tool_names
from app.providers.openai_compatible import ProviderError
from app.schemas.missions import MissionRecord, MissionStatus
from app.services.staff_profiles import StaffProfileRepository
from app.tools.registry import RepositoryToolRegistry
from app.tools.repository import ProjectWorkspace, WorkspaceError
from app.ui import mount_web_ui

STAFF_ROOT = staff_root()


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    model_registry = get_model_registry()
    settings = get_settings()
    if settings.lm_studio_model and model_registry.selection is None:
        try:
            profile = await model_registry.discover(
                settings.lm_studio_base_url,
                settings.lm_studio_api_token,
            )
            model_registry.select(profile.id, settings.lm_studio_model)
        except (ProviderError, ValueError, KeyError):
            pass
    if persist_events_enabled():
        await mission_registry.restore()
        recents = get_project_registry().recent()
        if recents:
            try:
                get_project_registry().open(recents[0].root)
            except (WorkspaceError, OSError):
                pass
    port = os.environ.get("TOVA_PORT", "8000")
    open_ui_task = asyncio.create_task(_open_ui_when_ready(port))
    try:
        yield
    finally:
        open_ui_task.cancel()
        await mission_registry.aclose()
        await model_registry.aclose()


async def _open_ui_when_ready(port: str) -> None:
    await asyncio.sleep(0.4)
    maybe_open_ui(port)


async def launch_live_runtime(mission: MissionRecord) -> None:
    model_registry = get_model_registry()
    try:
        provider, model = model_registry.resolve(
            mission.model_profile_id,
            mission.model,
        )
    except RuntimeError as exc:
        mission_registry.set_status(mission.id, MissionStatus.FAILED)
        await mission_registry.emit(
            mission.id,
            "mission.failed",
            {"summary": f"Mission failed: {type(exc).__name__}: {str(exc)[:500]}"},
        )
        return
    workspace = ProjectWorkspace(mission.project_root)
    profiles = StaffProfileRepository(STAFF_ROOT).load_all()
    validate_capability_registry(profiles, executable_tool_names())
    settings = get_settings()
    runner = AgentRunner(
        provider=provider,
        model=model,
        tools=RepositoryToolRegistry(workspace),
        approvals=get_approval_registry(),
        workspace=workspace,
        emit=mission_registry.emit,
        staff_profiles=profiles,
        max_iterations=settings.agent_max_iterations,
    )
    runtime = MissionRuntime(
        provider=provider,
        model=model,
        coordinator=Coordinator(provider, model),
        agent_runner=runner,
        profiles=profiles,
        missions=mission_registry,
    )
    await runtime.run(mission)


mission_registry.set_runtime_launcher(launch_live_runtime)


app = FastAPI(
    title="TOVA API",
    version="0.1.0",
    description="Local-first visual agent orchestration API.",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5173", "http://localhost:5173"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(model_profiles_router)
app.include_router(projects_router)
app.include_router(approvals_router)
app.include_router(missions_router)
app.include_router(websockets_router)
app.include_router(staff_router)
mount_web_ui(app)
