import asyncio

import httpx
import pytest
from httpx import ASGITransport, AsyncClient

from app.api.model_profiles import get_model_registry
from app.main import app
from app.providers.lm_studio import LMStudioProvider
from app.schemas.models import ChatCompletionRequest, ChatMessage
from app.services.model_profiles import ModelProfileRegistry


def registry_with_transport(handler: httpx.AsyncBaseTransport) -> ModelProfileRegistry:
    return ModelProfileRegistry(
        provider_factory=lambda base_url, token: LMStudioProvider(
            base_url=base_url,
            api_token=token,
            client=httpx.AsyncClient(transport=handler),
        )
    )


def _v0_models(data: list[dict]) -> httpx.Response:
    return httpx.Response(200, json={"object": "list", "data": data})


def _v1_models(ids: list[str]) -> httpx.Response:
    return httpx.Response(200, json={"data": [{"id": model_id} for model_id in ids]})


@pytest.mark.asyncio
async def test_runtime_health_unavailable_when_lm_studio_disconnected() -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("Connection refused", request=request)

    registry = registry_with_transport(httpx.MockTransport(handler))
    health = await registry.runtime_health()

    assert health.state == "unavailable"
    assert health.error_code == "disconnected"
    assert health.error is not None
    assert "local model server" in health.error.lower()


@pytest.mark.asyncio
async def test_runtime_health_waiting_when_server_up_but_no_model_loaded() -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        if "/api/v0/models" in str(request.url):
            return _v0_models(
                [
                    {"id": "laguna-xs-2.1", "state": "not-loaded"},
                    {"id": "qwen/qwen3.6-35b-a3b", "state": "not-loaded"},
                ]
            )
        return _v1_models(["laguna-xs-2.1", "qwen/qwen3.6-35b-a3b"])

    registry = registry_with_transport(httpx.MockTransport(handler))
    health = await registry.runtime_health()

    assert health.state == "unconfigured"
    assert health.selected_model is None
    assert health.error == "Local model server is running — load a model"


@pytest.mark.asyncio
async def test_runtime_health_auto_selects_preferred_loaded_model() -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        if "/api/v0/models" in str(request.url):
            return _v0_models(
                [
                    {"id": "laguna-xs-2.1", "state": "loaded"},
                    {"id": "qwen/qwen3.6-35b-a3b", "state": "loaded"},
                ]
            )
        return _v1_models(["laguna-xs-2.1", "qwen/qwen3.6-35b-a3b"])

    registry = registry_with_transport(httpx.MockTransport(handler))
    health = await registry.runtime_health()

    assert health.state == "connected"
    assert health.selected_model == "qwen/qwen3.6-35b-a3b"
    assert registry.selection is not None
    assert registry.selection.model == "qwen/qwen3.6-35b-a3b"


@pytest.mark.asyncio
async def test_runtime_health_auto_selects_first_loaded_when_preferred_missing() -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        if "/api/v0/models" in str(request.url):
            return _v0_models(
                [
                    {"id": "laguna-xs-2.1", "state": "loaded"},
                    {"id": "openai/gpt-oss-20b", "state": "not-loaded"},
                ]
            )
        return _v1_models(["laguna-xs-2.1", "openai/gpt-oss-20b"])

    registry = registry_with_transport(httpx.MockTransport(handler))
    health = await registry.runtime_health()

    assert health.state == "connected"
    assert health.selected_model == "laguna-xs-2.1"


@pytest.mark.asyncio
async def test_runtime_health_follows_loaded_model_over_prior_selection() -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        if "/api/v0/models" in str(request.url):
            return _v0_models(
                [
                    {"id": "laguna-xs-2.1", "state": "not-loaded"},
                    {"id": "openai/gpt-oss-20b", "state": "loaded"},
                ]
            )
        return _v1_models(["laguna-xs-2.1", "openai/gpt-oss-20b"])

    registry = registry_with_transport(httpx.MockTransport(handler))
    profile = await registry.discover("http://127.0.0.1:1234/v1")
    registry.select(profile.id, "laguna-xs-2.1")

    health = await registry.runtime_health()

    assert health.state == "connected"
    assert health.selected_model == "openai/gpt-oss-20b"


@pytest.mark.asyncio
async def test_runtime_health_reuses_profile_for_same_base_url() -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        if "/api/v0/models" in str(request.url):
            return _v0_models([{"id": "laguna-xs-2.1", "state": "loaded"}])
        return _v1_models(["laguna-xs-2.1"])

    registry = registry_with_transport(httpx.MockTransport(handler))
    first = await registry.runtime_health()
    second = await registry.runtime_health()

    assert first.state == "connected"
    assert second.state == "connected"
    assert first.selected_profile_id == second.selected_profile_id
    assert len(registry.list()) == 1


@pytest.mark.asyncio
async def test_runtime_status_endpoint_auto_captures_loaded_model() -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        if "/api/v0/models" in str(request.url):
            return _v0_models([{"id": "qwen/qwen3.6-35b-a3b", "state": "loaded"}])
        return _v1_models(["qwen/qwen3.6-35b-a3b"])

    registry = registry_with_transport(httpx.MockTransport(handler))
    app.dependency_overrides[get_model_registry] = lambda: registry
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            status = await client.get("/api/runtime/status")
    finally:
        app.dependency_overrides.clear()

    assert status.status_code == 200
    body = status.json()
    assert body["state"] == "connected"
    assert body["selected_model"] == "qwen/qwen3.6-35b-a3b"


@pytest.mark.asyncio
async def test_runtime_status_endpoint_returns_unavailable_on_unexpected_error() -> None:
    class BrokenRegistry:
        selection = None

        async def runtime_health(self):
            raise RuntimeError("registry crashed")

    app.dependency_overrides[get_model_registry] = lambda: BrokenRegistry()
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            status = await client.get("/api/runtime/status")
    finally:
        app.dependency_overrides.clear()

    assert status.status_code == 200
    body = status.json()
    assert body["state"] == "unavailable"
    assert body["error_code"] == "model_unavailable"
    assert "Status check failed" in body["error"]


@pytest.mark.asyncio
async def test_runtime_status_endpoint_reports_waiting_copy() -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        if "/api/v0/models" in str(request.url):
            return _v0_models([{"id": "laguna-xs-2.1", "state": "not-loaded"}])
        return _v1_models(["laguna-xs-2.1"])

    registry = registry_with_transport(httpx.MockTransport(handler))
    app.dependency_overrides[get_model_registry] = lambda: registry
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            status = await client.get("/api/runtime/status")
    finally:
        app.dependency_overrides.clear()

    assert status.status_code == 200
    body = status.json()
    assert body["state"] == "unconfigured"
    assert body["error"] == "Local model server is running — load a model"


@pytest.mark.asyncio
async def test_runtime_status_disconnected_without_selection() -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("Connection refused", request=request)

    registry = registry_with_transport(httpx.MockTransport(handler))
    app.dependency_overrides[get_model_registry] = lambda: registry
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            status = await client.get("/api/runtime/status")
    finally:
        app.dependency_overrides.clear()

    assert status.status_code == 200
    body = status.json()
    assert body["state"] == "unavailable"
    assert body["error_code"] == "disconnected"


@pytest.mark.asyncio
async def test_runtime_health_skips_probes_while_generation_in_flight() -> None:
    probes = {"v0": 0, "v1": 0}
    release = asyncio.Event()

    async def handler(request: httpx.Request) -> httpx.Response:
        url = str(request.url)
        if "/api/v0/models" in url:
            probes["v0"] += 1
            return _v0_models([{"id": "qwen/qwen3.6-35b-a3b", "state": "loaded"}])
        if request.url.path.endswith("/models"):
            probes["v1"] += 1
            return _v1_models(["qwen/qwen3.6-35b-a3b"])
        if request.url.path.endswith("/chat/completions"):
            await release.wait()
            return httpx.Response(
                200,
                json={
                    "choices": [{"message": {"content": "ok"}, "finish_reason": "stop"}],
                    "usage": {},
                },
            )
        raise AssertionError(f"unexpected request {url}")

    registry = registry_with_transport(httpx.MockTransport(handler))
    await registry.runtime_health()

    provider = registry.provider_for_selection()
    generation = asyncio.create_task(
        provider.complete(
            ChatCompletionRequest(
                model="qwen/qwen3.6-35b-a3b",
                messages=[ChatMessage(role="user", content="hello")],
            )
        )
    )
    for _ in range(50):
        await asyncio.sleep(0)
        if isinstance(provider, LMStudioProvider) and provider.is_generating:
            break
    assert isinstance(provider, LMStudioProvider)
    assert provider.is_generating
    # Let the in-flight completion finish its own pre-request load probe.
    await asyncio.sleep(0)
    probes_while_generating = dict(probes)

    health = await registry.runtime_health()
    assert health.state == "connected"
    assert health.selected_model == "qwen/qwen3.6-35b-a3b"
    assert probes == probes_while_generating

    release.set()
    await generation


@pytest.mark.asyncio
async def test_runtime_health_skips_redundant_test_when_already_connected() -> None:
    calls = {"v0": 0, "v1": 0}

    async def handler(request: httpx.Request) -> httpx.Response:
        if "/api/v0/models" in str(request.url):
            calls["v0"] += 1
            return _v0_models(
                [{"id": "laguna-xs-2.1", "state": "loaded", "loaded_context_length": 8192}]
            )
        calls["v1"] += 1
        return _v1_models(["laguna-xs-2.1"])

    registry = registry_with_transport(httpx.MockTransport(handler))
    first = await registry.runtime_health()
    after_first = dict(calls)
    second = await registry.runtime_health()

    assert first.state == "connected"
    assert second.state == "connected"
    assert calls["v0"] == after_first["v0"] + 1
    assert calls["v1"] == after_first["v1"]


@pytest.mark.asyncio
async def test_runtime_health_connected_when_high_context_model_is_loaded() -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        if "/api/v0/models" in str(request.url):
            return _v0_models(
                [
                    {
                        "id": "qwen/qwen3.6-35b-a3b",
                        "state": "loaded",
                        "loaded_context_length": 128000,
                    }
                ]
            )
        return _v1_models(["qwen/qwen3.6-35b-a3b"])

    registry = registry_with_transport(httpx.MockTransport(handler))
    health = await registry.runtime_health()

    assert health.state == "connected"
    assert health.selected_model == "qwen/qwen3.6-35b-a3b"
