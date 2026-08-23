from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from app.core.config import get_settings
from app.providers.lm_studio import LMStudioProvider
from app.providers.openai_compatible import ProviderError
from app.schemas.models import DiscoveredModel, ModelConnectionTest
from app.services.model_profiles import (
    ModelProfileRegistry,
    ModelProfileView,
    ModelSelection,
)

router = APIRouter(prefix="/api")


class DiscoveryRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    base_url: str = Field(min_length=1)
    api_token: str | None = None


class DiscoveryResponse(BaseModel):
    profile: ModelProfileView
    models: list[DiscoveredModel]


class TestRequest(BaseModel):
    profile_id: str
    model: str | None = None


class SelectionRequest(BaseModel):
    profile_id: str
    model: str


class RuntimeStatus(BaseModel):
    state: Literal["unconfigured", "connected", "unavailable"]
    provider: Literal["lm-studio"]
    version: str
    selected_profile_id: str | None = None
    selected_model: str | None = None
    error_code: str | None = None
    error: str | None = None


_settings = get_settings()
_registry = ModelProfileRegistry(
    allow_public=_settings.lm_studio_allow_public_host,
    provider_factory=lambda base_url, token: LMStudioProvider(
        base_url=base_url,
        api_token=token,
        timeout=_settings.lm_studio_timeout_seconds,
    ),
)


def get_model_registry() -> ModelProfileRegistry:
    return _registry


Registry = Annotated[ModelProfileRegistry, Depends(get_model_registry)]


@router.get("/model-profiles", response_model=list[ModelProfileView])
async def list_profiles(registry: Registry) -> list[ModelProfileView]:
    return registry.list()


@router.post("/model-profiles/discover", response_model=DiscoveryResponse)
async def discover(request: DiscoveryRequest, registry: Registry) -> DiscoveryResponse:
    try:
        profile = await registry.discover(request.base_url, request.api_token)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except ProviderError as exc:
        raise HTTPException(
            status_code=503,
            detail={"code": exc.code.value, "message": str(exc)},
        ) from exc
    return DiscoveryResponse(profile=profile, models=profile.models)


@router.post("/model-profiles/test", response_model=ModelConnectionTest)
async def test_profile(request: TestRequest, registry: Registry) -> ModelConnectionTest:
    try:
        return await registry.test(request.profile_id, request.model)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Model profile not found") from exc


@router.put("/runtime/model-selection", response_model=ModelSelection)
async def select_model(request: SelectionRequest, registry: Registry) -> ModelSelection:
    try:
        return registry.select(request.profile_id, request.model)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Profile or model not found") from exc


@router.get("/runtime/status", response_model=RuntimeStatus, response_model_exclude_none=True)
async def runtime_status(registry: Registry) -> RuntimeStatus:
    try:
        health = await registry.runtime_health()
    except Exception:
        return RuntimeStatus(
            state="unavailable",
            provider="lm-studio",
            version="0.1.0",
            error_code="model_unavailable",
            error="Status check failed — retry connecting your local model.",
        )
    return RuntimeStatus(
        state=health.state,
        provider="lm-studio",
        version="0.1.0",
        selected_profile_id=health.selected_profile_id,
        selected_model=health.selected_model,
        error_code=health.error_code,
        error=health.error,
    )
