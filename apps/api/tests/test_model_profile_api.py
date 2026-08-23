import httpx
import pytest
from httpx import ASGITransport, AsyncClient

from app.api.model_profiles import get_model_registry
from app.main import app
from app.providers.lm_studio import LMStudioProvider
from app.services.model_profiles import ModelProfileRegistry


def registry_with_transport(handler: httpx.AsyncBaseTransport) -> ModelProfileRegistry:
    return ModelProfileRegistry(
        provider_factory=lambda base_url, token: LMStudioProvider(
            base_url=base_url,
            api_token=token,
            client=httpx.AsyncClient(transport=handler),
        )
    )


@pytest.mark.asyncio
async def test_discovers_tests_and_selects_model_without_exposing_token() -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        if "/api/v0/models" in str(request.url):
            return httpx.Response(
                200,
                json={"data": [{"id": "qwen-local", "state": "loaded"}]},
            )
        return httpx.Response(200, json={"data": [{"id": "qwen-local"}]})

    registry = registry_with_transport(httpx.MockTransport(handler))
    app.dependency_overrides[get_model_registry] = lambda: registry
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            discovered = await client.post(
                "/api/model-profiles/discover",
                json={
                    "base_url": "http://127.0.0.1:1234/v1",
                    "api_token": "secret",
                },
            )
            tested = await client.post(
                "/api/model-profiles/test",
                json={"profile_id": discovered.json()["profile"]["id"], "model": "qwen-local"},
            )
            selected = await client.put(
                "/api/runtime/model-selection",
                json={
                    "profile_id": discovered.json()["profile"]["id"],
                    "model": "qwen-local",
                },
            )
            status = await client.get("/api/runtime/status")
    finally:
        app.dependency_overrides.clear()

    assert discovered.status_code == 200
    assert discovered.json()["models"][0]["id"] == "qwen-local"
    assert "secret" not in discovered.text
    assert tested.json()["connected"] is True
    assert selected.json()["model"] == "qwen-local"
    assert status.json()["selected_model"] == "qwen-local"


@pytest.mark.asyncio
async def test_runtime_status_reports_connected_selected_model() -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        if "/api/v0/models" in str(request.url):
            return httpx.Response(
                200,
                json={"data": [{"id": "qwen-local", "state": "loaded"}]},
            )
        return httpx.Response(200, json={"data": [{"id": "qwen-local"}]})

    registry = registry_with_transport(httpx.MockTransport(handler))
    app.dependency_overrides[get_model_registry] = lambda: registry
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            discovered = await client.post(
                "/api/model-profiles/discover",
                json={"base_url": "http://127.0.0.1:1234/v1"},
            )
            profile_id = discovered.json()["profile"]["id"]
            await client.put(
                "/api/runtime/model-selection",
                json={"profile_id": profile_id, "model": "qwen-local"},
            )
            connected = await client.get("/api/runtime/status")
    finally:
        app.dependency_overrides.clear()

    assert connected.status_code == 200
    assert connected.json()["state"] == "connected"
    assert connected.json()["selected_model"] == "qwen-local"


@pytest.mark.asyncio
async def test_runtime_status_reports_unavailable_selected_model() -> None:
    requests = 0

    async def handler(request: httpx.Request) -> httpx.Response:
        nonlocal requests
        requests += 1
        if requests == 1:
            return httpx.Response(200, json={"data": [{"id": "qwen-local"}]})
        raise httpx.ConnectError("Connection refused", request=request)

    registry = registry_with_transport(httpx.MockTransport(handler))
    app.dependency_overrides[get_model_registry] = lambda: registry
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            discovered = await client.post(
                "/api/model-profiles/discover",
                json={"base_url": "http://127.0.0.1:1234/v1"},
            )
            profile_id = discovered.json()["profile"]["id"]
            await client.put(
                "/api/runtime/model-selection",
                json={"profile_id": profile_id, "model": "qwen-local"},
            )
            unavailable = await client.get("/api/runtime/status")
    finally:
        app.dependency_overrides.clear()

    assert unavailable.status_code == 200
    assert unavailable.json()["state"] == "unavailable"
    assert unavailable.json()["error_code"] == "disconnected"


@pytest.mark.asyncio
async def test_rejects_invalid_or_public_model_server_urls() -> None:
    registry = ModelProfileRegistry()
    app.dependency_overrides[get_model_registry] = lambda: registry
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            invalid = await client.post(
                "/api/model-profiles/discover", json={"base_url": "file:///tmp/models"}
            )
            public = await client.post(
                "/api/model-profiles/discover", json={"base_url": "https://example.com/v1"}
            )
            credentialed = await client.post(
                "/api/model-profiles/discover",
                json={"base_url": "http://user:password@127.0.0.1:1234/v1"},
            )
    finally:
        app.dependency_overrides.clear()

    assert invalid.status_code == 422
    assert public.status_code == 422
    assert credentialed.status_code == 422


def test_normalizes_lm_studio_root_url_to_openai_v1() -> None:
    from app.services.model_profiles import validate_base_url

    assert validate_base_url("http://127.0.0.1:1234") == "http://127.0.0.1:1234/v1"
    assert validate_base_url("http://127.0.0.1:1234/") == "http://127.0.0.1:1234/v1"
    assert validate_base_url("http://127.0.0.1:1234/v1") == "http://127.0.0.1:1234/v1"
