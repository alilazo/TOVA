from __future__ import annotations

import builtins
import ipaddress
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any, Literal
from urllib.parse import urlparse
from uuid import uuid4

from pydantic import BaseModel, ConfigDict

from app.providers.lm_studio import LMStudioProvider
from app.providers.openai_compatible import (
    OpenAICompatibleProvider,
    ProviderError,
    ProviderErrorCode,
)
from app.schemas.models import DiscoveredModel, ModelConnectionTest

ProviderFactory = Callable[[str, str | None], OpenAICompatibleProvider]

DEFAULT_LM_STUDIO_BASE_URL = "http://127.0.0.1:1234/v1"
PREFERRED_MODEL_ID = "qwen/qwen3.6-35b-a3b"
WAITING_FOR_MODEL_MESSAGE = "Local model server is running — load a model"
SERVER_DOWN_MESSAGE = "Unavailable — start your local model server"


class ModelProfileView(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    provider: str
    base_url: str
    models: list[DiscoveredModel]


class ModelSelection(BaseModel):
    profile_id: str
    model: str


class RuntimeHealth(BaseModel):
    state: Literal["unconfigured", "connected", "unavailable"]
    selected_profile_id: str | None = None
    selected_model: str | None = None
    error_code: str | None = None
    error: str | None = None


@dataclass
class _StoredProfile:
    view: ModelProfileView
    provider: OpenAICompatibleProvider


def _default_factory(base_url: str, token: str | None) -> OpenAICompatibleProvider:
    return LMStudioProvider(base_url=base_url, api_token=token)


def validate_base_url(base_url: str, *, allow_public: bool = False) -> str:
    parsed = urlparse(base_url.strip())
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ValueError("Base URL must use HTTP or HTTPS")
    if parsed.username is not None or parsed.password is not None:
        raise ValueError("Base URL must not contain credentials")
    if parsed.query or parsed.fragment:
        raise ValueError("Base URL must not contain a query or fragment")
    host = parsed.hostname
    is_local = host == "localhost"
    try:
        address = ipaddress.ip_address(host)
        is_local = is_local or address.is_private or address.is_loopback
    except ValueError:
        pass
    if not is_local and not allow_public:
        raise ValueError("Public model server hosts are disabled")
    path = parsed.path.rstrip("/") or "/v1"
    return parsed._replace(path=path, params="", query="", fragment="").geturl()


class ModelProfileRegistry:
    def __init__(
        self,
        *,
        provider_factory: ProviderFactory = _default_factory,
        allow_public: bool = False,
    ) -> None:
        self._provider_factory = provider_factory
        self._allow_public = allow_public
        self._profiles: dict[str, _StoredProfile] = {}
        self.selection: ModelSelection | None = None

    async def discover(self, base_url: str, token: str | None = None) -> ModelProfileView:
        validated = validate_base_url(base_url, allow_public=self._allow_public)
        provider = self._provider_factory(validated, token)
        models = await provider.list_models()
        profile = ModelProfileView(
            id=f"profile_{uuid4().hex}",
            provider="lm-studio",
            base_url=validated,
            models=models,
        )
        self._profiles[profile.id] = _StoredProfile(view=profile, provider=provider)
        return profile

    def list(self) -> builtins.list[ModelProfileView]:
        return [profile.view for profile in self._profiles.values()]

    async def test(self, profile_id: str, model: str | None) -> ModelConnectionTest:
        stored = self._profiles.get(profile_id)
        if stored is None:
            raise KeyError(profile_id)
        return await stored.provider.test_connection(model)

    def select(self, profile_id: str, model: str) -> ModelSelection:
        stored = self._profiles.get(profile_id)
        if stored is None or all(item.id != model for item in stored.view.models):
            raise KeyError(model)
        self.selection = ModelSelection(profile_id=profile_id, model=model)
        return self.selection

    def provider_for_selection(self) -> OpenAICompatibleProvider:
        if self.selection is None:
            raise RuntimeError("No model selected")
        return self._profiles[self.selection.profile_id].provider

    def _profile_for_base_url(self, base_url: str) -> _StoredProfile | None:
        validated = validate_base_url(base_url, allow_public=self._allow_public)
        for stored in self._profiles.values():
            if stored.view.base_url == validated:
                return stored
        return None

    def _probe_base_url(self) -> str:
        selection = self.selection
        if selection is not None:
            stored = self._profiles.get(selection.profile_id)
            if stored is not None:
                return stored.view.base_url
        return DEFAULT_LM_STUDIO_BASE_URL

    def _provider_for_base_url(self, base_url: str) -> OpenAICompatibleProvider:
        validated = validate_base_url(base_url, allow_public=self._allow_public)
        existing = self._profile_for_base_url(validated)
        if existing is not None:
            return existing.provider
        return self._provider_factory(validated, None)

    async def _inspect_loaded_models(
        self,
        provider: OpenAICompatibleProvider,
    ) -> builtins.list[dict[str, Any]]:
        if not isinstance(provider, LMStudioProvider):
            models = await provider.list_models()
            return [{"id": model.id, "state": "loaded"} for model in models]
        states = await provider.inspect_model_states()
        return [
            item
            for item in states
            if item.get("state") == "loaded" and item.get("id")
        ]

    async def _inspect_loaded_model_ids(
        self,
        provider: OpenAICompatibleProvider,
    ) -> builtins.list[str]:
        return [str(item["id"]) for item in await self._inspect_loaded_models(provider)]

    def _pick_loaded_model(self, loaded_ids: builtins.list[str]) -> str:
        if PREFERRED_MODEL_ID in loaded_ids:
            return PREFERRED_MODEL_ID
        return loaded_ids[0]

    async def _ensure_profile_for_loaded(
        self,
        base_url: str,
        provider: OpenAICompatibleProvider,
        loaded_ids: builtins.list[str],
    ) -> ModelProfileView:
        validated = validate_base_url(base_url, allow_public=self._allow_public)
        try:
            listed = await provider.list_models()
        except ProviderError:
            listed = [DiscoveredModel(id=model_id) for model_id in loaded_ids]
        model_ids = {model.id for model in listed}
        for model_id in loaded_ids:
            if model_id not in model_ids:
                listed.append(DiscoveredModel(id=model_id))

        existing = self._profile_for_base_url(validated)
        if existing is not None:
            existing.view = existing.view.model_copy(update={"models": listed})
            return existing.view

        profile = ModelProfileView(
            id=f"profile_{uuid4().hex}",
            provider="lm-studio",
            base_url=validated,
            models=listed,
        )
        self._profiles[profile.id] = _StoredProfile(view=profile, provider=provider)
        return profile

    async def runtime_health(self) -> RuntimeHealth:
        base_url = self._probe_base_url()
        provider = self._provider_for_base_url(base_url)
        selection = self.selection
        if (
            isinstance(provider, LMStudioProvider)
            and provider.is_generating
            and selection is not None
        ):
            return RuntimeHealth(
                state="connected",
                selected_profile_id=selection.profile_id,
                selected_model=selection.model,
            )

        try:
            loaded_rows = await self._inspect_loaded_models(provider)
        except ProviderError as exc:
            return RuntimeHealth(
                state="unavailable",
                selected_profile_id=selection.profile_id if selection else None,
                selected_model=selection.model if selection else None,
                error_code=exc.code.value,
                error=SERVER_DOWN_MESSAGE,
            )

        loaded_ids = [str(item["id"]) for item in loaded_rows]
        if not loaded_ids:
            self.selection = None
            return RuntimeHealth(
                state="unconfigured",
                error=WAITING_FOR_MODEL_MESSAGE,
            )

        chosen = self._pick_loaded_model(loaded_ids)
        existing = self._profile_for_base_url(base_url)
        if (
            existing is not None
            and selection is not None
            and selection.profile_id == existing.view.id
            and selection.model == chosen
            and any(model.id == chosen for model in existing.view.models)
        ):
            return RuntimeHealth(
                state="connected",
                selected_profile_id=existing.view.id,
                selected_model=chosen,
            )

        profile = await self._ensure_profile_for_loaded(base_url, provider, loaded_ids)
        self.select(profile.id, chosen)
        result = await self.test(profile.id, chosen)
        if result.connected:
            return RuntimeHealth(
                state="connected",
                selected_profile_id=profile.id,
                selected_model=chosen,
            )
        return RuntimeHealth(
            state="unavailable",
            selected_profile_id=profile.id,
            selected_model=chosen,
            error_code=result.error_code,
            error=result.error or SERVER_DOWN_MESSAGE,
        )

    async def require_selected_available(
        self,
        profile_id: str,
        model: str,
    ) -> tuple[OpenAICompatibleProvider, str]:
        if self.selection != ModelSelection(profile_id=profile_id, model=model):
            raise RuntimeError("Mission model must match the selected local model")
        provider, selected_model = self.resolve(profile_id, model)
        health = await provider.test_connection(selected_model)
        if not health.connected:
            raise ProviderError(
                ProviderErrorCode(health.error_code or "model_unavailable"),
                health.error or "Selected local model is unavailable",
            )
        return provider, selected_model

    def resolve(
        self,
        profile_id: str | None = None,
        model: str | None = None,
    ) -> tuple[OpenAICompatibleProvider, str]:
        selection = self.selection
        selected_profile = profile_id or (selection.profile_id if selection else None)
        selected_model = model or (selection.model if selection else None)
        if selected_profile is None or selected_model is None:
            raise RuntimeError("A live mission requires a selected model profile")
        stored = self._profiles.get(selected_profile)
        if stored is None or all(item.id != selected_model for item in stored.view.models):
            raise RuntimeError("Selected model profile or model is unavailable")
        return stored.provider, selected_model

    async def aclose(self) -> None:
        for stored in self._profiles.values():
            await stored.provider.aclose()
